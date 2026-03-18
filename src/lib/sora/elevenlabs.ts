import { getElevenLabsApiKey } from "@/lib/sora/env";
import type { ElevenLabsVoiceSettings } from "@/lib/sora/types";

const ELEVENLABS_API_BASE_URL = "https://api.elevenlabs.io/v1";

type ElevenLabsErrorPayload = {
  detail?: string | Array<{ msg?: string }>;
  message?: string;
};

type ElevenLabsVoiceResponse = {
  voice_id: string;
  name?: string;
  description?: string;
  labels?: Record<string, string>;
  preview_url?: string;
  category?: string;
};

export type ElevenLabsVoice = {
  voiceId: string;
  name?: string;
  description?: string;
  labels?: Record<string, string>;
  previewUrl?: string;
  category?: string;
};

async function parseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as ElevenLabsErrorPayload;

    if (Array.isArray(payload.detail)) {
      const message = payload.detail
        .map((entry) => entry.msg?.trim())
        .filter(Boolean)
        .join(" ");

      return message || response.statusText;
    }

    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }

    if (payload.message?.trim()) {
      return payload.message;
    }
  } catch {
    // Ignore JSON parsing failures and fall back to HTTP status text.
  }

  return response.statusText;
}

function mapVoice(response: ElevenLabsVoiceResponse): ElevenLabsVoice {
  return {
    voiceId: response.voice_id,
    name: response.name,
    description: response.description,
    labels: response.labels,
    previewUrl: response.preview_url,
    category: response.category,
  };
}

export async function createVoiceClone(input: {
  name: string;
  audio: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  };
  description?: string;
  labels?: Record<string, string>;
  removeBackgroundNoise?: boolean;
}) {
  const formData = new FormData();
  formData.set("name", input.name);

  if (input.description) {
    formData.set("description", input.description);
  }

  if (input.labels && Object.keys(input.labels).length > 0) {
    formData.set("labels", JSON.stringify(input.labels));
  }

  if (input.removeBackgroundNoise !== undefined) {
    formData.set("remove_background_noise", String(input.removeBackgroundNoise));
  }

  const blob = new Blob([new Uint8Array(input.audio.buffer)], {
    type: input.audio.mimeType,
  });

  formData.append("files", blob, input.audio.fileName);

  const response = await fetch(`${ELEVENLABS_API_BASE_URL}/voices/add`, {
    method: "POST",
    headers: {
      "xi-api-key": getElevenLabsApiKey(),
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return mapVoice((await response.json()) as ElevenLabsVoiceResponse);
}

export async function getVoice(voiceId: string) {
  const response = await fetch(`${ELEVENLABS_API_BASE_URL}/voices/${voiceId}`, {
    headers: {
      "xi-api-key": getElevenLabsApiKey(),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return mapVoice((await response.json()) as ElevenLabsVoiceResponse);
}

export async function deleteVoice(voiceId: string) {
  const response = await fetch(`${ELEVENLABS_API_BASE_URL}/voices/${voiceId}`, {
    method: "DELETE",
    headers: {
      "xi-api-key": getElevenLabsApiKey(),
    },
  });

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return true;
}

export async function convertTextToSpeech(input: {
  voiceId: string;
  text: string;
  modelId: string;
  outputFormat: string;
  voiceSettings?: ElevenLabsVoiceSettings;
}) {
  const searchParams = new URLSearchParams({
    output_format: input.outputFormat,
  });

  const response = await fetch(
    `${ELEVENLABS_API_BASE_URL}/text-to-speech/${input.voiceId}?${searchParams.toString()}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": getElevenLabsApiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: input.text,
        model_id: input.modelId,
        voice_settings: input.voiceSettings
          ? {
              stability: input.voiceSettings.stability,
              similarity_boost: input.voiceSettings.similarityBoost,
              style: input.voiceSettings.style,
              use_speaker_boost: input.voiceSettings.useSpeakerBoost,
              ...(input.voiceSettings.speed === undefined ? {} : { speed: input.voiceSettings.speed }),
            }
          : undefined,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "audio/mpeg",
  };
}
