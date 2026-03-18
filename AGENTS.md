# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Local Sora 2 video generation studio built with Next.js 16. Generates vertical (9:16) videos via OpenAI's Sora API, with both a web UI and a CLI. State is persisted to Supabase. Media (reference images, generated MP4s) stored in Supabase Storage. UI and error messages are in French.

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — ESLint (flat config, core-web-vitals)
- `npm run sora -- --prompt "..." [--seconds 8] [--size 720x1280] [--count 3] [--model sora-2] [--image /path/to/image.jpg]` — CLI batch generation

## Architecture

### Two entry points, shared service layer

1. **Web UI**: single-page client component (`src/components/sora-studio.tsx`) polls `GET /api/generations` every 10s for status updates, submits new jobs via `POST /api/generations` with FormData.
2. **CLI**: `scripts/sora-generate.ts` (run via `tsx`) calls the service layer directly.

Both converge on `src/lib/sora/service.ts` which orchestrates validation, OpenAI API calls, image processing, and Supabase persistence.

### `src/lib/sora/` — core modules

| Module | Role |
|--------|------|
| `service.ts` | Orchestrator: create generations, edit videos, refresh statuses, upload completed MP4s |
| `openai.ts` | Raw OpenAI `/v1/videos` API calls (create, retrieve, download, edit) — uses `fetch` directly |
| `db.ts` | Supabase CRUD for `ugc_generation.generations` table |
| `storage.ts` | Supabase Storage uploads (images + videos) to `ugc-videos` bucket |
| `mapper.ts` | camelCase ↔ snake_case conversion between `GenerationRecord` and DB rows |
| `media.ts` | Image processing with `sharp` (pure transforms, no disk I/O) |
| `config.ts` | Constants: models, durations, sizes, poll interval, max batch size |
| `types.ts` | TypeScript types (`GenerationRecord`, `GenerationRow`, `PreparedImage`, etc.) |
| `env.ts` | `OPENAI_API_KEY` accessor |
| `../supabase.ts` | Supabase client configured for the `ugc_generation` schema |
| `utils.ts` | Helpers: timestamp conversion, filename sanitization, clamp |

### Key constraints

- Only vertical formats: `720x1280` and `1024x1792`
- Only durations: 4, 8, or 12 seconds
- Max batch size: 4 concurrent generations
- Reference images are auto-cropped to match the target vertical ratio via sharp
- The API route uses `runtime = "nodejs"` and `dynamic = "force-dynamic"`
- Server actions body size limit is 25mb (for image uploads)

## Sora API Reference

Full documentation lives in `docs/`:
- `docs/sora-documentation.md` — API endpoints, parameters, image references, characters, extensions, edits, batch API
- `docs/sora-prompting-guide.md` — prompt structure, cinematography cues, dialogue, iteration techniques, templates

Key facts from the docs that differ from what the codebase currently supports:
- API supports durations 4, 8, 12, **16, 20** seconds (codebase only exposes 4/8/12)
- API supports horizontal sizes (`1280x720`, `1920x1080`, `1792x1024`) in addition to vertical
- `sora-2-pro` supports `1080x1920` and `1920x1080` (codebase doesn't offer these)
- Characters API (`POST /v1/videos/characters`) for reusable non-human subjects — not implemented
- Video extensions (`POST /v1/videos/extensions`) to continue clips up to 120s total — not implemented
- Video edits (`POST /v1/videos/edits`) for targeted changes — **implemented** via `POST /api/generations/[id]/edit`
- Webhooks (`video.completed`, `video.failed`) as alternative to polling — not implemented
- Batch API for offline render queues — not implemented
- Thumbnail and spritesheet downloads via `variant` query param — not implemented

## Supabase

- **Project**: sandbox (`lhidckbjztivaeceazyi`), region `eu-west-3`
- **Schema**: `ugc_generation` (dedicated schema, not `public`)
- **Table**: `ugc_generation.generations` — columns use snake_case, mapped via `mapper.ts`
- **Storage bucket**: `ugc-videos` (public) — `uploads/` for reference images, `generated/` for MP4s
- **RLS**: enabled, anon full access (no auth, local studio)
- **Client**: `src/lib/supabase.ts` — pre-configured with `{ db: { schema: 'ugc_generation' } }`
- **Auto-trigger**: `updated_at` is auto-set on UPDATE via `trg_generations_updated_at`

## Environment

Required env vars in `.env.local`:
- `OPENAI_API_KEY` — OpenAI API key for Sora
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/publishable key

## Styling

Custom CSS in `globals.css` — dark theme, no component library. Uses CSS variables for colors. Fonts: Space Grotesk (display) + IBM Plex Mono (monospace), loaded via `next/font/google`.
