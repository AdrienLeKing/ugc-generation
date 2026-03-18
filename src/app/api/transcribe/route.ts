import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { getOpenAiApiKey } from "@/lib/sora/env";
import { getAuthUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const exec = promisify(execFile);

const TIKTOK_HOSTS = new Set([
  "www.tiktok.com",
  "tiktok.com",
  "vm.tiktok.com",
  "m.tiktok.com",
]);

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

function parseTiktokUrl(raw: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (!TIKTOK_HOSTS.has(parsed.hostname)) {
    return null;
  }

  return parsed.href;
}

export async function POST(request: Request) {
  await getAuthUser();

  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  const raw = body?.url?.trim();

  if (!raw) {
    return errorResponse("L'URL est requise.", 400);
  }

  const url = parseTiktokUrl(raw);

  if (!url) {
    return errorResponse("Seules les URLs TikTok sont acceptees.", 400);
  }

  const apiKey = getOpenAiApiKey();
  const workDir = await mkdtemp(join(tmpdir(), "tiktok-"));
  const videoPath = join(workDir, "video.mp4");
  const audioPath = join(workDir, "audio.mp3");

  try {
    await exec("yt-dlp", [
      "--no-playlist",
      "--max-filesize", "50m",
      "-f", "mp4/best",
      "-o", videoPath,
      "--",
      url,
    ], { timeout: 60_000 });

    await exec("ffmpeg", [
      "-i", videoPath,
      "-vn",
      "-acodec", "libmp3lame",
      "-q:a", "4",
      "-y",
      audioPath,
    ], { timeout: 30_000 });

    const audioBuffer = await readFile(audioPath);
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("language", "fr");

    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      throw new Error("La transcription Whisper a echoue.");
    }

    const result = (await whisperResponse.json()) as { text: string };

    return NextResponse.json({ text: result.text });
  } catch (error) {
    console.error("[api/transcribe]", error);
    return errorResponse("Echec de la transcription.", 500);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
