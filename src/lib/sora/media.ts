import { writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { getGeneratedDirectory, getUploadsDirectory } from "@/lib/sora/store";
import type { PreparedReferenceImage, VerticalSize } from "@/lib/sora/types";
import { sanitizeFileName } from "@/lib/sora/utils";

function parseSize(size: VerticalSize) {
  const [width, height] = size.split("x").map(Number);
  return { width, height };
}

export async function prepareReferenceImage(file: File, size: VerticalSize) {
  const sourceBuffer = Buffer.from(await file.arrayBuffer());
  const { width, height } = parseSize(size);

  const normalizedBuffer = await sharp(sourceBuffer)
    .rotate()
    .resize(width, height, {
      fit: "cover",
      position: "attention",
    })
    .png()
    .toBuffer();

  const safeBaseName = sanitizeFileName(file.name.replace(/\.[^.]+$/, "")) || "reference";
  const fileName = `${Date.now()}-${safeBaseName}-${width}x${height}.png`;
  const absolutePath = path.join(getUploadsDirectory(), fileName);
  await writeFile(absolutePath, normalizedBuffer);

  const prepared: PreparedReferenceImage = {
    buffer: normalizedBuffer,
    mimeType: "image/png",
    originalName: file.name,
    localUrl: `/uploads/${fileName}`,
    width,
    height,
  };

  return prepared;
}

export async function prepareReferenceImageFromPath(filePath: string, size: VerticalSize) {
  const { width, height } = parseSize(size);
  const fileName = path.basename(filePath);
  const normalizedBuffer = await sharp(filePath)
    .rotate()
    .resize(width, height, {
      fit: "cover",
      position: "attention",
    })
    .png()
    .toBuffer();

  const safeBaseName = sanitizeFileName(fileName.replace(/\.[^.]+$/, "")) || "reference";
  const storedFileName = `${Date.now()}-${safeBaseName}-${width}x${height}.png`;
  const absolutePath = path.join(getUploadsDirectory(), storedFileName);
  await writeFile(absolutePath, normalizedBuffer);

  return {
    buffer: normalizedBuffer,
    mimeType: "image/png",
    originalName: fileName,
    localUrl: `/uploads/${storedFileName}`,
    width,
    height,
  } satisfies PreparedReferenceImage;
}

export async function saveGeneratedVideo(videoId: string, arrayBuffer: ArrayBuffer) {
  const fileName = `${videoId}.mp4`;
  const absolutePath = path.join(getGeneratedDirectory(), fileName);
  await writeFile(absolutePath, Buffer.from(arrayBuffer));

  return {
    fileName,
    localUrl: `/generated/${fileName}`,
  };
}
