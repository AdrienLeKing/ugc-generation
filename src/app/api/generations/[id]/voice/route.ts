import { NextResponse } from "next/server";

import { cloneGenerationVoice, deleteGenerationVoice, getGenerationVoice } from "@/lib/sora/service";

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

function parseBoolean(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error("Le champ removeBackgroundNoise doit valoir true ou false.");
}

function parseLabels(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error("Le champ labels doit etre un objet JSON valide.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Le champ labels doit etre un objet JSON.");
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, entryValue]) => [key, String(entryValue)]),
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await getGenerationVoice(id);

    return NextResponse.json({
      item: result.record,
      voice: result.voice,
    });
  } catch (error) {
    return errorResponse(error, 404);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const audio = formData.get("audio") ?? formData.get("file") ?? formData.get("files");

    if (!(audio instanceof File) || audio.size === 0) {
      return errorResponse(new Error("Le fichier audio est obligatoire."), 400);
    }

    const result = await cloneGenerationVoice(id, {
      audio: {
        buffer: Buffer.from(await audio.arrayBuffer()),
        mimeType: audio.type,
        originalName: audio.name || "hook-audio",
      },
      name: typeof formData.get("name") === "string" ? String(formData.get("name")) : undefined,
      description: typeof formData.get("description") === "string" ? String(formData.get("description")) : undefined,
      labels: parseLabels(formData.get("labels")),
      removeBackgroundNoise: parseBoolean(
        formData.get("removeBackgroundNoise") ?? formData.get("remove_background_noise"),
      ),
    });

    return NextResponse.json({
      item: result.record,
      voice: result.voice,
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await deleteGenerationVoice(id);

    return NextResponse.json({
      item: result.record,
      remoteDeleted: result.remoteDeleted,
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
