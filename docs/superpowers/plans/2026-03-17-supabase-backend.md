# Supabase Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace local file-based persistence with Supabase DB + Storage, add video edit support, keep frontend working.

**Architecture:** Four new modules (db, storage, mapper, edit route) replace the file-based store. Service layer is rewritten as a thin orchestrator. Media module becomes a pure transform (no disk I/O). Frontend field rename `localVideoUrl` → `videoUrl`.

**Tech Stack:** Next.js 16, Supabase (DB + Storage), sharp, OpenAI /v1/videos API

**Spec:** `docs/superpowers/specs/2026-03-17-supabase-backend-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/sora/mapper.ts` | camelCase ↔ snake_case conversion |
| Create | `src/lib/sora/db.ts` | Supabase CRUD for generations |
| Create | `src/lib/sora/storage.ts` | Supabase Storage uploads |
| Create | `src/app/api/generations/[id]/edit/route.ts` | Edit endpoint |
| Rewrite | `src/lib/sora/types.ts` | Add GenerationRow, PreparedImage, edit fields, rename video fields |
| Rewrite | `src/lib/sora/media.ts` | Pure transforms, no disk I/O |
| Modify | `src/lib/sora/openai.ts` | Add createEditJob() |
| Rewrite | `src/lib/sora/service.ts` | Thin orchestrator using db/storage/openai/media |
| No change | `src/app/api/generations/route.ts` | Already imports from service, not store |
| Modify | `src/components/sora-studio.tsx` | Rename localVideoUrl → videoUrl |
| Delete | `src/lib/sora/store.ts` | Replaced by db.ts |

---

### Task 1: Database migration

Run the SQL migration on Supabase and create the storage bucket.

**Files:** None (Supabase dashboard/MCP)

- [ ] **Step 1: Rename columns and add new ones**

Run via Supabase MCP `apply_migration`:
```sql
ALTER TABLE ugc_generation.generations
  RENAME COLUMN local_video_url TO video_url;

ALTER TABLE ugc_generation.generations
  RENAME COLUMN local_video_file_name TO video_file_name;

ALTER TABLE ugc_generation.generations
  ADD COLUMN source_video_id text,
  ADD COLUMN edit_prompt text;
```

- [ ] **Step 2: Create the storage bucket**

Create a public bucket named `ugc-videos` via Supabase MCP or dashboard.

- [ ] **Step 3: Verify migration**

Query the table to confirm columns exist:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'ugc_generation' AND table_name = 'generations'
ORDER BY ordinal_position;
```
Expected: should include `video_url`, `video_file_name`, `source_video_id`, `edit_prompt`. Should NOT include `local_video_url` or `local_video_file_name`.

- [ ] **Step 4: Commit**

No code changes in this task — migration is database-only.

---

### Task 2: Update types

Rename fields, add new types, remove old types.

**Files:**
- Modify: `src/lib/sora/types.ts`

- [ ] **Step 1: Rewrite types.ts**

Replace the full contents of `src/lib/sora/types.ts` with:

```typescript
export type SoraModel = "sora-2" | "sora-2-pro";

export type VerticalSize = "720x1280" | "1024x1792";

export type GenerationStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "unknown";

export type InputMode = "text" | "text_plus_image";

export type GenerationRecord = {
  id: string;
  prompt: string;
  model: SoraModel;
  seconds: number;
  size: VerticalSize;
  status: GenerationStatus;
  progressPercent: number;
  inputMode: InputMode;
  inputImageUrl?: string;
  inputImageOriginalName?: string;
  inputImageWidth?: number;
  inputImageHeight?: number;
  videoUrl?: string;
  videoFileName?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  remoteCreatedAt?: string;
  remoteCompletedAt?: string;
  remoteExpiresAt?: string;
  sourceVideoId?: string;
  editPrompt?: string;
};

export type GenerationRow = {
  id: string;
  prompt: string;
  model: string;
  seconds: number;
  size: string;
  status: string;
  progress_percent: number;
  input_mode: string;
  input_image_url: string | null;
  input_image_original_name: string | null;
  input_image_width: number | null;
  input_image_height: number | null;
  video_url: string | null;
  video_file_name: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  remote_created_at: string | null;
  remote_completed_at: string | null;
  remote_expires_at: string | null;
  source_video_id: string | null;
  edit_prompt: string | null;
};

export type PreparedImage = {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  fileName: string;
  width: number;
  height: number;
};

export type CreateGenerationInput = {
  prompt: string;
  model: SoraModel;
  seconds: number;
  size: VerticalSize;
  count: number;
  referenceImage?: PreparedImage;
};

export type RemoteVideoJob = {
  id: string;
  status?: string;
  progress_percent?: number;
  created_at?: number | string;
  completed_at?: number | string;
  expires_at?: number | string;
  error?: {
    message?: string;
  };
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: errors in files that still reference old types (`localVideoUrl`, `PreparedReferenceImage`, `store`). This is expected — we'll fix them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sora/types.ts
git commit -m "refactor: update types for Supabase backend

Rename localVideoUrl/localVideoFileName to videoUrl/videoFileName.
Add GenerationRow, PreparedImage, sourceVideoId, editPrompt.
Remove PreparedReferenceImage."
```

---

### Task 3: Create mapper

**Files:**
- Create: `src/lib/sora/mapper.ts`

- [ ] **Step 1: Create mapper.ts**

Create `src/lib/sora/mapper.ts`:

```typescript
import type { GenerationRecord, GenerationRow, GenerationStatus } from "@/lib/sora/types";

export function normalizeStatus(value: string | undefined): GenerationStatus {
  if (value === "queued" || value === "in_progress" || value === "completed" || value === "failed") {
    return value;
  }
  return "unknown";
}

export function toRecord(row: GenerationRow): GenerationRecord {
  return {
    id: row.id,
    prompt: row.prompt,
    model: row.model as GenerationRecord["model"],
    seconds: row.seconds,
    size: row.size as GenerationRecord["size"],
    status: normalizeStatus(row.status),
    progressPercent: row.progress_percent,
    inputMode: row.input_mode as GenerationRecord["inputMode"],
    inputImageUrl: row.input_image_url ?? undefined,
    inputImageOriginalName: row.input_image_original_name ?? undefined,
    inputImageWidth: row.input_image_width ?? undefined,
    inputImageHeight: row.input_image_height ?? undefined,
    videoUrl: row.video_url ?? undefined,
    videoFileName: row.video_file_name ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    remoteCreatedAt: row.remote_created_at ?? undefined,
    remoteCompletedAt: row.remote_completed_at ?? undefined,
    remoteExpiresAt: row.remote_expires_at ?? undefined,
    sourceVideoId: row.source_video_id ?? undefined,
    editPrompt: row.edit_prompt ?? undefined,
  };
}

export function toDbRow(record: GenerationRecord): Omit<GenerationRow, "updated_at"> {
  return {
    id: record.id,
    prompt: record.prompt,
    model: record.model,
    seconds: record.seconds,
    size: record.size,
    status: record.status,
    progress_percent: record.progressPercent,
    input_mode: record.inputMode,
    input_image_url: record.inputImageUrl ?? null,
    input_image_original_name: record.inputImageOriginalName ?? null,
    input_image_width: record.inputImageWidth ?? null,
    input_image_height: record.inputImageHeight ?? null,
    video_url: record.videoUrl ?? null,
    video_file_name: record.videoFileName ?? null,
    error_message: record.errorMessage ?? null,
    created_at: record.createdAt,
    remote_created_at: record.remoteCreatedAt ?? null,
    remote_completed_at: record.remoteCompletedAt ?? null,
    remote_expires_at: record.remoteExpiresAt ?? null,
    source_video_id: record.sourceVideoId ?? null,
    edit_prompt: record.editPrompt ?? null,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/sora/mapper.ts
git commit -m "feat: add mapper for camelCase/snake_case conversion"
```

---

### Task 4: Create db module

**Files:**
- Create: `src/lib/sora/db.ts`

- [ ] **Step 1: Create db.ts**

Create `src/lib/sora/db.ts`:

```typescript
import { supabase } from "@/lib/supabase";
import { toDbRow, toRecord } from "@/lib/sora/mapper";
import type { GenerationRecord, GenerationRow } from "@/lib/sora/types";

const TABLE = "generations";

export async function readRecords(): Promise<GenerationRecord[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erreur lecture generations: ${error.message}`);
  }

  return (data as GenerationRow[]).map(toRecord);
}

export async function readRecord(id: string): Promise<GenerationRecord> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(`Generation introuvable (${id}): ${error.message}`);
  }

  return toRecord(data as GenerationRow);
}

export async function upsertRecord(record: GenerationRecord): Promise<void> {
  const row = toDbRow(record);
  const { error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: "id" });

  if (error) {
    throw new Error(`Erreur sauvegarde generation: ${error.message}`);
  }
}

export async function upsertRecords(records: GenerationRecord[]): Promise<void> {
  if (records.length === 0) return;

  const rows = records.map(toDbRow);
  const { error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`Erreur sauvegarde generations: ${error.message}`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/sora/db.ts
git commit -m "feat: add Supabase CRUD module for generations"
```

---

### Task 5: Create storage module

**Files:**
- Create: `src/lib/sora/storage.ts`

- [ ] **Step 1: Create storage.ts**

Create `src/lib/sora/storage.ts`:

```typescript
import { supabase } from "@/lib/supabase";

const BUCKET = "ugc-videos";

export async function uploadImage(buffer: Buffer, fileName: string): Promise<string> {
  const path = `uploads/${fileName}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    throw new Error(`Erreur upload image: ${error.message}`);
  }

  return getPublicUrl(path);
}

export async function uploadVideo(videoId: string, buffer: ArrayBuffer): Promise<string> {
  const path = `generated/${videoId}.mp4`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (error) {
    throw new Error(`Erreur upload video: ${error.message}`);
  }

  return getPublicUrl(path);
}

export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/sora/storage.ts
git commit -m "feat: add Supabase Storage module for media uploads"
```

---

### Task 6: Core rewrite (media + openai + service + delete store)

These four changes are interdependent — media and service reference each other, and store.ts must be deleted after service stops importing it. They ship as one commit.

**Files:**
- Rewrite: `src/lib/sora/media.ts`
- Modify: `src/lib/sora/openai.ts`
- Rewrite: `src/lib/sora/service.ts`
- Delete: `src/lib/sora/store.ts`

- [ ] **Step 1: Rewrite media.ts**

Replace the full contents of `src/lib/sora/media.ts` with:

```typescript
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
```

- [ ] **Step 2: Add createEditJob to openai.ts**

Append to the end of `src/lib/sora/openai.ts`:

```typescript
export async function createEditJob(sourceVideoId: string, prompt: string) {
  const response = await fetch(`${OPENAI_API_BASE_URL}/videos/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video: { id: sourceVideoId },
      prompt,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as RemoteVideoJob;
}
```

- [ ] **Step 3: Rewrite service.ts**

Replace the full contents of `src/lib/sora/service.ts` with:

```typescript
import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_MODEL,
  DEFAULT_SIZE,
  DURATION_OPTIONS,
  MAX_BATCH_SIZE,
  VERTICAL_SIZE_OPTIONS,
} from "@/lib/sora/config";
import { readRecord, readRecords, upsertRecord, upsertRecords } from "@/lib/sora/db";
import { hasOpenAiApiKey } from "@/lib/sora/env";
import { normalizeStatus } from "@/lib/sora/mapper";
import { prepareReferenceImage, prepareReferenceImageFromPath } from "@/lib/sora/media";
import { createEditJob, createRemoteVideoJob, downloadRemoteVideo, retrieveRemoteVideoJob } from "@/lib/sora/openai";
import { uploadImage, uploadVideo } from "@/lib/sora/storage";
import type { CreateGenerationInput, GenerationRecord, RemoteVideoJob, SoraModel, VerticalSize } from "@/lib/sora/types";
import { clamp, nowIsoString, toIsoTimestamp } from "@/lib/sora/utils";

function isSupportedSeconds(seconds: number) {
  return DURATION_OPTIONS.some((option) => option.value === seconds);
}

function isSupportedSize(size: string): size is VerticalSize {
  return VERTICAL_SIZE_OPTIONS.some((option) => option.value === size);
}

function isSupportedModel(model: string): model is SoraModel {
  return model === "sora-2" || model === "sora-2-pro";
}

function mapRemoteJobToRecord(
  remoteJob: RemoteVideoJob,
  existing: Omit<GenerationRecord, "status" | "progressPercent" | "updatedAt" | "errorMessage">,
): GenerationRecord {
  return {
    ...existing,
    status: normalizeStatus(remoteJob.status),
    progressPercent:
      remoteJob.progress_percent ??
      (remoteJob.status === "completed" ? 100 : 0),
    errorMessage: remoteJob.error?.message,
    updatedAt: nowIsoString(),
    remoteCreatedAt: toIsoTimestamp(remoteJob.created_at) ?? existing.remoteCreatedAt,
    remoteCompletedAt: toIsoTimestamp(remoteJob.completed_at),
    remoteExpiresAt: toIsoTimestamp(remoteJob.expires_at),
  };
}

async function ensureVideoUploaded(record: GenerationRecord): Promise<GenerationRecord> {
  if (record.status !== "completed" || record.videoUrl) {
    return record;
  }

  const videoBuffer = await downloadRemoteVideo(record.id);
  const videoUrl = await uploadVideo(record.id, videoBuffer);

  return {
    ...record,
    videoUrl,
    videoFileName: `${record.id}.mp4`,
    updatedAt: nowIsoString(),
  };
}

export async function createGenerations(input: CreateGenerationInput) {
  const prompt = input.prompt.trim();
  const model = input.model || DEFAULT_MODEL;
  const seconds = input.seconds || DEFAULT_DURATION_SECONDS;
  const size = input.size || DEFAULT_SIZE;
  const count = clamp(Math.trunc(input.count || 1), 1, MAX_BATCH_SIZE);

  if (!prompt) {
    throw new Error("Le prompt est obligatoire.");
  }

  if (!isSupportedModel(model)) {
    throw new Error("Modele Sora non pris en charge.");
  }

  if (!isSupportedSeconds(seconds)) {
    throw new Error("Duree non prise en charge. Utilisez 4, 8 ou 12 secondes.");
  }

  if (!isSupportedSize(size)) {
    throw new Error("Format vertical non pris en charge.");
  }

  // Upload reference image to Supabase Storage if provided
  let imageUrl: string | undefined;
  const referenceImage = input.referenceImage;
  if (referenceImage) {
    imageUrl = await uploadImage(referenceImage.buffer, referenceImage.fileName);
  }

  const baseRecord = {
    prompt,
    model,
    seconds,
    size,
    inputMode: referenceImage ? ("text_plus_image" as const) : ("text" as const),
    inputImageUrl: imageUrl,
    inputImageOriginalName: referenceImage?.originalName,
    inputImageWidth: referenceImage?.width,
    inputImageHeight: referenceImage?.height,
    videoUrl: undefined,
    videoFileName: undefined,
    createdAt: nowIsoString(),
    remoteCreatedAt: undefined,
    remoteCompletedAt: undefined,
    remoteExpiresAt: undefined,
    sourceVideoId: undefined,
    editPrompt: undefined,
  };

  const createdJobs = await Promise.all(
    Array.from({ length: count }, async () => {
      const remoteJob = await createRemoteVideoJob({
        prompt,
        model,
        seconds,
        size,
        referenceImage,
      });

      return mapRemoteJobToRecord(remoteJob, {
        id: remoteJob.id,
        ...baseRecord,
      });
    }),
  );

  await upsertRecords(createdJobs);
  return createdJobs.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createGenerationsFromFormData(formData: FormData) {
  const prompt = String(formData.get("prompt") || "");
  const model = String(formData.get("model") || DEFAULT_MODEL);
  const seconds = Number(formData.get("seconds") || DEFAULT_DURATION_SECONDS);
  const size = String(formData.get("size") || DEFAULT_SIZE);
  const count = Number(formData.get("count") || 1);
  const maybeFile = formData.get("referenceImage");
  const referenceImage =
    maybeFile instanceof File && maybeFile.size > 0 && isSupportedSize(size)
      ? await prepareReferenceImage(maybeFile, size)
      : undefined;

  return createGenerations({
    prompt,
    model: isSupportedModel(model) ? model : DEFAULT_MODEL,
    seconds,
    size: isSupportedSize(size) ? size : DEFAULT_SIZE,
    count,
    referenceImage,
  });
}

export async function createGenerationsFromCli(input: {
  prompt: string;
  model?: string;
  seconds?: number;
  size?: string;
  count?: number;
  imagePath?: string;
}) {
  const requestedSize = input.size;
  const requestedModel = input.model;
  const size: VerticalSize = requestedSize && isSupportedSize(requestedSize) ? requestedSize : DEFAULT_SIZE;
  const model: SoraModel = requestedModel && isSupportedModel(requestedModel) ? requestedModel : DEFAULT_MODEL;
  const referenceImage = input.imagePath ? await prepareReferenceImageFromPath(input.imagePath, size) : undefined;

  return createGenerations({
    prompt: input.prompt,
    model,
    seconds: input.seconds ?? DEFAULT_DURATION_SECONDS,
    size,
    count: input.count ?? 1,
    referenceImage,
  });
}

export async function editGeneration(sourceId: string, editPrompt: string) {
  const source = await readRecord(sourceId);

  if (source.status !== "completed") {
    throw new Error("Seules les generations terminees peuvent etre editees.");
  }

  const remoteJob = await createEditJob(source.id, editPrompt);

  const newRecord = mapRemoteJobToRecord(remoteJob, {
    id: remoteJob.id,
    prompt: source.prompt,
    model: source.model,
    seconds: source.seconds,
    size: source.size,
    inputMode: source.inputMode,
    inputImageUrl: source.inputImageUrl,
    inputImageOriginalName: source.inputImageOriginalName,
    inputImageWidth: source.inputImageWidth,
    inputImageHeight: source.inputImageHeight,
    videoUrl: undefined,
    videoFileName: undefined,
    createdAt: nowIsoString(),
    remoteCreatedAt: undefined,
    remoteCompletedAt: undefined,
    remoteExpiresAt: undefined,
    sourceVideoId: source.id,
    editPrompt,
  });

  await upsertRecord(newRecord);
  return newRecord;
}

export async function refreshGeneration(record: GenerationRecord): Promise<GenerationRecord> {
  const remoteJob = await retrieveRemoteVideoJob(record.id);
  const refreshed = mapRemoteJobToRecord(remoteJob, record);

  let withVideo: GenerationRecord;
  try {
    withVideo = await ensureVideoUploaded(refreshed);
  } catch {
    // Video download/upload failed — keep status update, retry video on next poll
    withVideo = refreshed;
  }

  await upsertRecord(withVideo);
  return withVideo;
}

export async function listGenerations(options?: { refresh?: boolean }) {
  const records = await readRecords();

  if (!options?.refresh || !hasOpenAiApiKey()) {
    return records;
  }

  const activeRecords = records.filter((record) => record.status === "queued" || record.status === "in_progress");

  const refreshedRecords = await Promise.allSettled(activeRecords.map((record) => refreshGeneration(record)));
  const refreshedById = new Map(
    refreshedRecords
      .filter((result): result is PromiseFulfilledResult<GenerationRecord> => result.status === "fulfilled")
      .map((result) => [result.value.id, result.value]),
  );

  return records
    .map((record) => refreshedById.get(record.id) ?? record)
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDashboardState() {
  return {
    envReady: hasOpenAiApiKey(),
    records: await listGenerations({ refresh: true }),
  };
}
```

- [ ] **Step 4: Delete store.ts**

```bash
rm src/lib/sora/store.ts
```

- [ ] **Step 5: Commit all core rewrite changes**

```bash
git add src/lib/sora/media.ts src/lib/sora/openai.ts src/lib/sora/service.ts
git add -u src/lib/sora/store.ts
git commit -m "refactor: core rewrite — media/openai/service use Supabase, delete store"
```

---

### Task 7: Create edit API route

**Files:**
- Create: `src/app/api/generations/[id]/edit/route.ts`

- [ ] **Step 1: Create the edit route**

Create `src/app/api/generations/[id]/edit/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { editGeneration } from "@/lib/sora/service";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return errorResponse(new Error("Le prompt d'edition est obligatoire."), 400);
    }

    const record = await editGeneration(id, prompt);

    return NextResponse.json({ item: record });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/generations/[id]/edit/route.ts
git commit -m "feat: add video edit API route POST /api/generations/[id]/edit"
```

---

### Task 8: Update frontend field names

The frontend references `localVideoUrl` which is now `videoUrl`.

**Files:**
- Modify: `src/components/sora-studio.tsx`

- [ ] **Step 1: Rename localVideoUrl to videoUrl in sora-studio.tsx**

In `src/components/sora-studio.tsx`, replace all occurrences of `localVideoUrl` with `videoUrl` (3 occurrences: lines 445, 449, 453 approximately).

Find `item.localVideoUrl` → replace with `item.videoUrl` (all 3 instances).

- [ ] **Step 2: Commit**

```bash
git add src/components/sora-studio.tsx
git commit -m "refactor: rename localVideoUrl to videoUrl in frontend"
```

---

### Task 9: Verify build and lint

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run ESLint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: successful build with no errors.

- [ ] **Step 4: If errors, fix and commit**

Fix any compilation/lint errors and commit the fixes.

---

### Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the module table**

In the `src/lib/sora/` module table in CLAUDE.md:
- Remove `store.ts` row
- Replace with rows for `db.ts`, `storage.ts`, `mapper.ts`
- Update `media.ts` description to "Image processing with sharp (pure transforms, no disk I/O)"
- Update `types.ts` description to mention `GenerationRow`, `PreparedImage`

- [ ] **Step 2: Update key constraints**

Replace `localVideoUrl`/`localVideoFileName` references with `videoUrl`/`videoFileName` if any exist.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Supabase backend"
```
