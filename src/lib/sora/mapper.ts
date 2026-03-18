import type {
  ApprovalStatus,
  AsyncAssetStatus,
  DemoAsset,
  DemoAssetRow,
  GenerationRecord,
  GenerationRow,
  GenerationStatus,
} from "@/lib/sora/types";

export function normalizeStatus(value: string | undefined): GenerationStatus {
  if (value === "queued" || value === "in_progress" || value === "completed" || value === "failed") {
    return value;
  }
  return "unknown";
}

function normalizeApprovalStatus(value: string | null | undefined): ApprovalStatus {
  if (value === "approved" || value === "rejected") {
    return value;
  }

  return "draft";
}

function normalizeAsyncStatus(value: string | null | undefined): AsyncAssetStatus {
  if (value === "processing" || value === "ready" || value === "failed") {
    return value;
  }

  return "idle";
}

export function toRecord(row: GenerationRow): GenerationRecord {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    prompt: row.prompt,
    spokenText: row.spoken_text ?? undefined,
    sceneDescription: row.scene_description ?? undefined,
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
    approvalStatus: normalizeApprovalStatus(row.approval_status),
    approvedAt: row.approved_at ?? undefined,
    voiceCloneStatus: normalizeAsyncStatus(row.voice_clone_status),
    hookAudioUrl: row.hook_audio_url ?? undefined,
    hookAudioFileName: row.hook_audio_file_name ?? undefined,
    elevenlabsVoiceId: row.elevenlabs_voice_id ?? undefined,
    elevenlabsVoiceName: row.elevenlabs_voice_name ?? undefined,
    selectedDemoId: row.selected_demo_id ?? undefined,
    demoScriptDraft: row.demo_script_draft ?? undefined,
    voiceoverUrl: row.voiceover_url ?? undefined,
    voiceoverFileName: row.voiceover_file_name ?? undefined,
    voiceoverScript: row.voiceover_script ?? undefined,
    finalVideoStatus: normalizeAsyncStatus(row.final_video_status),
    finalVideoUrl: row.final_video_url ?? undefined,
    finalVideoFileName: row.final_video_file_name ?? undefined,
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
    user_id: record.userId ?? null,
    prompt: record.prompt,
    spoken_text: record.spokenText ?? null,
    scene_description: record.sceneDescription ?? null,
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
    approval_status: record.approvalStatus,
    approved_at: record.approvedAt ?? null,
    voice_clone_status: record.voiceCloneStatus,
    hook_audio_url: record.hookAudioUrl ?? null,
    hook_audio_file_name: record.hookAudioFileName ?? null,
    elevenlabs_voice_id: record.elevenlabsVoiceId ?? null,
    elevenlabs_voice_name: record.elevenlabsVoiceName ?? null,
    selected_demo_id: record.selectedDemoId ?? null,
    demo_script_draft: record.demoScriptDraft ?? null,
    voiceover_url: record.voiceoverUrl ?? null,
    voiceover_file_name: record.voiceoverFileName ?? null,
    voiceover_script: record.voiceoverScript ?? null,
    final_video_status: record.finalVideoStatus,
    final_video_url: record.finalVideoUrl ?? null,
    final_video_file_name: record.finalVideoFileName ?? null,
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

export function toDemoAsset(row: DemoAssetRow): DemoAsset {
  return {
    id: row.id,
    name: row.name,
    videoUrl: row.video_url,
    videoFileName: row.video_file_name,
    defaultScript: row.default_script,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDemoAssetRow(asset: DemoAsset): Omit<DemoAssetRow, "updated_at"> {
  return {
    id: asset.id,
    name: asset.name,
    video_url: asset.videoUrl,
    video_file_name: asset.videoFileName,
    default_script: asset.defaultScript,
    thumbnail_url: asset.thumbnailUrl ?? null,
    duration_seconds: asset.durationSeconds ?? null,
    created_at: asset.createdAt,
  };
}
