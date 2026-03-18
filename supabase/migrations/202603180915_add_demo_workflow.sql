alter table ugc_generation.generations
  add column if not exists approval_status text default 'draft',
  add column if not exists approved_at timestamptz,
  add column if not exists voice_clone_status text default 'idle',
  add column if not exists selected_demo_id uuid,
  add column if not exists demo_script_draft text,
  add column if not exists final_video_status text default 'idle',
  add column if not exists final_video_url text,
  add column if not exists final_video_file_name text;

create table if not exists ugc_generation.demo_assets (
  id uuid primary key,
  name text not null,
  video_url text not null,
  video_file_name text not null,
  default_script text not null,
  thumbnail_url text,
  duration_seconds double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_assets_created_at_idx
  on ugc_generation.demo_assets (created_at desc);

grant select, insert, update, delete on ugc_generation.demo_assets to anon, authenticated, service_role;
