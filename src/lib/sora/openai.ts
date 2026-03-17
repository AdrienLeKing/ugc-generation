import type { RemoteVideoJob } from "@/lib/sora/types";
import { getOpenAiApiKey } from "@/lib/sora/env";

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";

async function parseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: {
        message?: string;
      };
    };

    return payload.error?.message || response.statusText;
  } catch {
    return response.statusText;
  }
}

async function openAiJsonRequest(pathname: string, init?: RequestInit) {
  const response = await fetch(`${OPENAI_API_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as RemoteVideoJob;
}

export async function createRemoteVideoJob(input: {
  prompt: string;
  model: string;
  seconds: number;
  size: string;
  referenceImage?: {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  };
}) {
  const formData = new FormData();
  formData.set("prompt", input.prompt);
  formData.set("model", input.model);
  formData.set("seconds", String(input.seconds));
  formData.set("size", input.size);

  if (input.referenceImage) {
    const blob = new Blob([new Uint8Array(input.referenceImage.buffer)], {
      type: input.referenceImage.mimeType,
    });

    formData.set("input_reference", blob, input.referenceImage.originalName);
  }

  const response = await fetch(`${OPENAI_API_BASE_URL}/videos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as RemoteVideoJob;
}

export async function retrieveRemoteVideoJob(videoId: string) {
  return openAiJsonRequest(`/videos/${videoId}`);
}

export async function downloadRemoteVideo(videoId: string) {
  const response = await fetch(`${OPENAI_API_BASE_URL}/videos/${videoId}/content`, {
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return response.arrayBuffer();
}

export async function createEditJob(sourceVideoId: string, prompt: string) {
  const response = await fetch(`${OPENAI_API_BASE_URL}/videos/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video: { id: sourceVideoId },
      prompt,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as RemoteVideoJob;
}
