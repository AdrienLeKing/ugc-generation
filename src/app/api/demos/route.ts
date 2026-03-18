import { NextResponse } from "next/server";

import { createDemoAssetFromFormData, listDemoLibrary } from "@/lib/sora/service";

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

export async function GET() {
  try {
    return NextResponse.json({
      items: await listDemoLibrary(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const item = await createDemoAssetFromFormData(formData);

    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
