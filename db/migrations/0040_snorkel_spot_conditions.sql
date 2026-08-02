-- 0040_snorkel_spot_conditions.sql
-- Replace the unused per-spot contact columns on snorkel_spots with snorkelling
-- condition fields. The contact columns arrived in 0036 but were never populated
-- (all rows NULL) and nothing reads them -- tour contact details live on the
-- snorkel_tour_operators table instead.

begin;

-- 1. Drop the unused contact columns.
alter table public.snorkel_spots
  drop column if exists phone,
  drop column if exists email,
  drop column if exists website;

-- 2. Add the condition columns.
alter table public.snorkel_spots
  add column if not exists sights text,   -- what you can expect to see, free text
  add column if not exists depth  text,   -- 'shallow' | 'deep'
  add column if not exists water  text;   -- water conditions, free text

-- 3. Constrain depth to the two allowed values (NULL still permitted = unknown).
alter table public.snorkel_spots
  drop constraint if exists snorkel_spots_depth_check;

alter table public.snorkel_spots
  add constraint snorkel_spots_depth_check
  check (depth is null or depth in ('shallow', 'deep'));

comment on column public.snorkel_spots.sights is
  'Free text: marine life / features a snorkeller can expect to see.';
comment on column public.snorkel_spots.depth is
  'Either ''shallow'' or ''deep''; NULL when unknown.';
comment on column public.snorkel_spots.water is
  'Free text: water conditions (clarity, current, chop).';

insert into public.schema_migrations (filename)
values ('0040_snorkel_spot_conditions.sql')
on conflict do nothing;

commit;
