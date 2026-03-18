import { NextResponse } from "next/server";

import { generateFollowupAudio } from "@/lib/sora/service";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { text?: string };

    if (!body.text?.trim()) {
      return errorResponse(new Error("Le texte de continuation est obligatoire."), 400);
    }

    const result = await generateFollowupAudio(id, { text: body.text });

    return NextResponse.json({
      item: result.record,
      voiceover: {
        url: result.record.voiceoverUrl,
        fileName: result.record.voiceoverFileName,
      },
    });
  } catch (error) {
    console.error("[followup-audio] Erreur:", error);
    return errorResponse(error);
  }
}
