import type { GenerationRecord, GenerationRow, GenerationStatus } from "@/lib/sora/types";

export function normalizeStatus(value: string | undefined): GenerationStatus {
  if (value === "queued" || value === "in_progress" || value === "completed" || value === "failed") {
    return value;
  }
  return "unknown";
}

export function toRecord(row: GenerationRow): GenerationRecord {
  return {
    id: row.id,
    prompt: row.prompt,
    model: row.model as GenerationRecord["model"],
    seconds: row.seconds,
    size: row.size as GenerationRecord["size"],
    status: normalizeStatus(row.status),
    progressPercent: row.progress_percent,
    inputMode: row.input_mode as GenerationRecord["inputMode"],
    inputImageUrl: row.input_image_url ?? undefined,
    inputImageOriginalName: row.input_image_original_name ?? undefined,
    inputImageWidth: row.input_image_width ?? undefined,
    inputImageHeight: row.input_image_height ?? undefined,
    hookAudioUrl: row.hook_audio_url ?? undefined,
    hookAudioFileName: row.hook_audio_file_name ?? undefined,
    elevenlabsVoiceId: row.elevenlabs_voice_id ?? undefined,
    elevenlabsVoiceName: row.elevenlabs_voice_name ?? undefined,
    voiceoverUrl: row.voiceover_url ?? undefined,
    voiceoverFileName: row.voiceover_file_name ?? undefined,
    voiceoverScript: row.voiceover_script ?? undefined,
    videoUrl: row.video_url ?? undefined,
    videoFileName: row.video_file_name ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    remoteCreatedAt: row.remote_created_at ?? undefined,
    remoteCompletedAt: row.remote_completed_at ?? undefined,
    remoteExpiresAt: row.remote_expires_at ?? undefined,
    sourceVideoId: row.source_video_id ?? undefined,
    editPrompt: row.edit_prompt ?? undefined,
  };
}

export function toDbRow(record: GenerationRecord): Omit<GenerationRow, "updated_at"> {
  return {
    id: record.id,
    prompt: record.prompt,
    model: record.model,
    seconds: record.seconds,
    size: record.size,
    status: record.status,
    progress_percent: record.progressPercent,
    input_mode: record.inputMode,
    input_image_url: record.inputImageUrl ?? null,
    input_image_original_name: record.inputImageOriginalName ?? null,
    input_image_width: record.inputImageWidth ?? null,
    input_image_height: record.inputImageHeight ?? null,
    hook_audio_url: record.hookAudioUrl ?? null,
    hook_audio_file_name: record.hookAudioFileName ?? null,
    elevenlabs_voice_id: record.elevenlabsVoiceId ?? null,
    elevenlabs_voice_name: record.elevenlabsVoiceName ?? null,
    voiceover_url: record.voiceoverUrl ?? null,
    voiceover_file_name: record.voiceoverFileName ?? null,
    voiceover_script: record.voiceoverScript ?? null,
    video_url: record.videoUrl ?? null,
    video_file_name: record.videoFileName ?? null,
    error_message: record.errorMessage ?? null,
    created_at: record.createdAt,
    remote_created_at: record.remoteCreatedAt ?? null,
    remote_completed_at: record.remoteCompletedAt ?? null,
    remote_expires_at: record.remoteExpiresAt ?? null,
    source_video_id: record.sourceVideoId ?? null,
    edit_prompt: record.editPrompt ?? null,
  };
}
