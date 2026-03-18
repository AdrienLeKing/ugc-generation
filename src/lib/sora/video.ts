import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function withTempDir<T>(callback: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), "ugc-video-"));

  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function getExtension(fileName: string, fallback: string) {
  const extension = extname(fileName).toLowerCase();
  return extension || fallback;
}

async function runBinary(binary: string, args: string[]) {
  try {
    return await execFileAsync(binary, args, { timeout: 60_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("ENOENT")) {
      throw new Error(`${binary} n'est pas installe sur le serveur.`);
    }

    throw new Error(`Echec ${binary}: ${message}`);
  }
}

export async function probeMediaDuration(buffer: Buffer, fileName: string): Promise<number> {
  return withTempDir(async (dir) => {
    const inputPath = join(dir, `input${getExtension(fileName, ".mp4")}`);
    await writeFile(inputPath, buffer);

    const { stdout } = await runBinary("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ]);

    const duration = Number.parseFloat(stdout.trim());

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Impossible de determiner la duree du media.");
    }

    return duration;
  });
}

export async function renderDemoWithVoiceover(input: {
  demoVideo: {
    buffer: Buffer;
    fileName: string;
  };
  voiceover: {
    buffer: Buffer;
    fileName: string;
  };
  durationSeconds: number;
}): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const videoPath = join(dir, `demo${getExtension(input.demoVideo.fileName, ".mp4")}`);
    const audioPath = join(dir, `voiceover${getExtension(input.voiceover.fileName, ".mp3")}`);
    const outputPath = join(dir, "output.mp4");

    await writeFile(videoPath, input.demoVideo.buffer);
    await writeFile(audioPath, input.voiceover.buffer);

    await runBinary("ffmpeg", [
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-filter_complex",
      `[1:a]apad=whole_dur=${input.durationSeconds}[voice]`,
      "-map",
      "0:v:0",
      "-map",
      "[voice]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-t",
      String(input.durationSeconds),
      "-movflags",
      "+faststart",
      "-y",
      outputPath,
    ]);

    return readFile(outputPath);
  });
}

export async function concatenateVideos(
  segments: { buffer: Buffer; fileName: string }[],
): Promise<Buffer> {
  if (segments.length === 0) {
    throw new Error("Aucun segment video a concatener.");
  }

  if (segments.length === 1) {
    return segments[0].buffer;
  }

  return withTempDir(async (dir) => {
    const inputPaths: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentPath = join(dir, `seg${i}${getExtension(segment.fileName, ".mp4")}`);
      await writeFile(segmentPath, segment.buffer);
      inputPaths.push(segmentPath);
    }

    const listPath = join(dir, "inputs.txt");
    const listContent = inputPaths.map((p) => `file '${p}'`).join("\n");
    await writeFile(listPath, listContent);

    const outputPath = join(dir, "concat.mp4");

    await runBinary("ffmpeg", [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-movflags",
      "+faststart",
      "-y",
      outputPath,
    ]);

    return readFile(outputPath);
  });
}
