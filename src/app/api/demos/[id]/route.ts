import { NextResponse } from "next/server";

import { updateDemoAssetScript } from "@/lib/sora/service";

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { name?: string; defaultScript?: string };
    const item = await updateDemoAssetScript(id, body);

    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
