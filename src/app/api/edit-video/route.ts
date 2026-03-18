import { NextResponse } from "next/server";

import { createEditJob, retrieveRemoteVideoJob } from "@/lib/sora/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/edit-video
 *
 * Edit a Sora video by ID (JSON):
 *   - videoId: string (required) — Sora generation ID
 *   - prompt: string (required) — what to change
 *
 * Returns the job immediately. Poll GET /api/edit-video?id=<jobId> to check status.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      videoId?: string;
      prompt?: string;
    };

    if (!body.videoId?.trim()) {
      return errorResponse("Le champ 'videoId' est obligatoire.");
    }

    if (!body.prompt?.trim()) {
      return errorResponse("Le champ 'prompt' est obligatoire.");
    }

    const job = await createEditJob(body.videoId, body.prompt);

    return NextResponse.json({
      id: job.id,
      status: job.status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}

/**
 * GET /api/edit-video?id=<jobId>
 *
 * Returns the job status. When completed, download via /api/edit-video/download?id=<jobId>.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("id");

    if (!jobId) {
      return errorResponse("Le parametre 'id' est obligatoire.");
    }

    const job = await retrieveRemoteVideoJob(jobId);

    const result: Record<string, unknown> = {
      id: job.id,
      status: job.status,
    };

    if (job.status === "completed") {
      result.message = `Video prete. Telecharger: GET /api/edit-video/download?id=${jobId}`;
    }

    if (job.status === "failed") {
      result.error = "Le rendu a echoue.";
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
