import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GenerationRecord } from "@/lib/sora/types";

const dataDirectory = path.join(process.cwd(), "data");
const dataFilePath = path.join(dataDirectory, "sora-generations.json");
const publicDirectory = path.join(process.cwd(), "public");
const uploadsDirectory = path.join(publicDirectory, "uploads");
const generatedDirectory = path.join(publicDirectory, "generated");

let writeQueue = Promise.resolve();

async function ensureDirectories() {
  await Promise.all([
    mkdir(dataDirectory, { recursive: true }),
    mkdir(publicDirectory, { recursive: true }),
    mkdir(uploadsDirectory, { recursive: true }),
    mkdir(generatedDirectory, { recursive: true }),
  ]);
}

async function withWriteLock<T>(operation: () => Promise<T>) {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

export async function readGenerationRecords() {
  await ensureDirectories();

  try {
    const raw = await readFile(dataFilePath, "utf8");
    const parsed = JSON.parse(raw) as GenerationRecord[];
    return parsed.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function writeGenerationRecords(records: GenerationRecord[]) {
  await ensureDirectories();

  await withWriteLock(async () => {
    await writeFile(dataFilePath, JSON.stringify(records, null, 2), "utf8");
  });

  return records.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function upsertGenerationRecord(record: GenerationRecord) {
  const existing = await readGenerationRecords();
  const nextRecords = existing.filter((item) => item.id !== record.id);
  nextRecords.push(record);
  return writeGenerationRecords(nextRecords);
}

export async function upsertGenerationRecords(records: GenerationRecord[]) {
  const existing = await readGenerationRecords();
  const nextById = new Map(existing.map((item) => [item.id, item]));

  for (const record of records) {
    nextById.set(record.id, record);
  }

  return writeGenerationRecords([...nextById.values()]);
}

export function getUploadsDirectory() {
  return uploadsDirectory;
}

export function getGeneratedDirectory() {
  return generatedDirectory;
}
