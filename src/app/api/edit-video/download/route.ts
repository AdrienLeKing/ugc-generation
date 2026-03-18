import { NextResponse } from "next/server";

import { downloadRemoteVideo } from "@/lib/sora/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/edit-video/download?id=<jobId>
 *
 * Downloads the completed video as an MP4 file.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("id");

    if (!jobId) {
      return NextResponse.json(
        { error: "Le parametre 'id' est obligatoire." },
        { status: 400 },
      );
    }

    const videoBuffer = await downloadRemoteVideo(jobId);

    return new Response(videoBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="edit-${jobId}.mp4"`,
        "Content-Length": String(videoBuffer.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
