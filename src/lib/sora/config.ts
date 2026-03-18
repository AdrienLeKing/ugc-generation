import type { ElevenLabsVoiceSettings, SoraModel, VerticalSize } from "@/lib/sora/types";

export const POLL_INTERVAL_MS = 10_000;

export const DEFAULT_MODEL: SoraModel = "sora-2";
export const DEFAULT_DURATION_SECONDS = 8;
export const DEFAULT_SIZE: VerticalSize = "720x1280";

export const MODEL_OPTIONS: Array<{
  value: SoraModel;
  label: string;
  description: string;
}> = [
  {
    value: "sora-2",
    label: "Sora 2",
    description: "Le choix simple pour generer rapidement un hook face camera.",
  },
  {
    value: "sora-2-pro",
    label: "Sora 2 Pro",
    description: "Plus ambitieux visuellement, utile si vous poussez le rendu du hook.",
  },
];

export const DURATION_OPTIONS = [
  { value: 4, label: "4 secondes" },
  { value: 8, label: "8 secondes" },
  { value: 12, label: "12 secondes" },
] as const;

export const VERTICAL_SIZE_OPTIONS: Array<{
  value: VerticalSize;
  label: string;
  description: string;
}> = [
  {
    value: "720x1280",
    label: "Vertical standard",
    description: "9:16 rapide, pratique pour tester plusieurs versions.",
  },
  {
    value: "1024x1792",
    label: "Vertical détaillé",
    description: "9:16 plus fin, utile pour une version plus poussée.",
  },
];

export const DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2";
export const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
export const DEFAULT_ELEVENLABS_VOICE_SETTINGS: ElevenLabsVoiceSettings = {
  stability: 0.5,
  similarityBoost: 0.8,
  style: 0.3,
  useSpeakerBoost: true,
};
