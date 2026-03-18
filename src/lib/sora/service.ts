import { extname } from "node:path";

import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  DEFAULT_ELEVENLABS_VOICE_SETTINGS,
  DEFAULT_MODEL,
  DEFAULT_SIZE,
  DURATION_OPTIONS,
  VERTICAL_SIZE_OPTIONS,
} from "@/lib/sora/config";
import { extractAudioFromMp4 } from "@/lib/sora/audio";
import { readRecord, readRecords, upsertRecord, upsertRecords } from "@/lib/sora/db";
import { deleteVoice, getVoice, createVoiceClone, convertTextToSpeech } from "@/lib/sora/elevenlabs";
import { hasElevenLabsApiKey, hasOpenAiApiKey } from "@/lib/sora/env";
import { normalizeStatus } from "@/lib/sora/mapper";
import { prepareReferenceImage, prepareReferenceImageFromPath } from "@/lib/sora/media";
import { createEditJob, createRemoteVideoJob, downloadRemoteVideo, retrieveRemoteVideoJob } from "@/lib/sora/openai";
import { uploadAudio, uploadImage, uploadVideo } from "@/lib/sora/storage";
import type {
  CreateGenerationInput,
  ElevenLabsVoiceSettings,
  GenerationRecord,
  RemoteVideoJob,
  SoraModel,
  VerticalSize,
} from "@/lib/sora/types";
import { nowIsoString, sanitizeFileName, toIsoTimestamp } from "@/lib/sora/utils";

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

function buildHookPrompt(spokenText: string, sceneDescription: string) {
  return [
    "Create a short vertical 9:16 UGC hook video using the provided reference image as the exact identity of the speaking creator.",
    "Keep the face consistent with the reference image and frame the creator speaking directly to camera.",
    `The creator must say exactly this line with clear lip sync and natural speaking rhythm: "${spokenText}"`,
    `Scene, settings, and creative direction: ${sceneDescription}`,
    "Keep the pacing hook-first, realistic, smartphone-native, and focused on the creator delivering the line.",
  ].join("\n");
}

export async function createGenerations(input: CreateGenerationInput) {
  const spokenText = input.spokenText.trim();
  const sceneDescription = input.sceneDescription.trim();
  const model = input.model || DEFAULT_MODEL;
  const seconds = input.seconds || DEFAULT_DURATION_SECONDS;
  const size = DEFAULT_SIZE;
  const referenceImage = input.referenceImage;

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

  if (!referenceImage) {
    throw new Error("La photo de la creatrice est obligatoire.");
  }

  const prompt = buildHookPrompt(spokenText, sceneDescription);
  const imageUrl = await uploadImage(referenceImage.buffer, referenceImage.fileName);
  const baseRecord = {
    prompt,
    spokenText,
    sceneDescription,
    model,
    seconds,
    size,
    inputMode: "text_plus_image" as const,
    inputImageUrl: imageUrl,
    inputImageOriginalName: referenceImage.originalName,
    inputImageWidth: referenceImage.width,
    inputImageHeight: referenceImage.height,
    videoUrl: undefined,
    videoFileName: undefined,
    createdAt: nowIsoString(),
    updatedAt: nowIsoString(),
    remoteCreatedAt: undefined,
    remoteCompletedAt: undefined,
    remoteExpiresAt: undefined,
    sourceVideoId: undefined,
    editPrompt: undefined,
  };

  const remoteJob = await createRemoteVideoJob({
    prompt,
    model,
    seconds,
    size,
    referenceImage,
  });

  const createdJobs = [
    mapRemoteJobToRecord(remoteJob, {
      id: remoteJob.id,
      ...baseRecord,
    }),
  ];
  await upsertRecords(createdJobs);
  return createdJobs.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createGenerationsFromFormData(formData: FormData) {
  const spokenText = String(formData.get("spokenText") || "");
  const sceneDescription = String(formData.get("sceneDescription") || "");
  const model = String(formData.get("model") || DEFAULT_MODEL);
  const seconds = Number(formData.get("seconds") || DEFAULT_DURATION_SECONDS);
  const maybeFile = formData.get("referenceImage");

  if (!(maybeFile instanceof File) || maybeFile.size === 0) {
    throw new Error("La photo de la creatrice est obligatoire.");
  }

  const referenceImage = await prepareReferenceImage(maybeFile, DEFAULT_SIZE);

  return createGenerations({
    spokenText,
    sceneDescription,
    model: isSupportedModel(model) ? model : DEFAULT_MODEL,
    seconds,
    referenceImage,
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

  if (!input.imagePath) {
    throw new Error("Ajoutez --image avec la photo de la creatrice.");
  }

  const referenceImage = await prepareReferenceImageFromPath(input.imagePath, DEFAULT_SIZE);

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
    voiceoverUrl: undefined,
    voiceoverFileName: undefined,
    voiceoverScript: undefined,
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

  const cloneName = input.name?.trim() || `ugc-hook-${generationId}`;
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

  return {
    record,
    voice: await getVoice(record.elevenlabsVoiceId),
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

  const text = input.text.trim();
  if (!text) {
    throw new Error("Le texte du voiceover est obligatoire.");
  }

  const outputFormat = input.outputFormat?.trim() || DEFAULT_ELEVENLABS_OUTPUT_FORMAT;
  const modelId = input.modelId?.trim() || DEFAULT_ELEVENLABS_MODEL;
  const voiceSettings = mergeVoiceSettings(input.voiceSettings);

  const audio = await convertTextToSpeech({
    voiceId: record.elevenlabsVoiceId,
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

  const remoteDeleted = await deleteVoice(record.elevenlabsVoiceId);

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

export async function listGenerations(options?: { refresh?: boolean }) {
  const records = await readRecords();

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

export async function getDashboardState() {
  try {
    return {
      envReady: hasOpenAiApiKey(),
      elevenLabsReady: hasElevenLabsApiKey(),
      records: await listGenerations({ refresh: true }),
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
