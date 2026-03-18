import { NextResponse } from "next/server";

import { POLL_INTERVAL_MS } from "@/lib/sora/config";
import { createGenerationsFromFormData, getDashboardState } from "@/lib/sora/service";
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
    const dashboard = await getDashboardState(user?.id);

    return NextResponse.json({
      envReady: dashboard.envReady,
      elevenLabsReady: dashboard.elevenLabsReady,
      pollIntervalMs: POLL_INTERVAL_MS,
      items: dashboard.records,
      backendError: dashboard.backendError,
      user: user ? { email: user.email } : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    const formData = await request.formData();
    const created = await createGenerationsFromFormData(formData, user?.id);

    return NextResponse.json({
      items: created,
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
