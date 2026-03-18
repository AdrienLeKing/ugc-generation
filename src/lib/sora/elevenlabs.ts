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
  let rawBody: string | undefined;
  try {
    rawBody = await response.text();
    const payload = JSON.parse(rawBody) as ElevenLabsErrorPayload;

    if (Array.isArray(payload.detail)) {
      const message = payload.detail
        .map((entry) => {
          const loc = (entry as Record<string, unknown>).loc;
          const prefix = Array.isArray(loc) ? `${loc.join(".")}: ` : "";
          return `${prefix}${entry.msg?.trim() ?? ""}`;
        })
        .filter(Boolean)
        .join("; ");

      return message || response.statusText;
    }

    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }

    if (typeof payload.detail === "object" && payload.detail !== null && !Array.isArray(payload.detail)) {
      const obj = payload.detail as Record<string, unknown>;
      const msg = typeof obj.message === "string" ? obj.message : "";
      const status = typeof obj.status === "string" ? obj.status : "";
      if (msg || status) {
        return [status, msg].filter(Boolean).join(": ");
      }
    }

    if (payload.message?.trim()) {
      return payload.message;
    }
  } catch {
    // JSON parsing failed — log raw body for debugging
  }

  if (rawBody) {
    console.error(`[elevenlabs] HTTP ${response.status} raw response:`, rawBody.slice(0, 500));
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
  const safeName = input.name.slice(0, 50);
  const formData = new FormData();
  formData.set("name", safeName);

  if (input.description) {
    formData.set("description", input.description.slice(0, 200));
  }

  if (input.labels && Object.keys(input.labels).length > 0) {
    // ElevenLabs enforces a 50-character limit per label key AND value.
    const truncatedLabels = Object.fromEntries(
      Object.entries(input.labels).map(([key, value]) => [key.slice(0, 50), value.slice(0, 50)]),
    );
    formData.set("labels", JSON.stringify(truncatedLabels));
  }

  if (input.removeBackgroundNoise !== undefined) {
    formData.set("remove_background_noise", String(input.removeBackgroundNoise));
  }

  const bytes = new Uint8Array(
    input.audio.buffer.buffer as ArrayBuffer,
    input.audio.buffer.byteOffset,
    input.audio.buffer.byteLength,
  );
  const blob = new Blob([bytes], { type: input.audio.mimeType });

  console.log(`[elevenlabs] createVoiceClone: name="${input.name}" (${input.name.length} chars), labels=${JSON.stringify(input.labels)}, buffer=${input.audio.buffer.byteLength}b, blob=${blob.size}b, mime=${input.audio.mimeType}, file=${input.audio.fileName}`);

  formData.append("files", blob, input.audio.fileName);

  console.error(`[elevenlabs] >>> CALLING /voices/add name="${safeName}" labels=${formData.get("labels")}`);

  const response = await fetch(`${ELEVENLABS_API_BASE_URL}/voices/add`, {
    method: "POST",
    headers: {
      "xi-api-key": getElevenLabsApiKey(),
    },
    body: formData,
  });

  if (!response.ok) {
    const errorMsg = await parseErrorMessage(response);
    console.error(`[elevenlabs] <<< ERREUR: ${errorMsg}`);
    throw new Error(errorMsg);
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
