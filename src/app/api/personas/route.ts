import { NextResponse } from "next/server";

import { createPersonaFromFormData, listPersonas } from "@/lib/sora/service";
import { getAuthUser } from "@/lib/supabase/server";

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
    const user = await getAuthUser();
    return NextResponse.json({
      items: await listPersonas(user?.id),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    const formData = await request.formData();
    const item = await createPersonaFromFormData(formData, user?.id);

    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
