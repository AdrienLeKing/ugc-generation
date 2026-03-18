import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Extract the audio track from an MP4 buffer as a mono MP3 suitable for
 * ElevenLabs voice cloning.
 *
 * Uses ffmpeg under the hood — returns a clean error when the binary is
 * missing so the caller can surface it to the user.
 */
export async function extractAudioFromMp4(mp4Buffer: ArrayBuffer | Buffer): Promise<Buffer> {
  let tempDir: string | undefined;

  try {
    tempDir = await mkdtemp(join(tmpdir(), "ugc-audio-"));
    const inputPath = join(tempDir, "input.mp4");
    const outputPath = join(tempDir, "output.mp3");

    await writeFile(inputPath, Buffer.isBuffer(mp4Buffer) ? mp4Buffer : Buffer.from(mp4Buffer));

    try {
      await execFileAsync("ffmpeg", [
        "-i", inputPath,
        "-vn",              // drop video
        "-ac", "1",         // mono
        "-ar", "44100",     // 44.1 kHz
        "-ab", "128k",      // 128 kbps
        "-f", "mp3",
        "-y",               // overwrite
        outputPath,
      ], { timeout: 60_000 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("ENOENT")) {
        throw new Error(
          "ffmpeg n'est pas installe sur le serveur. Installez-le pour extraire l'audio des videos.",
        );
      }

      throw new Error(`Echec de l'extraction audio: ${message}`);
    }

    return await readFile(outputPath);
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
