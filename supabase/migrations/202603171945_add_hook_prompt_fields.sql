alter table ugc_generation.generations
  add column if not exists spoken_text text,
  add column if not exists scene_description text;
