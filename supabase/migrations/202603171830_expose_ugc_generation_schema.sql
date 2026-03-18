do $$
declare
  current_db_schemas text;
begin
  select substring(config_entry from 'pgrst\.db_schemas=(.*)')
    into current_db_schemas
  from pg_roles
    cross join lateral unnest(coalesce(rolconfig, '{}'::text[])) as config_entry
  where rolname = 'authenticator'
    and config_entry like 'pgrst.db_schemas=%'
  limit 1;

  if current_db_schemas is null then
    execute 'alter role authenticator set pgrst.db_schemas = ''public, storage, graphql_public, ugc_generation''';
  elsif position('ugc_generation' in current_db_schemas) = 0 then
    execute format(
      'alter role authenticator set pgrst.db_schemas = %L',
      current_db_schemas || ', ugc_generation'
    );
  end if;
end
$$;

grant usage on schema ugc_generation to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema ugc_generation to anon, authenticated, service_role;
grant all on all routines in schema ugc_generation to anon, authenticated, service_role;
grant usage, select on all sequences in schema ugc_generation to anon, authenticated, service_role;

alter default privileges for role postgres in schema ugc_generation
grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema ugc_generation
grant all on routines to anon, authenticated, service_role;

alter default privileges for role postgres in schema ugc_generation
grant usage, select on sequences to anon, authenticated, service_role;

notify pgrst, 'reload config';
