-- Persona library: reusable creator identities with reference photos

create or replace function ugc_generation.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists ugc_generation.personas (
  id              uuid primary key,
  user_id         uuid references auth.users(id) on delete cascade,
  name            text not null,
  photo_url       text not null,
  photo_file_name text not null,
  photo_width     integer,
  photo_height    integer,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists personas_user_created_idx
  on ugc_generation.personas (user_id, created_at desc);

create trigger trg_personas_updated_at
  before update on ugc_generation.personas
  for each row execute function ugc_generation.set_updated_at();

alter table ugc_generation.personas enable row level security;

create policy anon_full_access_personas on ugc_generation.personas
  for all to anon using (true) with check (true);

create policy service_role_all_personas on ugc_generation.personas
  for all to service_role using (true) with check (true);

grant select, insert, update, delete on ugc_generation.personas to anon, authenticated, service_role;

-- Link generations to personas
alter table ugc_generation.generations
  add column if not exists persona_id uuid references ugc_generation.personas(id) on delete set null;
