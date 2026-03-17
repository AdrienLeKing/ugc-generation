import { NextResponse } from "next/server";

import { editGeneration } from "@/lib/sora/service";

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
    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return errorResponse(new Error("Le prompt d'edition est obligatoire."), 400);
    }

    const record = await editGeneration(id, prompt);

    return NextResponse.json({ item: record });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
