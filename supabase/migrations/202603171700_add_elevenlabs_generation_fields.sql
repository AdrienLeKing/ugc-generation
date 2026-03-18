alter table ugc_generation.generations
  add column if not exists hook_audio_url text,
  add column if not exists hook_audio_file_name text,
  add column if not exists elevenlabs_voice_id text,
  add column if not exists elevenlabs_voice_name text,
  add column if not exists voiceover_url text,
  add column if not exists voiceover_file_name text,
  add column if not exists voiceover_script text;
