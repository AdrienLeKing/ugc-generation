export type SoraModel = "sora-2" | "sora-2-pro";

export type VerticalSize = "720x1280" | "1024x1792";

export type GenerationStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "unknown";

export type InputMode = "text" | "text_plus_image";

export type GenerationRecord = {
  id: string;
  prompt: string;
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
  localVideoUrl?: string;
  localVideoFileName?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  remoteCreatedAt?: string;
  remoteCompletedAt?: string;
  remoteExpiresAt?: string;
};

export type PreparedReferenceImage = {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  localUrl: string;
  width: number;
  height: number;
};

export type CreateGenerationInput = {
  prompt: string;
  model: SoraModel;
  seconds: number;
  size: VerticalSize;
  count: number;
  referenceImage?: PreparedReferenceImage;
};

export type RemoteVideoJob = {
  id: string;
  status?: string;
  progress_percent?: number;
  created_at?: number | string;
  completed_at?: number | string;
  expires_at?: number | string;
  error?: {
    message?: string;
  };
};
