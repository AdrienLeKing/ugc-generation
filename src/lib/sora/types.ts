export type SoraModel = "sora-2" | "sora-2-pro";

export type VerticalSize = "720x1280" | "1024x1792";

export type GenerationStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "unknown";

export type InputMode = "text" | "text_plus_image";

export type ElevenLabsVoiceSettings = {
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
  speed?: number;
};

export type GenerationRecord = {
  id: string;
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
  hookAudioUrl?: string;
  hookAudioFileName?: string;
  elevenlabsVoiceId?: string;
  elevenlabsVoiceName?: string;
  voiceoverUrl?: string;
  voiceoverFileName?: string;
  voiceoverScript?: string;
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
};

export type GenerationRow = {
  id: string;
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
  hook_audio_url: string | null;
  hook_audio_file_name: string | null;
  elevenlabs_voice_id: string | null;
  elevenlabs_voice_name: string | null;
  voiceover_url: string | null;
  voiceover_file_name: string | null;
  voiceover_script: string | null;
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
  model: SoraModel;
  seconds: number;
  referenceImage: PreparedImage;
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
