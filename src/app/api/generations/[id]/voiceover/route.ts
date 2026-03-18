import { NextResponse } from "next/server";

import { generateGenerationVoiceover } from "@/lib/sora/service";
import type { ElevenLabsVoiceSettings } from "@/lib/sora/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Une erreur inconnue est survenue.",
    },
    { status },
  );
}

function parseBooleanLike(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  throw new Error("useSpeakerBoost doit etre un booleen.");
}

function parseVoiceSettings(value: unknown): Partial<ElevenLabsVoiceSettings> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("voiceSettings doit etre un objet.");
  }

  const raw = value as Record<string, unknown>;
  const parsed: Partial<ElevenLabsVoiceSettings> = {};

  if (raw.stability !== undefined) {
    parsed.stability = Number(raw.stability);
  }

  if (raw.similarityBoost !== undefined) {
    parsed.similarityBoost = Number(raw.similarityBoost);
  }

  if (raw.style !== undefined) {
    parsed.style = Number(raw.style);
  }

  if (raw.useSpeakerBoost !== undefined) {
    parsed.useSpeakerBoost = parseBooleanLike(raw.useSpeakerBoost);
  }

  if (raw.speed !== undefined) {
    parsed.speed = Number(raw.speed);
  }

  return parsed;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      text?: string;
      modelId?: string;
      outputFormat?: string;
      voiceSettings?: unknown;
    };

    if (!body.text?.trim()) {
      return errorResponse(new Error("Le texte du voiceover est obligatoire."), 400);
    }

    const result = await generateGenerationVoiceover(id, {
      text: body.text,
      modelId: body.modelId,
      outputFormat: body.outputFormat,
      voiceSettings: parseVoiceSettings(body.voiceSettings),
    });

    return NextResponse.json({
      item: result.record,
      voiceover: {
        url: result.record.voiceoverUrl,
        fileName: result.record.voiceoverFileName,
        contentType: result.contentType,
      },
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
