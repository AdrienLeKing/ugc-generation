import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_MODEL,
  DEFAULT_SIZE,
  DURATION_OPTIONS,
  MAX_BATCH_SIZE,
  VERTICAL_SIZE_OPTIONS,
} from "@/lib/sora/config";
import { hasOpenAiApiKey } from "@/lib/sora/env";
import { prepareReferenceImage, prepareReferenceImageFromPath, saveGeneratedVideo } from "@/lib/sora/media";
import { createRemoteVideoJob, downloadRemoteVideo, retrieveRemoteVideoJob } from "@/lib/sora/openai";
import { readGenerationRecords, upsertGenerationRecord, upsertGenerationRecords } from "@/lib/sora/store";
import type { CreateGenerationInput, GenerationRecord, GenerationStatus, SoraModel, VerticalSize } from "@/lib/sora/types";
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

function normalizeStatus(value: string | undefined): GenerationStatus {
  if (value === "queued" || value === "in_progress" || value === "completed" || value === "failed") {
    return value;
  }

  return "unknown";
}

function mapRemoteJobToRecord(
  remoteJob: {
    id: string;
    status?: string;
    progress_percent?: number;
    created_at?: number | string;
    completed_at?: number | string;
    expires_at?: number | string;
    error?: {
      message?: string;
    };
  },
  existing: Omit<GenerationRecord, "status" | "progressPercent" | "updatedAt" | "errorMessage">,
) {
  return {
    ...existing,
    status: normalizeStatus(remoteJob.status),
    progressPercent:
      remoteJob.progress_percent ??
      (remoteJob.status === "completed" ? 100 : remoteJob.status === "failed" ? 0 : 0),
    errorMessage: remoteJob.error?.message,
    updatedAt: nowIsoString(),
    remoteCreatedAt: toIsoTimestamp(remoteJob.created_at) ?? existing.remoteCreatedAt,
    remoteCompletedAt: toIsoTimestamp(remoteJob.completed_at),
    remoteExpiresAt: toIsoTimestamp(remoteJob.expires_at),
  } satisfies GenerationRecord;
}

async function ensureGeneratedVideo(record: GenerationRecord) {
  if (record.status !== "completed" || record.localVideoUrl) {
    return record;
  }

  const videoBuffer = await downloadRemoteVideo(record.id);
  const savedVideo = await saveGeneratedVideo(record.id, videoBuffer);

  return {
    ...record,
    localVideoUrl: savedVideo.localUrl,
    localVideoFileName: savedVideo.fileName,
    updatedAt: nowIsoString(),
  } satisfies GenerationRecord;
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

  const referenceImage = input.referenceImage;
  const baseRecord = {
    prompt,
    model,
    seconds,
    size,
    inputMode: referenceImage ? ("text_plus_image" as const) : ("text" as const),
    inputImageUrl: referenceImage?.localUrl,
    inputImageOriginalName: referenceImage?.originalName,
    inputImageWidth: referenceImage?.width,
    inputImageHeight: referenceImage?.height,
    localVideoUrl: undefined,
    localVideoFileName: undefined,
    createdAt: nowIsoString(),
    updatedAt: nowIsoString(),
    remoteCreatedAt: undefined,
    remoteCompletedAt: undefined,
    remoteExpiresAt: undefined,
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

  await upsertGenerationRecords(createdJobs);
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

export async function refreshGeneration(record: GenerationRecord) {
  const remoteJob = await retrieveRemoteVideoJob(record.id);
  const refreshed = mapRemoteJobToRecord(remoteJob, record);
  const withVideoIfNeeded = await ensureGeneratedVideo(refreshed);
  await upsertGenerationRecord(withVideoIfNeeded);
  return withVideoIfNeeded;
}

export async function listGenerations(options?: { refresh?: boolean }) {
  const records = await readGenerationRecords();

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
