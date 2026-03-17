import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_MODEL,
  DEFAULT_SIZE,
  DURATION_OPTIONS,
  MAX_BATCH_SIZE,
  VERTICAL_SIZE_OPTIONS,
} from "@/lib/sora/config";
import { readRecord, readRecords, upsertRecord, upsertRecords } from "@/lib/sora/db";
import { hasOpenAiApiKey } from "@/lib/sora/env";
import { normalizeStatus } from "@/lib/sora/mapper";
import { prepareReferenceImage, prepareReferenceImageFromPath } from "@/lib/sora/media";
import { createEditJob, createRemoteVideoJob, downloadRemoteVideo, retrieveRemoteVideoJob } from "@/lib/sora/openai";
import { uploadImage, uploadVideo } from "@/lib/sora/storage";
import type { CreateGenerationInput, GenerationRecord, RemoteVideoJob, SoraModel, VerticalSize } from "@/lib/sora/types";
import { clamp, nowIsoString, toIsoTimestamp } from "@/lib/sora/utils";

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
      remoteJob.progress_percent ??
      (remoteJob.status === "completed" ? 100 : 0),
    errorMessage: remoteJob.error?.message,
    updatedAt: nowIsoString(),
    remoteCreatedAt: toIsoTimestamp(remoteJob.created_at) ?? existing.remoteCreatedAt,
    remoteCompletedAt: toIsoTimestamp(remoteJob.completed_at),
    remoteExpiresAt: toIsoTimestamp(remoteJob.expires_at),
  };
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

export async function createGenerations(input: CreateGenerationInput) {
  const prompt = input.prompt.trim();
  const model = input.model || DEFAULT_MODEL;
  const seconds = input.seconds || DEFAULT_DURATION_SECONDS;
  const size = input.size || DEFAULT_SIZE;
  const count = clamp(Math.trunc(input.count || 1), 1, MAX_BATCH_SIZE);

  if (!prompt) {
    throw new Error("Le prompt est obligatoire.");
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

  // Upload reference image to Supabase Storage if provided
  let imageUrl: string | undefined;
  const referenceImage = input.referenceImage;
  if (referenceImage) {
    imageUrl = await uploadImage(referenceImage.buffer, referenceImage.fileName);
  }

  const baseRecord = {
    prompt,
    model,
    seconds,
    size,
    inputMode: referenceImage ? ("text_plus_image" as const) : ("text" as const),
    inputImageUrl: imageUrl,
    inputImageOriginalName: referenceImage?.originalName,
    inputImageWidth: referenceImage?.width,
    inputImageHeight: referenceImage?.height,
    videoUrl: undefined,
    videoFileName: undefined,
    createdAt: nowIsoString(),
    remoteCreatedAt: undefined,
    remoteCompletedAt: undefined,
    remoteExpiresAt: undefined,
    sourceVideoId: undefined,
    editPrompt: undefined,
  };

  const createdJobs = await Promise.all(
    Array.from({ length: count }, async () => {
      const remoteJob = await createRemoteVideoJob({
        prompt,
        model,
        seconds,
        size,
        referenceImage,
      });

      return mapRemoteJobToRecord(remoteJob, {
        id: remoteJob.id,
        ...baseRecord,
      });
    }),
  );

  await upsertRecords(createdJobs);
  return createdJobs.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createGenerationsFromFormData(formData: FormData) {
  const prompt = String(formData.get("prompt") || "");
  const model = String(formData.get("model") || DEFAULT_MODEL);
  const seconds = Number(formData.get("seconds") || DEFAULT_DURATION_SECONDS);
  const size = String(formData.get("size") || DEFAULT_SIZE);
  const count = Number(formData.get("count") || 1);
  const maybeFile = formData.get("referenceImage");
  const referenceImage =
    maybeFile instanceof File && maybeFile.size > 0 && isSupportedSize(size)
      ? await prepareReferenceImage(maybeFile, size)
      : undefined;

  return createGenerations({
    prompt,
    model: isSupportedModel(model) ? model : DEFAULT_MODEL,
    seconds,
    size: isSupportedSize(size) ? size : DEFAULT_SIZE,
    count,
    referenceImage,
  });
}

export async function createGenerationsFromCli(input: {
  prompt: string;
  model?: string;
  seconds?: number;
  size?: string;
  count?: number;
  imagePath?: string;
}) {
  const requestedSize = input.size;
  const requestedModel = input.model;
  const size: VerticalSize = requestedSize && isSupportedSize(requestedSize) ? requestedSize : DEFAULT_SIZE;
  const model: SoraModel = requestedModel && isSupportedModel(requestedModel) ? requestedModel : DEFAULT_MODEL;
  const referenceImage = input.imagePath ? await prepareReferenceImageFromPath(input.imagePath, size) : undefined;

  return createGenerations({
    prompt: input.prompt,
    model,
    seconds: input.seconds ?? DEFAULT_DURATION_SECONDS,
    size,
    count: input.count ?? 1,
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
    sourceVideoId: source.id,
    editPrompt,
  });

  await upsertRecord(newRecord);
  return newRecord;
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

  await upsertRecord(withVideo);
  return withVideo;
}

export async function listGenerations(options?: { refresh?: boolean }) {
  const records = await readRecords();

  if (!options?.refresh || !hasOpenAiApiKey()) {
    return records;
  }

  const activeRecords = records.filter((record) => record.status === "queued" || record.status === "in_progress");

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

export async function getDashboardState() {
  return {
    envReady: hasOpenAiApiKey(),
    records: await listGenerations({ refresh: true }),
  };
}
