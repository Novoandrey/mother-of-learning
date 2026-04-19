-- 026_harden_function_search_path.sql
-- Security hardening: set search_path on our trigger functions to close the
-- "Function Search Path Mutable" warnings from Supabase's Security Advisor.
--
-- Without a fixed search_path, a malicious user who can create objects in
-- another schema could shadow references (e.g. a fake to_tsvector) and have
-- them called by our SECURITY DEFINER-style trigger functions. Fixing it to
-- public is the standard remediation.
--
-- We use CREATE OR REPLACE so this migration is idempotent and leaves the
-- existing triggers intact (triggers reference the function name, so
-- replacing the body is enough — no trigger re-creation needed).

create or replace function update_chronicles_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function update_sessions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function update_encounters_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function update_node_search_vector()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  fields_text text := '';
  val text;
begin
  -- Concatenate all text values from fields JSONB so free-text search hits
  -- them. Loop style is intentional: one jsonb_each_text call + string_agg
  -- would be prettier but this version already exists in prod and the fix
  -- must preserve behavior exactly.
  for val in select jsonb_each_text.value from jsonb_each_text(coalesce(new.fields, '{}'::jsonb))
  loop
    fields_text := fields_text || ' ' || val;
  end loop;

  new.search_vector := to_tsvector('russian',
    coalesce(new.title, '') || ' ' ||
    coalesce(new.content, '') || ' ' ||
    fields_text
  );
  new.updated_at := now();
  return new;
end;
$$;
