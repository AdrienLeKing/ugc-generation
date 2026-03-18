# ElevenLabs Integration — Required Endpoints

## Context

We're building a UGC ad factory. The pipeline generates a 3-4s hook video via Sora (a woman speaking to camera with lip-synced audio), then needs to:

1. Clone the voice from that hook audio (~3-4s sample)
2. Generate a new voiceover for a demo section using the cloned voice
3. Optionally clean up the cloned voice after the job is done

All audio is English, mono, targeting 9:16 vertical video output.

---

## Endpoint 1 — Instant Voice Clone

**Purpose:** Take the audio extracted from the Sora-generated hook video (3-4 second MP3/WAV) and create a cloned voice profile.

**ElevenLabs API:** `POST /v1/voices/add`

**What we send:**
- `name`: auto-generated identifier (e.g. `ugc-hook-{jobId}`)
- `files`: the extracted hook audio file (MP3 or WAV, 3-4 seconds)
- `description`: optional metadata for tracking
- `labels`: optional tags (e.g. `{"project": "ugc-generation"}`)

**What we need back:**
- `voice_id` — stored in Supabase (`ugc_generation.generations`) to use in step 2

**Constraints:**
- Instant Voice Clone requires minimum ~1 second of clean speech audio
- 3-4 seconds is on the short side — quality may vary. If results are poor, we may need to generate a longer Sora clip (10-15s) just for voice sampling, then trim the hook video separately
- Free tier allows up to 10 custom voices. We should delete cloned voices after each job to avoid hitting limits.

---

## Endpoint 2 — Text-to-Speech (with cloned voice)

**Purpose:** Generate the demo voiceover audio using the cloned voice and an AI-written script.

**ElevenLabs API:** `POST /v1/text-to-speech/{voice_id}`

**What we send:**
- `voice_id`: from step 1
- `text`: the demo narration script (AI-generated from app context, ~15-30 seconds of speech)
- `model_id`: `eleven_multilingual_v2` (best quality, supports English well)
- `voice_settings`:
  - `stability`: ~0.5 (balanced — not too robotic, not too variable)
  - `similarity_boost`: ~0.8 (high — we want it to sound like the hook voice)
  - `style`: ~0.3 (some expressiveness for natural UGC feel)
  - `use_speaker_boost`: true

**What we need back:**
- Audio stream (MP3) — saved to disk or Supabase Storage for ffmpeg stitching

**Output format:**
- `output_format`: `mp3_44100_128` (good quality, reasonable file size)
- Duration: matches the screen recording length (~6-10 seconds typically)

---

## Endpoint 3 — Delete Cloned Voice (cleanup)

**Purpose:** Remove the temporary cloned voice after the job completes to stay within voice limits.

**ElevenLabs API:** `DELETE /v1/voices/{voice_id}`

**When:** After the demo voiceover audio is successfully generated and saved.

---

## Endpoint 4 — Get Voice (optional, for debugging)

**Purpose:** Verify a cloned voice exists and check its metadata.

**ElevenLabs API:** `GET /v1/voices/{voice_id}`

**When:** Only for debugging or status checks.

---

## Pipeline Flow

```
Sora hook MP4
    │
    ├── ffmpeg: extract audio → hook.mp3 (3-4s)
    │
    ├── POST /v1/voices/add (hook.mp3)
    │       → voice_id
    │
    ├── AI generates demo script from app context
    │
    ├── POST /v1/text-to-speech/{voice_id} (demo script)
    │       → demo-voiceover.mp3
    │
    ├── DELETE /v1/voices/{voice_id} (cleanup)
    │
    └── ffmpeg: stitch hook.mp4 + (demo-recording.mp4 - original audio + demo-voiceover.mp3)
            → final.mp4
```

---

## Environment Variable

```
ELEVENLABS_API_KEY=  # in .env.local
```

## npm Package

```
npm install elevenlabs
```

The official `elevenlabs` npm package wraps all these endpoints with TypeScript types.

---

## Open Questions

1. **Voice clone quality with 3-4s sample** — May need testing. Fallback: generate a 15s Sora audio-only clip for better cloning, use only 3-4s in the final hook video.
2. **Rate limits** — Free tier: 10 custom voices, ~10k characters/month. Pro tier recommended for production use.
3. **Audio extraction from Sora** — Sora outputs MP4. We need ffmpeg to extract the audio track: `ffmpeg -i hook.mp4 -vn -acodec libmp3lame hook.mp3`
4. **Demo script timing** — The TTS output duration must roughly match the screen recording length. We may need to adjust script length or use ElevenLabs' `speed` parameter to control pacing.
