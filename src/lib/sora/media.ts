import path from "node:path";

import sharp from "sharp";

import type { PreparedImage, VerticalSize } from "@/lib/sora/types";
import { sanitizeFileName } from "@/lib/sora/utils";

function parseSize(size: VerticalSize) {
  const [width, height] = size.split("x").map(Number);
  return { width, height };
}

export async function cropToVertical(
  source: Buffer,
  size: VerticalSize,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { width, height } = parseSize(size);

  const buffer = await sharp(source)
    .rotate()
    .resize(width, height, {
      fit: "cover",
      position: "attention",
    })
    .png()
    .toBuffer();

  return { buffer, width, height };
}

export async function prepareReferenceImage(
  file: File,
  size: VerticalSize,
): Promise<PreparedImage> {
  const sourceBuffer = Buffer.from(await file.arrayBuffer());
  const { buffer, width, height } = await cropToVertical(sourceBuffer, size);

  const safeBaseName = sanitizeFileName(file.name.replace(/\.[^.]+$/, "")) || "reference";
  const fileName = `${Date.now()}-${safeBaseName}-${width}x${height}.png`;

  return {
    buffer,
    mimeType: "image/png",
    originalName: file.name,
    fileName,
    width,
    height,
  };
}

export async function prepareReferenceImageFromUrl(
  url: string,
  originalName: string,
  size: VerticalSize,
): Promise<PreparedImage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Impossible de telecharger l'image de reference.`);
  }
  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const { buffer, width, height } = await cropToVertical(sourceBuffer, size);

  const safeBaseName = sanitizeFileName(originalName.replace(/\.[^.]+$/, "")) || "reference";
  const fileName = `${Date.now()}-${safeBaseName}-${width}x${height}.png`;

  return {
    buffer,
    mimeType: "image/png",
    originalName,
    fileName,
    width,
    height,
  };
}

export async function prepareReferenceImageFromPath(
  filePath: string,
  size: VerticalSize,
): Promise<PreparedImage> {
  const originalName = path.basename(filePath);
  const sourceBuffer = await sharp(filePath).toBuffer();
  const { buffer, width, height } = await cropToVertical(sourceBuffer, size);

  const safeBaseName = sanitizeFileName(originalName.replace(/\.[^.]+$/, "")) || "reference";
  const fileName = `${Date.now()}-${safeBaseName}-${width}x${height}.png`;

  return {
    buffer,
    mimeType: "image/png",
    originalName,
    fileName,
    width,
    height,
  };
}
