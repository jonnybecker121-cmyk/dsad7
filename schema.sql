-- Im Supabase-Dashboard unter "SQL Editor" ausführen.
-- Das Skript kann auch auf einer bestehenden Datenbank erneut ausgeführt werden (Update auf Listen).

create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null,
  title       text not null,
  starts_at   timestamptz,
  all_day     boolean not null default false,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Listen: kind = 'list' (z. B. "Einkaufsliste", mit Datum in starts_at),
-- Punkte einer Liste: kind = 'item' mit parent_id = id der Liste.
alter table public.items add column if not exists parent_id uuid references public.items(id) on delete cascade;

alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check check (kind in ('task', 'event', 'list', 'item'));

create index if not exists items_user_idx on public.items (user_id, kind, starts_at);
create index if not exists items_parent_idx on public.items (parent_id);

alter table public.items enable row level security;

-- Jeder Nutzer sieht und ändert nur seine eigenen Einträge.
drop policy if exists "items_select_own" on public.items;
create policy "items_select_own" on public.items
  for select using (auth.uid() = user_id);

drop policy if exists "items_insert_own" on public.items;
create policy "items_insert_own" on public.items
  for insert with check (auth.uid() = user_id);

drop policy if exists "items_update_own" on public.items;
create policy "items_update_own" on public.items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "items_delete_own" on public.items;
create policy "items_delete_own" on public.items
  for delete using (auth.uid() = user_id);
