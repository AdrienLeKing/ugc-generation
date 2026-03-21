export type SoraModel = "sora-2" | "sora-2-pro";

export type VerticalSize = "720x1280" | "1024x1792";

export type GenerationStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "unknown";

export type InputMode = "text" | "text_plus_image";
export type ApprovalStatus = "draft" | "approved" | "rejected";
export type AsyncAssetStatus = "idle" | "processing" | "ready" | "failed";

export type ElevenLabsVoiceSettings = {
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
  speed?: number;
};

export type GenerationRecord = {
  id: string;
  userId?: string;
  prompt: string;
  spokenText?: string;
  sceneDescription?: string;
  model: SoraModel;
  seconds: number;
  size: VerticalSize;
  status: GenerationStatus;
  progressPercent: number;
  inputMode: InputMode;
  inputImageUrl?: string;
  inputImageOriginalName?: string;
  inputImageWidth?: number;
  inputImageHeight?: number;
  approvalStatus: ApprovalStatus;
  approvedAt?: string;
  voiceCloneStatus: AsyncAssetStatus;
  hookAudioUrl?: string;
  hookAudioFileName?: string;
  elevenlabsVoiceId?: string;
  elevenlabsVoiceName?: string;
  selectedDemoId?: string;
  demoScriptDraft?: string;
  voiceoverUrl?: string;
  voiceoverFileName?: string;
  voiceoverScript?: string;
  finalVideoStatus: AsyncAssetStatus;
  finalVideoUrl?: string;
  finalVideoFileName?: string;
  videoUrl?: string;
  videoFileName?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  remoteCreatedAt?: string;
  remoteCompletedAt?: string;
  remoteExpiresAt?: string;
  sourceVideoId?: string;
  editPrompt?: string;
  personaId?: string;
};

export type GenerationRow = {
  id: string;
  user_id: string | null;
  prompt: string;
  spoken_text: string | null;
  scene_description: string | null;
  model: string;
  seconds: number;
  size: string;
  status: string;
  progress_percent: number;
  input_mode: string;
  input_image_url: string | null;
  input_image_original_name: string | null;
  input_image_width: number | null;
  input_image_height: number | null;
  approval_status: string | null;
  approved_at: string | null;
  voice_clone_status: string | null;
  hook_audio_url: string | null;
  hook_audio_file_name: string | null;
  elevenlabs_voice_id: string | null;
  elevenlabs_voice_name: string | null;
  selected_demo_id: string | null;
  demo_script_draft: string | null;
  voiceover_url: string | null;
  voiceover_file_name: string | null;
  voiceover_script: string | null;
  final_video_status: string | null;
  final_video_url: string | null;
  final_video_file_name: string | null;
  video_url: string | null;
  video_file_name: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  remote_created_at: string | null;
  remote_completed_at: string | null;
  remote_expires_at: string | null;
  source_video_id: string | null;
  edit_prompt: string | null;
  persona_id: string | null;
};

export type DemoAsset = {
  id: string;
  name: string;
  videoUrl: string;
  videoFileName: string;
  defaultScript: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  createdAt: string;
  updatedAt: string;
};

export type DemoAssetRow = {
  id: string;
  name: string;
  video_url: string;
  video_file_name: string;
  default_script: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
};

export type Persona = {
  id: string;
  userId?: string;
  name: string;
  photoUrl: string;
  photoFileName: string;
  photoWidth?: number;
  photoHeight?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonaRow = {
  id: string;
  user_id: string | null;
  name: string;
  photo_url: string;
  photo_file_name: string;
  photo_width: number | null;
  photo_height: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PreparedImage = {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  fileName: string;
  width: number;
  height: number;
};

export type CreateGenerationInput = {
  spokenText: string;
  sceneDescription: string;
  shotPresetId?: string;
  scenePresetId?: string;
  useReferenceScene?: boolean;
  count?: number;
  model: SoraModel;
  seconds: number;
  referenceImage?: PreparedImage;
  personaId?: string;
};

export type RemoteVideoJob = {
  id: string;
  status?: string;
  progress?: number;
  progress_percent?: number;
  created_at?: number | string;
  completed_at?: number | string;
  expires_at?: number | string;
  error?: {
    message?: string;
  };
};
