import { NextResponse } from "next/server";

import { POLL_INTERVAL_MS } from "@/lib/sora/config";
import { createGenerationsFromFormData, getDashboardState } from "@/lib/sora/service";

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
    const dashboard = await getDashboardState();

    return NextResponse.json({
      envReady: dashboard.envReady,
      pollIntervalMs: POLL_INTERVAL_MS,
      items: dashboard.records,
      backendError: dashboard.backendError,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const created = await createGenerationsFromFormData(formData);

    return NextResponse.json({
      items: created,
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
