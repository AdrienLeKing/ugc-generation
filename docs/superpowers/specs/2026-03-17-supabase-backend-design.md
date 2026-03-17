# Supabase Backend for Sora Video Generation

**Date**: 2026-03-17
**Status**: Approved

## Goal

Replace the local file-based backend with a Supabase-backed persistence and storage layer. Add video edit support. Keep the existing frontend unchanged — it continues to hit the same API routes, receiving the same response shapes.

## Scope

### In scope
- Supabase persistence replacing `store.ts` (JSON file → `ugc_generation.generations` table)
- Supabase Storage replacing local disk for media (reference images + generated MP4s)
- Centralized camelCase ↔ snake_case mapper between TypeScript types and DB rows
- Video edits via `POST /v1/videos/edits` — new API route and service method
- Write-through storage: Supabase Storage is source of truth, no local disk writes
- Two new DB columns: `source_video_id`, `edit_prompt`
- New public Supabase Storage bucket: `ugc-videos`

### Out of scope
- Characters API (human likeness blocked by default)
- Video extensions (continue clips)
- 16s/20s durations, horizontal sizes
- Supabase Realtime (polling is sufficient for local studio)
- Authentication (anon RLS stays)
- Frontend changes beyond consuming the new edit route

## Architecture

### Module layout

```
src/lib/sora/
├── openai.ts      — OpenAI /v1/videos API (create, retrieve, download, edit)
├── db.ts          — Supabase CRUD for generations table
├── storage.ts     — Supabase Storage for media uploads
├── service.ts     — Orchestrator: validation, lifecycle, wires modules together
├── mapper.ts      — camelCase ↔ snake_case conversion
├── config.ts      — Constants (unchanged)
├── types.ts       — TypeScript types (extended)
├── env.ts         — Env accessors (unchanged)
├── media.ts       — Sharp image processing (pure transforms, no disk I/O)
└── utils.ts       — Helpers (unchanged)
```

### Data flows

#### Create generation

```
POST /api/generations (FormData)
  → service.createGenerations()
    → media.cropToVertical(buffer, size)     — sharp crop, returns Buffer
    → storage.uploadImage(buffer, fileName)  — Supabase Storage → public URL
    → openai.createRemoteVideoJob(params)    — POST /v1/videos → job object
    → mapper.toRecord(remoteJob, metadata)   — build GenerationRecord
    → db.upsertRecords(records)              — INSERT into generations
    → return records
```

#### Poll / refresh

```
GET /api/generations
  → service.getDashboardState()
    → db.readRecords()                        — SELECT * FROM generations
    → for each active job (queued / in_progress):
        → openai.retrieveRemoteVideoJob(id)   — GET /v1/videos/{id}
        → if completed && no video URL yet:
            → openai.downloadRemoteVideo(id)   — GET /v1/videos/{id}/content
            → storage.uploadVideo(id, buffer)  — Supabase Storage → public URL
        → mapper.toRecord(refreshed)
        → db.upsertRecord(record)              — UPDATE row
    → return all records
```

#### Edit video (new)

```
POST /api/generations/[id]/edit (JSON: { prompt })
  → service.editGeneration(id, editPrompt)
    → db.readRecord(id)                       — fetch source generation
    → openai.createEditJob(sourceId, prompt)   — POST /v1/videos/edits
    → mapper.toRecord(remoteJob, sourceMetadata)
    → db.upsertRecord(newRecord)               — INSERT new row
    → return newRecord
```

## Module specifications

### `db.ts` — Supabase CRUD

Imports the Supabase client from `src/lib/supabase.ts`. All queries target the `generations` table in the `ugc_generation` schema.

Functions:
- `readRecords()` — SELECT all, ordered by `created_at` DESC
- `readRecord(id)` — SELECT single row by primary key, throws if not found
- `upsertRecord(record: GenerationRecord)` — upsert single row (uses mapper internally)
- `upsertRecords(records: GenerationRecord[])` — upsert multiple rows

All functions use `mapper.toDbRow()` for writes and `mapper.toRecord()` for reads, so consumers only work with `GenerationRecord`. Upserts use `{ onConflict: 'id' }` for conflict resolution on the primary key.

### `storage.ts` — Supabase Storage

Uses a public bucket named `ugc-videos`.

Functions:
- `uploadImage(buffer: Buffer, fileName: string)` — uploads to `uploads/{fileName}`, returns public URL string
- `uploadVideo(videoId: string, buffer: ArrayBuffer)` — uploads to `generated/{videoId}.mp4`, returns public URL string
- `getPublicUrl(path: string)` — returns the public URL for any path in the bucket

**Error handling**: upload functions throw on failure. In `service.ts`, if storage upload fails during `createGenerations`:
- If the reference image upload fails: the generation is aborted before the OpenAI call (no wasted API cost).
- If the video download/upload fails during `refreshGeneration`: the record is updated with the new status from OpenAI but `videoUrl` stays null. The next poll cycle will retry the download + upload.

### `mapper.ts` — Type conversion

Two mapper layers:

**DB mapping** (snake_case ↔ camelCase):
- `toRecord(row: GenerationRow): GenerationRecord` — snake_case → camelCase, normalizes status enum, converts timestamps
- `toDbRow(record: GenerationRecord): Omit<GenerationRow, "updated_at">` — camelCase → snake_case, omits `updated_at` (auto-set by DB trigger)

**Remote job mapping** (kept in `service.ts`):
- `mapRemoteJobToRecord(remoteJob, baseMetadata): GenerationRecord` — converts an OpenAI API response + generation metadata into a `GenerationRecord`. This stays in `service.ts` because it combines API response data with application-level context (prompt, model, size, image URLs) that only the service layer has.

### `media.ts` — Image processing (rewrite)

Keeps the sharp cropping logic. Removes all disk I/O.

Functions:
- `cropToVertical(source: Buffer, size: VerticalSize): Promise<{ buffer: Buffer; width: number; height: number }>` — crop + resize to target 9:16 ratio
- `prepareReferenceImage(file: File, size: VerticalSize): Promise<PreparedImage>` — wraps cropToVertical, generates a safe file name. Does NOT save to disk or upload. Caller (service) handles storage.
- `prepareReferenceImageFromPath(filePath: string, size: VerticalSize): Promise<PreparedImage>` — same as above but reads from a file path (for CLI use)

### `openai.ts` — API client (extended)

Existing functions stay:
- `createRemoteVideoJob(input)` — POST /v1/videos (multipart/form-data)
- `retrieveRemoteVideoJob(id)` — GET /v1/videos/{id}
- `downloadRemoteVideo(id)` — GET /v1/videos/{id}/content

New function:
- `createEditJob(sourceVideoId: string, prompt: string)` — POST /v1/videos/edits with JSON body `{ video: { id }, prompt }`. Uses `Content-Type: application/json` and `JSON.stringify`, does not reuse the multipart helper.

### `service.ts` — Orchestrator (rewrite)

Thin layer that validates inputs, calls the right modules, and returns `GenerationRecord` arrays.

Functions:
- `createGenerations(input: CreateGenerationInput)` — validate, crop image, upload to storage, call OpenAI, persist to DB
- `createGenerationsFromFormData(formData: FormData)` — parse FormData, delegate to createGenerations
- `createGenerationsFromCli(input)` — parse CLI args, delegate to createGenerations
- `editGeneration(sourceId: string, editPrompt: string)` — fetch source, call OpenAI edits endpoint, persist new record
- `refreshGeneration(record: GenerationRecord)` — poll OpenAI, download video if completed, upload to storage, update DB
- `listGenerations(options?)` — read from DB, optionally refresh active jobs. Uses `Promise.allSettled` for concurrent OpenAI polling (matching current behavior). Failed refreshes are silently skipped — the record keeps its previous state and retries on next poll.
- `getDashboardState()` — return env readiness + refreshed records
- `mapRemoteJobToRecord(remoteJob, metadata)` — private helper, builds a `GenerationRecord` from an OpenAI response + generation metadata

## Types changes

```typescript
// Rename in GenerationRecord (breaking change from local paths to Supabase URLs):
//   localVideoUrl     → videoUrl
//   localVideoFileName → videoFileName
// These now hold Supabase Storage public URLs, not local /generated/ paths.

// Add to GenerationRecord:
sourceVideoId?: string;    // original video ID if this is an edit
editPrompt?: string;       // the edit instruction

// New type: replaces PreparedReferenceImage (no more localUrl field)
export type PreparedImage = {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  fileName: string;         // safe file name for storage upload
  width: number;
  height: number;
};
// CreateGenerationInput.referenceImage changes from PreparedReferenceImage to PreparedImage.
// The service layer calls storage.uploadImage() after preparing the image,
// then stores the returned public URL in the GenerationRecord.

// DB row shape (column names match the Supabase table):
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
  video_url: string | null;          // renamed from local_video_url
  video_file_name: string | null;    // renamed from local_video_file_name
  error_message: string | null;
  created_at: string;
  updated_at: string;
  remote_created_at: string | null;
  remote_completed_at: string | null;
  remote_expires_at: string | null;
  source_video_id: string | null;
  edit_prompt: string | null;
};
```

## API Routes

### `GET /api/generations` (existing, rewired)
Response shape unchanged:
```json
{ "envReady": true, "pollIntervalMs": 10000, "items": [...] }
```

### `POST /api/generations` (existing, rewired)
Accepts FormData (same as today). Response shape unchanged:
```json
{ "items": [...] }
```

### `POST /api/generations/[id]/edit` (new)

Next.js 16 note: `params` is a `Promise` — the route handler must `const { id } = await params` to extract the dynamic segment.

Accepts JSON:
```json
{ "prompt": "Change the lighting to warm golden hour" }
```
Returns:
```json
{ "item": { ...GenerationRecord } }
```

### CLI

The CLI (`npm run sora`) does not support edits in this pass. Edits are web-only. The CLI continues to support create-only via `createGenerationsFromCli`.

## Database migration

### Rename existing columns + add new columns on `ugc_generation.generations`:
```sql
ALTER TABLE ugc_generation.generations
  RENAME COLUMN local_video_url TO video_url;

ALTER TABLE ugc_generation.generations
  RENAME COLUMN local_video_file_name TO video_file_name;

ALTER TABLE ugc_generation.generations
  ADD COLUMN source_video_id text,
  ADD COLUMN edit_prompt text;
```

Note: the `trg_generations_updated_at` trigger already exists — no trigger migration needed.

### New storage bucket:
Create `ugc-videos` bucket, public access enabled.

## File changes summary

| Action | File | Details |
|--------|------|---------|
| Create | `src/lib/sora/db.ts` | Supabase CRUD |
| Create | `src/lib/sora/storage.ts` | Supabase Storage uploads |
| Create | `src/lib/sora/mapper.ts` | camelCase ↔ snake_case |
| Create | `src/app/api/generations/[id]/edit/route.ts` | Edit endpoint |
| Rewrite | `src/lib/sora/service.ts` | Thin orchestrator |
| Modify | `src/lib/sora/openai.ts` | Add `createEditJob()` |
| Rewrite | `src/lib/sora/media.ts` | Remove disk I/O, pure transforms |
| Modify | `src/lib/sora/types.ts` | Add `GenerationRow`, edit fields |
| Delete | `src/lib/sora/store.ts` | Replaced by `db.ts` |
| Migration | Supabase | Add columns + create bucket |

## Constraints

- Vertical formats only: `720x1280` and `1024x1792`
- Durations: 4, 8, or 12 seconds
- Max batch size: 4
- No auth — anon RLS policy stays
- Frontend response shapes must not break
- `updated_at` managed by DB trigger, never set in application code
