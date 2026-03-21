import { randomUUID } from "node:crypto";
import { extname } from "node:path";

import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  DEFAULT_ELEVENLABS_VOICE_SETTINGS,
  MAX_BATCH_SIZE,
  DEFAULT_MODEL,
  DEFAULT_SIZE,
  DURATION_OPTIONS,
  VERTICAL_SIZE_OPTIONS,
} from "@/lib/sora/config";
import { extractAudioFromMp4 } from "@/lib/sora/audio";
import {
  insertDemoAsset,
  insertPersona,
  readDemoAsset,
  readDemoAssets,
  readPersona,
  readPersonas,
  readRecord,
  readRecords,
  updateDemoAsset,
  updatePersona,
  upsertRecord,
  upsertRecords,
} from "@/lib/sora/db";
import { deleteVoice, getVoice, createVoiceClone, convertTextToSpeech } from "@/lib/sora/elevenlabs";
import { hasElevenLabsApiKey, hasOpenAiApiKey } from "@/lib/sora/env";
import { buildHookPrompt } from "@/lib/sora/hook-presets";
import { normalizeStatus } from "@/lib/sora/mapper";
import { prepareReferenceImage, prepareReferenceImageFromPath, prepareReferenceImageFromUrl } from "@/lib/sora/media";
import { createEditJob, createRemoteVideoJob, downloadRemoteVideo, retrieveRemoteVideoJob } from "@/lib/sora/openai";
import { uploadAudio, uploadDemoVideo, uploadFinalVideo, uploadImage, uploadPersonaPhoto, uploadVideo } from "@/lib/sora/storage";
import type {
  CreateGenerationInput,
  DemoAsset,
  ElevenLabsVoiceSettings,
  GenerationRecord,
  Persona,
  RemoteVideoJob,
  SoraModel,
  VerticalSize,
} from "@/lib/sora/types";
import { nowIsoString, sanitizeFileName, toIsoTimestamp } from "@/lib/sora/utils";
import { concatenateVideos, probeMediaDuration, renderDemoWithVoiceover } from "@/lib/sora/video";

function isSupportedSeconds(seconds: number) {
  return DURATION_OPTIONS.some((option) => option.value === seconds);
}

function isSupportedSize(size: string): size is VerticalSize {
  return VERTICAL_SIZE_OPTIONS.some((option) => option.value === size);
}

function isSupportedModel(model: string): model is SoraModel {
  return model === "sora-2" || model === "sora-2-pro";
}

function mapRemoteJobToRecord(
  remoteJob: RemoteVideoJob,
  existing: Omit<GenerationRecord, "status" | "progressPercent" | "updatedAt" | "errorMessage">,
): GenerationRecord {
  return {
    ...existing,
    status: normalizeStatus(remoteJob.status),
    progressPercent:
      remoteJob.progress ??
      remoteJob.progress_percent ??
      (remoteJob.status === "completed" ? 100 : 0),
    errorMessage: remoteJob.error?.message,
    updatedAt: nowIsoString(),
    remoteCreatedAt: toIsoTimestamp(remoteJob.created_at) ?? existing.remoteCreatedAt,
    remoteCompletedAt: toIsoTimestamp(remoteJob.completed_at),
    remoteExpiresAt: toIsoTimestamp(remoteJob.expires_at),
  };
}

function shouldRefreshRecord(record: GenerationRecord) {
  return record.status === "queued" || record.status === "in_progress" || (record.status === "completed" && !record.videoUrl);
}

async function downloadFileBuffer(url: string, label: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Impossible de telecharger ${label}.`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function preservePersistedVideoFields(record: GenerationRecord): Promise<GenerationRecord> {
  if (record.status !== "completed" || record.videoUrl) {
    return record;
  }

  try {
    const persisted = await readRecord(record.id);

    if (!persisted.videoUrl) {
      return record;
    }

    return {
      ...record,
      videoUrl: persisted.videoUrl,
      videoFileName: persisted.videoFileName,
    };
  } catch {
    return record;
  }
}

async function ensureVideoUploaded(record: GenerationRecord): Promise<GenerationRecord> {
  if (record.status !== "completed" || record.videoUrl) {
    return record;
  }

  const videoBuffer = await downloadRemoteVideo(record.id);
  const videoUrl = await uploadVideo(record.id, videoBuffer);

  return {
    ...record,
    videoUrl,
    videoFileName: `${record.id}.mp4`,
    updatedAt: nowIsoString(),
  };
}

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
]);

function assertElevenLabsReady() {
  if (!hasElevenLabsApiKey()) {
    throw new Error("ELEVENLABS_API_KEY est manquante. Ajoutez-la dans .env.local avant de cloner une voix.");
  }
}

function ensureCompletedGeneration(record: GenerationRecord) {
  if (record.status !== "completed") {
    throw new Error("La generation doit etre terminee avant de cloner une voix.");
  }
}

function resolveAudioFormat(fileName: string, mimeType: string) {
  const existingExtension = extname(fileName).toLowerCase();
  if (existingExtension === ".mp3" || existingExtension === ".wav") {
    return {
      extension: existingExtension.slice(1),
      contentType:
        mimeType ||
        (existingExtension === ".mp3" ? "audio/mpeg" : "audio/wav"),
    };
  }

  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") {
    return {
      extension: "mp3",
      contentType: "audio/mpeg",
    };
  }

  if (SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)) {
    return {
      extension: "wav",
      contentType: "audio/wav",
    };
  }

  throw new Error("Le fichier audio doit etre un MP3 ou un WAV.");
}

function mergeVoiceSettings(settings?: Partial<ElevenLabsVoiceSettings>): ElevenLabsVoiceSettings {
  const merged: ElevenLabsVoiceSettings = {
    ...DEFAULT_ELEVENLABS_VOICE_SETTINGS,
    ...settings,
  };

  if (!Number.isFinite(merged.stability) || merged.stability < 0 || merged.stability > 1) {
    throw new Error("Le parametre stability doit etre compris entre 0 et 1.");
  }

  if (!Number.isFinite(merged.similarityBoost) || merged.similarityBoost < 0 || merged.similarityBoost > 1) {
    throw new Error("Le parametre similarityBoost doit etre compris entre 0 et 1.");
  }

  if (!Number.isFinite(merged.style) || merged.style < 0 || merged.style > 1) {
    throw new Error("Le parametre style doit etre compris entre 0 et 1.");
  }

  if (merged.speed !== undefined && (!Number.isFinite(merged.speed) || merged.speed <= 0)) {
    throw new Error("Le parametre speed doit etre superieur a 0.");
  }

  return merged;
}

function buildHookAudioFileName(generationId: string, originalName: string, mimeType: string) {
  const { extension } = resolveAudioFormat(originalName, mimeType);
  const baseName = sanitizeFileName(originalName.replace(/\.[^.]+$/, "")) || `hook-${generationId}`;
  return `${baseName}-${generationId}.${extension}`;
}

function buildVoiceoverFileName(generationId: string, outputFormat: string) {
  const codec = outputFormat.split("_")[0] || "mp3";
  const extension = codec === "pcm" ? "wav" : codec;
  return `voiceover-${generationId}.${extension}`;
}

export async function createGenerations(input: CreateGenerationInput & { userId?: string }) {
  const spokenText = input.spokenText.trim();
  const sceneDescription = input.sceneDescription.trim();
  const model = input.model || DEFAULT_MODEL;
  const seconds = input.seconds || DEFAULT_DURATION_SECONDS;
  const count = Math.min(Math.max(Math.trunc(input.count || 1), 1), MAX_BATCH_SIZE);
  const size = DEFAULT_SIZE;
  let referenceImage = input.referenceImage;
  const userId = input.userId;
  const personaId = input.personaId;
  const useReferenceScene = Boolean(input.useReferenceScene);

  if (!referenceImage && personaId) {
    const persona = await readPersona(personaId);
    referenceImage = await prepareReferenceImageFromUrl(
      persona.photoUrl,
      persona.photoFileName,
      size,
    );
  }

  if (!spokenText) {
    throw new Error("Le texte prononce est obligatoire.");
  }

  if (!sceneDescription) {
    throw new Error("La description de la scene est obligatoire.");
  }

  if (!isSupportedModel(model)) {
    throw new Error("Modele Sora non pris en charge.");
  }

  if (!isSupportedSeconds(seconds)) {
    throw new Error("Duree non prise en charge. Utilisez 4, 8 ou 12 secondes.");
  }

  if (!isSupportedSize(size)) {
    throw new Error("Format vertical non pris en charge.");
  }

  const prompt = buildHookPrompt({
    spokenText,
    sceneDescription,
    shotPresetId: input.shotPresetId,
    scenePresetId: input.scenePresetId,
    hasReferenceImage: Boolean(referenceImage),
    useReferenceScene,
  });
  const imageUrl = referenceImage ? await uploadImage(referenceImage.buffer, referenceImage.fileName) : undefined;
  const baseRecord = () => ({
    prompt,
    userId,
    spokenText,
    sceneDescription,
    model,
    seconds,
    size,
    inputMode: referenceImage ? ("text_plus_image" as const) : ("text" as const),
    inputImageUrl: imageUrl,
    inputImageOriginalName: referenceImage?.originalName,
    inputImageWidth: referenceImage?.width,
    inputImageHeight: referenceImage?.height,
    approvalStatus: "draft" as const,
    approvedAt: undefined,
    voiceCloneStatus: "idle" as const,
    videoUrl: undefined,
    videoFileName: undefined,
    selectedDemoId: undefined,
    demoScriptDraft: undefined,
    finalVideoStatus: "idle" as const,
    finalVideoUrl: undefined,
    finalVideoFileName: undefined,
    createdAt: nowIsoString(),
    updatedAt: nowIsoString(),
    remoteCreatedAt: undefined,
    remoteCompletedAt: undefined,
    remoteExpiresAt: undefined,
    sourceVideoId: undefined,
    editPrompt: undefined,
    personaId,
  });

  const remoteJobs = await Promise.all(
    Array.from({ length: count }, () =>
      createRemoteVideoJob({
        prompt,
        model,
        seconds,
        size,
        referenceImage,
      }),
    ),
  );

  const createdJobs = remoteJobs.map((remoteJob) =>
    mapRemoteJobToRecord(remoteJob, {
      id: remoteJob.id,
      ...baseRecord(),
    }),
  );
  await upsertRecords(createdJobs);
  return createdJobs.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createGenerationsFromFormData(formData: FormData, userId?: string) {
  const spokenText = String(formData.get("spokenText") || "");
  const sceneDescription = String(formData.get("sceneDescription") || "");
  const shotPresetId = String(formData.get("shotPresetId") || "");
  const scenePresetId = String(formData.get("scenePresetId") || "");
  const useReferenceScene = String(formData.get("useReferenceScene") || "") === "true";
  const count = Number(formData.get("count") || 1);
  const model = String(formData.get("model") || DEFAULT_MODEL);
  const seconds = Number(formData.get("seconds") || DEFAULT_DURATION_SECONDS);
  const maybeFile = formData.get("referenceImage");
  const personaId = String(formData.get("personaId") || "") || undefined;

  const referenceImage =
    maybeFile instanceof File && maybeFile.size > 0
      ? await prepareReferenceImage(maybeFile, DEFAULT_SIZE)
      : undefined;

  return createGenerations({
    spokenText,
    sceneDescription,
    shotPresetId,
    scenePresetId,
    useReferenceScene,
    count,
    model: isSupportedModel(model) ? model : DEFAULT_MODEL,
    seconds,
    referenceImage,
    personaId,
    userId,
  });
}

export async function createGenerationsFromCli(input: {
  spokenText: string;
  sceneDescription: string;
  model?: string;
  seconds?: number;
  imagePath?: string;
}) {
  const requestedModel = input.model;
  const model: SoraModel = requestedModel && isSupportedModel(requestedModel) ? requestedModel : DEFAULT_MODEL;

  const referenceImage = input.imagePath
    ? await prepareReferenceImageFromPath(input.imagePath, DEFAULT_SIZE)
    : undefined;

  return createGenerations({
    spokenText: input.spokenText,
    sceneDescription: input.sceneDescription,
    model,
    seconds: input.seconds ?? DEFAULT_DURATION_SECONDS,
    referenceImage,
  });
}

export async function editGeneration(sourceId: string, editPrompt: string) {
  const source = await readRecord(sourceId);

  if (source.status !== "completed") {
    throw new Error("Seules les generations terminees peuvent etre editees.");
  }

  const remoteJob = await createEditJob(source.id, editPrompt);

  const newRecord = mapRemoteJobToRecord(remoteJob, {
    id: remoteJob.id,
    prompt: source.prompt,
    spokenText: source.spokenText,
    sceneDescription: source.sceneDescription,
    model: source.model,
    seconds: source.seconds,
    size: source.size,
    inputMode: source.inputMode,
    inputImageUrl: source.inputImageUrl,
    inputImageOriginalName: source.inputImageOriginalName,
    inputImageWidth: source.inputImageWidth,
    inputImageHeight: source.inputImageHeight,
    approvalStatus: "draft",
    approvedAt: undefined,
    voiceCloneStatus: "idle",
    videoUrl: undefined,
    videoFileName: undefined,
    createdAt: nowIsoString(),
    remoteCreatedAt: undefined,
    remoteCompletedAt: undefined,
    remoteExpiresAt: undefined,
    hookAudioUrl: undefined,
    hookAudioFileName: undefined,
    elevenlabsVoiceId: undefined,
    elevenlabsVoiceName: undefined,
    selectedDemoId: undefined,
    demoScriptDraft: undefined,
    voiceoverUrl: undefined,
    voiceoverFileName: undefined,
    voiceoverScript: undefined,
    finalVideoStatus: "idle",
    finalVideoUrl: undefined,
    finalVideoFileName: undefined,
    sourceVideoId: source.id,
    editPrompt,
  });

  await upsertRecord(newRecord);
  return newRecord;
}

export async function cloneGenerationVoice(
  generationId: string,
  input: {
    audio: {
      buffer: Buffer;
      mimeType: string;
      originalName: string;
    };
    name?: string;
    description?: string;
    labels?: Record<string, string>;
    removeBackgroundNoise?: boolean;
  },
) {
  assertElevenLabsReady();

  const record = await readRecord(generationId);
  ensureCompletedGeneration(record);

  if (record.elevenlabsVoiceId) {
    throw new Error("Une voix clonee existe deja pour cette generation. Supprimez-la avant d'en creer une nouvelle.");
  }

  if (!input.audio.buffer.length) {
    throw new Error("Le fichier audio est vide.");
  }

  const audioFormat = resolveAudioFormat(input.audio.originalName, input.audio.mimeType);

  const cloneName = (input.name?.trim() || `ugc-hook-${generationId}`).slice(0, 50);
  const description = input.description?.trim() || `Voice clone for generation ${generationId}`;
  const labels = {
    project: "ugc-generation",
    gen_id: generationId.slice(0, 50),
    ...(input.labels ?? {}),
  };

  const voice = await createVoiceClone({
    name: cloneName,
    description,
    labels,
    removeBackgroundNoise: input.removeBackgroundNoise ?? true,
    audio: {
      buffer: input.audio.buffer,
      fileName: input.audio.originalName,
      mimeType: audioFormat.contentType,
    },
  });

  try {
    const hookAudioFileName = buildHookAudioFileName(generationId, input.audio.originalName, audioFormat.contentType);
    const hookAudioUrl = await uploadAudio(
      `audio/hooks/${hookAudioFileName}`,
      input.audio.buffer,
      audioFormat.contentType,
    );

    const updatedRecord: GenerationRecord = {
      ...record,
      hookAudioUrl,
      hookAudioFileName,
      elevenlabsVoiceId: voice.voiceId,
      elevenlabsVoiceName: voice.name ?? cloneName,
      updatedAt: nowIsoString(),
    };

    await upsertRecord(updatedRecord);

    return {
      record: updatedRecord,
      voice,
    };
  } catch (error) {
    try {
      await deleteVoice(voice.voiceId);
    } catch {
      // Best effort cleanup only.
    }

    throw error;
  }
}

export async function getGenerationVoice(generationId: string) {
  assertElevenLabsReady();

  const record = await readRecord(generationId);

  if (!record.elevenlabsVoiceId) {
    throw new Error("Aucune voix clonee n'est associee a cette generation.");
  }

  const voiceId = record.elevenlabsVoiceId;

  return {
    record,
    voice: await getVoice(voiceId),
  };
}

export async function generateGenerationVoiceover(
  generationId: string,
  input: {
    text: string;
    modelId?: string;
    outputFormat?: string;
    voiceSettings?: Partial<ElevenLabsVoiceSettings>;
  },
) {
  assertElevenLabsReady();

  const record = await readRecord(generationId);

  if (!record.elevenlabsVoiceId) {
    throw new Error("Clonez d'abord une voix pour cette generation.");
  }

  const voiceId = record.elevenlabsVoiceId;

  const text = input.text.trim();
  if (!text) {
    throw new Error("Le texte du voiceover est obligatoire.");
  }

  const outputFormat = input.outputFormat?.trim() || DEFAULT_ELEVENLABS_OUTPUT_FORMAT;
  const modelId = input.modelId?.trim() || DEFAULT_ELEVENLABS_MODEL;
  const voiceSettings = mergeVoiceSettings(input.voiceSettings);

  const audio = await convertTextToSpeech({
    voiceId,
    text,
    modelId,
    outputFormat,
    voiceSettings,
  });

  const voiceoverFileName = buildVoiceoverFileName(generationId, outputFormat);
  const voiceoverUrl = await uploadAudio(
    `audio/voiceovers/${voiceoverFileName}`,
    audio.buffer,
    audio.contentType,
  );

  const updatedRecord: GenerationRecord = {
    ...record,
    voiceoverUrl,
    voiceoverFileName,
    voiceoverScript: text,
    updatedAt: nowIsoString(),
  };

  await upsertRecord(updatedRecord);

  return {
    record: updatedRecord,
    contentType: audio.contentType,
  };
}

export async function deleteGenerationVoice(generationId: string) {
  assertElevenLabsReady();

  const record = await readRecord(generationId);

  if (!record.elevenlabsVoiceId) {
    throw new Error("Aucune voix clonee n'est associee a cette generation.");
  }

  const voiceId = record.elevenlabsVoiceId;
  const remoteDeleted = await deleteVoice(voiceId);

  const updatedRecord: GenerationRecord = {
    ...record,
    elevenlabsVoiceId: undefined,
    elevenlabsVoiceName: undefined,
    updatedAt: nowIsoString(),
  };

  await upsertRecord(updatedRecord);

  return {
    record: updatedRecord,
    remoteDeleted,
  };
}

export async function refreshGeneration(record: GenerationRecord): Promise<GenerationRecord> {
  const remoteJob = await retrieveRemoteVideoJob(record.id);
  const refreshed = mapRemoteJobToRecord(remoteJob, record);

  let withVideo: GenerationRecord;
  try {
    withVideo = await ensureVideoUploaded(refreshed);
  } catch {
    // Video download/upload failed — keep status update, retry video on next poll
    withVideo = refreshed;
  }

  const recordToPersist = await preservePersistedVideoFields(withVideo);
  await upsertRecord(recordToPersist);
  return recordToPersist;
}

export async function listGenerations(options?: { refresh?: boolean; userId?: string }) {
  const records = await readRecords(options?.userId);

  if (!options?.refresh || !hasOpenAiApiKey()) {
    return records;
  }

  const activeRecords = records.filter(shouldRefreshRecord);

  const refreshedRecords = await Promise.allSettled(activeRecords.map((record) => refreshGeneration(record)));
  const refreshedById = new Map(
    refreshedRecords
      .filter((result): result is PromiseFulfilledResult<GenerationRecord> => result.status === "fulfilled")
      .map((result) => [result.value.id, result.value]),
  );

  return records
    .map((record) => refreshedById.get(record.id) ?? record)
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function generateFollowupAudio(
  generationId: string,
  input: {
    text: string;
    modelId?: string;
    outputFormat?: string;
    voiceSettings?: Partial<ElevenLabsVoiceSettings>;
  },
) {
  assertElevenLabsReady();

  const text = input.text.trim();
  if (!text) {
    throw new Error("Le texte de continuation est obligatoire.");
  }

  let record = await readRecord(generationId);
  ensureCompletedGeneration(record);

  if (!record.videoUrl) {
    throw new Error("La video de cette generation n'est pas encore disponible.");
  }

  // --- Step 1: Download the MP4 and extract audio ---
  const videoResponse = await fetch(record.videoUrl);
  if (!videoResponse.ok) {
    throw new Error("Impossible de telecharger la video pour extraire l'audio.");
  }
  const mp4Buffer = await videoResponse.arrayBuffer();
  const hookAudioBuffer = await extractAudioFromMp4(mp4Buffer);

  if (hookAudioBuffer.length === 0) {
    throw new Error("L'extraction audio n'a produit aucune donnee. La video ne contient peut-etre pas de piste audio.");
  }

  // --- Step 2: Clone voice from extracted audio ---
  const cloneName = `ugc-followup-${generationId}`;
  let clonedVoiceId: string | undefined;

  try {
    const voice = await createVoiceClone({
      name: cloneName,
      description: `Temporary voice clone for follow-up audio of generation ${generationId}`,
      labels: { project: "ugc-generation", gen_id: generationId.slice(0, 50), type: "followup" },
      removeBackgroundNoise: true,
      audio: {
        buffer: hookAudioBuffer,
        fileName: `hook-${generationId}.mp3`,
        mimeType: "audio/mpeg",
      },
    });

    clonedVoiceId = voice.voiceId;

    // Persist hook audio + voice metadata immediately
    const hookAudioFileName = `hook-${generationId}.mp3`;
    const hookAudioUrl = await uploadAudio(
      `audio/hooks/${hookAudioFileName}`,
      hookAudioBuffer,
      "audio/mpeg",
    );

    record = {
      ...record,
      hookAudioUrl,
      hookAudioFileName,
      elevenlabsVoiceId: voice.voiceId,
      elevenlabsVoiceName: voice.name ?? cloneName,
      updatedAt: nowIsoString(),
    };
    await upsertRecord(record);

    // --- Step 3: Generate TTS from transcript ---
    const outputFormat = input.outputFormat?.trim() || DEFAULT_ELEVENLABS_OUTPUT_FORMAT;
    const modelId = input.modelId?.trim() || DEFAULT_ELEVENLABS_MODEL;
    const voiceSettings = mergeVoiceSettings(input.voiceSettings);

    const audio = await convertTextToSpeech({
      voiceId: voice.voiceId,
      text,
      modelId,
      outputFormat,
      voiceSettings,
    });

    // --- Step 4: Upload voiceover audio ---
    const voiceoverFileName = buildVoiceoverFileName(generationId, outputFormat);
    const voiceoverUrl = await uploadAudio(
      `audio/voiceovers/${voiceoverFileName}`,
      audio.buffer,
      audio.contentType,
    );

    // --- Step 5: Persist voiceover metadata ---
    record = {
      ...record,
      voiceoverUrl,
      voiceoverFileName,
      voiceoverScript: text,
      updatedAt: nowIsoString(),
    };
    await upsertRecord(record);

    // --- Step 6: Cleanup temporary cloned voice ---
    try {
      await deleteVoice(voice.voiceId);
      record = {
        ...record,
        elevenlabsVoiceId: undefined,
        elevenlabsVoiceName: undefined,
        updatedAt: nowIsoString(),
      };
      await upsertRecord(record);
      clonedVoiceId = undefined;
    } catch {
      // Non-critical — voice stays on ElevenLabs but flow is complete
      console.warn(`Nettoyage de la voix clonee ${voice.voiceId} echoue. A supprimer manuellement.`);
    }

    return { record };
  } catch (error) {
    // Cleanup cloned voice on any failure
    if (clonedVoiceId) {
      try {
        await deleteVoice(clonedVoiceId);
      } catch {
        // Best effort cleanup
      }
    }
    throw error;
  }
}

export async function listDemoLibrary() {
  return readDemoAssets();
}

export async function createDemoAssetFromFormData(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const defaultScript = String(formData.get("defaultScript") || "").trim();
  const maybeFile = formData.get("demoVideo");

  if (!name) {
    throw new Error("Le nom de la demo est obligatoire.");
  }

  if (!defaultScript) {
    throw new Error("Le texte par defaut de la demo est obligatoire.");
  }

  if (!(maybeFile instanceof File) || maybeFile.size === 0) {
    throw new Error("La video de demo est obligatoire.");
  }

  const buffer = Buffer.from(await maybeFile.arrayBuffer());
  const fileName = `${Date.now()}-${sanitizeFileName(maybeFile.name) || "demo.mp4"}`;
  const videoUrl = await uploadDemoVideo(fileName, buffer, maybeFile.type || "video/mp4");
  const durationSeconds = await probeMediaDuration(buffer, maybeFile.name);
  const now = nowIsoString();

  const asset: DemoAsset = {
    id: randomUUID(),
    name,
    videoUrl,
    videoFileName: fileName,
    defaultScript,
    durationSeconds,
    createdAt: now,
    updatedAt: now,
  };

  await insertDemoAsset(asset);
  return asset;
}

export async function updateDemoAssetScript(id: string, input: { name?: string; defaultScript?: string }) {
  const asset = await readDemoAsset(id);
  const nextName = input.name?.trim() || asset.name;
  const nextScript = input.defaultScript?.trim() || asset.defaultScript;

  if (!nextName) {
    throw new Error("Le nom de la demo est obligatoire.");
  }

  if (!nextScript) {
    throw new Error("Le texte par defaut de la demo est obligatoire.");
  }

  const updatedAsset: DemoAsset = {
    ...asset,
    name: nextName,
    defaultScript: nextScript,
    updatedAt: nowIsoString(),
  };

  await updateDemoAsset(updatedAsset);
  return updatedAsset;
}

export async function listPersonas(userId?: string) {
  return readPersonas(userId);
}

export async function createPersonaFromFormData(formData: FormData, userId?: string) {
  const name = String(formData.get("name") || "").trim();
  const notes = String(formData.get("notes") || "").trim() || undefined;
  const maybeFile = formData.get("photo");

  if (!name) {
    throw new Error("Le nom de la persona est obligatoire.");
  }

  if (!(maybeFile instanceof File) || maybeFile.size === 0) {
    throw new Error("La photo de la persona est obligatoire.");
  }

  const prepared = await prepareReferenceImage(maybeFile, DEFAULT_SIZE);
  const photoUrl = await uploadPersonaPhoto(prepared.fileName, prepared.buffer, prepared.mimeType);
  const now = nowIsoString();

  const persona: Persona = {
    id: randomUUID(),
    userId,
    name,
    photoUrl,
    photoFileName: prepared.fileName,
    photoWidth: prepared.width,
    photoHeight: prepared.height,
    notes,
    createdAt: now,
    updatedAt: now,
  };

  await insertPersona(persona);
  return persona;
}

export async function updatePersonaDetails(id: string, input: { name?: string; notes?: string }) {
  const existing = await readPersonas();
  const persona = existing.find((p) => p.id === id);

  if (!persona) {
    throw new Error(`Persona introuvable (${id}).`);
  }

  const updated: Persona = {
    ...persona,
    name: input.name?.trim() || persona.name,
    notes: input.notes?.trim() ?? persona.notes,
    updatedAt: nowIsoString(),
  };

  await updatePersona(updated);
  return updated;
}

export async function approveGeneration(generationId: string) {
  assertElevenLabsReady();

  let record = await readRecord(generationId);
  ensureCompletedGeneration(record);

  record = {
    ...record,
    approvalStatus: "approved",
    approvedAt: record.approvedAt ?? nowIsoString(),
    voiceCloneStatus: "processing",
    errorMessage: undefined,
    updatedAt: nowIsoString(),
  };
  await upsertRecord(record);

  try {
    if (!record.videoUrl) {
      throw new Error("La video du hook n'est pas encore disponible.");
    }

    const mp4Buffer = await downloadFileBuffer(record.videoUrl, "la video du hook");
    const hookAudioBuffer = await extractAudioFromMp4(mp4Buffer);

    if (hookAudioBuffer.length === 0) {
      throw new Error("L'extraction audio du hook a echoue.");
    }

    if (record.elevenlabsVoiceId) {
      try {
        await deleteVoice(record.elevenlabsVoiceId);
      } catch {
        // Best effort cleanup before re-cloning.
      }
    }

    const cloneName = `ugc-hook-${generationId}`.slice(0, 50);
    const voice = await createVoiceClone({
      name: cloneName,
      description: `Approved voice clone for generation ${generationId}`,
      labels: { project: "ugc-generation", gen_id: generationId.slice(0, 50), type: "approved_hook" },
      removeBackgroundNoise: true,
      audio: {
        buffer: hookAudioBuffer,
        fileName: `hook-${generationId}.mp3`,
        mimeType: "audio/mpeg",
      },
    });

    const hookAudioFileName = `hook-${generationId}.mp3`;
    const hookAudioUrl = await uploadAudio(`audio/hooks/${hookAudioFileName}`, hookAudioBuffer, "audio/mpeg");

    record = {
      ...record,
      approvalStatus: "approved",
      approvedAt: record.approvedAt ?? nowIsoString(),
      voiceCloneStatus: "ready",
      hookAudioUrl,
      hookAudioFileName,
      elevenlabsVoiceId: voice.voiceId,
      elevenlabsVoiceName: voice.name ?? cloneName,
      updatedAt: nowIsoString(),
    };

    await upsertRecord(record);
    return record;
  } catch (error) {
    record = {
      ...record,
      voiceCloneStatus: "failed",
      errorMessage: error instanceof Error ? error.message : "La validation du hook a echoue.",
      updatedAt: nowIsoString(),
    };
    await upsertRecord(record);
    throw error;
  }
}

export async function finalizeDemoForGeneration(
  generationId: string,
  input: {
    demoId: string;
    scriptText: string;
    modelId?: string;
    outputFormat?: string;
    voiceSettings?: Partial<ElevenLabsVoiceSettings>;
  },
) {
  assertElevenLabsReady();

  const scriptText = input.scriptText.trim();
  if (!scriptText) {
    throw new Error("Le texte de la demo est obligatoire.");
  }

  let record = await readRecord(generationId);
  const demo = await readDemoAsset(input.demoId);

  ensureCompletedGeneration(record);

  if (record.approvalStatus !== "approved") {
    throw new Error("Validez d'abord le hook avant de lancer la demo.");
  }

  if (!record.videoUrl) {
    throw new Error("La video du hook n'est pas disponible.");
  }

  if (record.voiceCloneStatus !== "ready" || !record.elevenlabsVoiceId) {
    throw new Error("La voix clonee du hook n'est pas encore prete.");
  }

  const voiceId = record.elevenlabsVoiceId;

  record = {
    ...record,
    selectedDemoId: demo.id,
    demoScriptDraft: scriptText,
    finalVideoStatus: "processing",
    errorMessage: undefined,
    updatedAt: nowIsoString(),
  };
  await upsertRecord(record);

  try {
    const outputFormat = input.outputFormat?.trim() || DEFAULT_ELEVENLABS_OUTPUT_FORMAT;
    const modelId = input.modelId?.trim() || DEFAULT_ELEVENLABS_MODEL;
    const voiceSettings = mergeVoiceSettings(input.voiceSettings);

    const audio = await convertTextToSpeech({
      voiceId,
      text: scriptText,
      modelId,
      outputFormat,
      voiceSettings,
    });

    const voiceoverFileName = buildVoiceoverFileName(generationId, outputFormat);
    const voiceoverUrl = await uploadAudio(
      `audio/voiceovers/${voiceoverFileName}`,
      audio.buffer,
      audio.contentType,
    );

    const [demoVideoBuffer, hookVideoBuffer] = await Promise.all([
      downloadFileBuffer(demo.videoUrl, "la video de demo"),
      downloadFileBuffer(record.videoUrl!, "la video du hook"),
    ]);

    const voiceDuration = await probeMediaDuration(audio.buffer, voiceoverFileName);
    const demoDuration = demo.durationSeconds ?? await probeMediaDuration(demoVideoBuffer, demo.videoFileName);

    if (voiceDuration > demoDuration) {
      throw new Error("Le voiceover est plus long que la video de demo. Raccourcissez le texte ou choisissez une demo plus longue.");
    }

    const demoWithVoiceBuffer = await renderDemoWithVoiceover({
      demoVideo: {
        buffer: demoVideoBuffer,
        fileName: demo.videoFileName,
      },
      voiceover: {
        buffer: audio.buffer,
        fileName: voiceoverFileName,
      },
      durationSeconds: demoDuration,
    });

    const finalBuffer = await concatenateVideos([
      { buffer: hookVideoBuffer, fileName: record.videoFileName ?? "hook.mp4" },
      { buffer: demoWithVoiceBuffer, fileName: "demo-voiced.mp4" },
    ]);

    const finalVideoFileName = `demo-final-${generationId}-${demo.id}.mp4`;
    const finalVideoUrl = await uploadFinalVideo(finalVideoFileName, finalBuffer);

    record = {
      ...record,
      selectedDemoId: demo.id,
      demoScriptDraft: scriptText,
      voiceoverUrl,
      voiceoverFileName,
      voiceoverScript: scriptText,
      finalVideoStatus: "ready",
      finalVideoUrl,
      finalVideoFileName,
      updatedAt: nowIsoString(),
    };

    await upsertRecord(record);
    return record;
  } catch (error) {
    record = {
      ...record,
      selectedDemoId: demo.id,
      demoScriptDraft: scriptText,
      finalVideoStatus: "failed",
      errorMessage: error instanceof Error ? error.message : "Le rendu final de la demo a echoue.",
      updatedAt: nowIsoString(),
    };
    await upsertRecord(record);
    throw error;
  }
}

export async function getDashboardState(userId?: string) {
  try {
    return {
      envReady: hasOpenAiApiKey(),
      elevenLabsReady: hasElevenLabsApiKey(),
      records: await listGenerations({ refresh: true, userId }),
      backendError: undefined,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Impossible de recuperer les generations.";

    console.error("Erreur chargement dashboard:", error);

    return {
      envReady: hasOpenAiApiKey(),
      elevenLabsReady: hasElevenLabsApiKey(),
      records: [] as GenerationRecord[],
      backendError: message,
    };
  }
}
