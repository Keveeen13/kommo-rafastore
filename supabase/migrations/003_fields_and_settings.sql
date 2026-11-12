-- Rodar UMA vez no SQL Editor do Supabase.

-- 1) Tags do lead
alter table public.leads add column if not exists tags text;

-- 2) Definição dos campos personalizados da Kommo (para montar as colunas e saber quais viram filtro)
create table if not exists public.field_defs (
  id   bigint primary key,
  name text not null,
  type text,
  sort int
);
alter table public.field_defs enable row level security;
drop policy if exists "auth read field_defs" on public.field_defs;
create policy "auth read field_defs" on public.field_defs for select to authenticated using (true);

-- 3) Preferências de cada usuário (colunas visíveis e funis ocultos)
create table if not exists public.user_settings (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  visible_columns jsonb,                          -- null = padrão do sistema
  hidden_pipelines jsonb not null default '[]'::jsonb,
  updated_at      timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "own settings select" on public.user_settings;
drop policy if exists "own settings insert" on public.user_settings;
drop policy if exists "own settings update" on public.user_settings;
create policy "own settings select" on public.user_settings for select to authenticated using (user_id = auth.uid());
create policy "own settings insert" on public.user_settings for insert to authenticated with check (user_id = auth.uid());
create policy "own settings update" on public.user_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
