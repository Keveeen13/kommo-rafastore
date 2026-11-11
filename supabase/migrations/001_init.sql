-- Leads espelhados da Kommo
create table if not exists public.leads (
  id                  bigint primary key,            -- ID do lead na Kommo
  name                text,
  price               numeric,
  pipeline_id         bigint,
  status_id           bigint,
  responsible_user_id bigint,
  contact_id          bigint,
  contact_name        text,
  phone               text,
  created_at_kommo    timestamptz,
  updated_at_kommo    timestamptz,
  closed_at           timestamptz,
  is_deleted          boolean not null default false,
  -- campos personalizados: { "Marca": "Armani, Lacoste", "Vendedor": "Jean", ... }
  custom_fields       jsonb not null default '{}'::jsonb,
  synced_at           timestamptz not null default now()
);

create index if not exists leads_created_idx on public.leads (created_at_kommo desc);
create index if not exists leads_status_idx  on public.leads (status_id);

-- Etapas do funil (para mostrar o nome da etapa)
create table if not exists public.stages (
  id            bigint primary key,
  pipeline_id   bigint not null,
  pipeline_name text,
  name          text,
  sort          int
);

-- Usuários da Kommo (para mostrar o nome do responsável)
create table if not exists public.kommo_users (
  id   bigint primary key,
  name text
);

-- Segurança: só usuários logados leem. Escrita só pelo servidor (service role ignora RLS).
alter table public.leads       enable row level security;
alter table public.stages      enable row level security;
alter table public.kommo_users enable row level security;

drop policy if exists "auth read leads"  on public.leads;
drop policy if exists "auth read stages" on public.stages;
drop policy if exists "auth read users"  on public.kommo_users;
create policy "auth read leads"  on public.leads       for select to authenticated using (true);
create policy "auth read stages" on public.stages      for select to authenticated using (true);
create policy "auth read users"  on public.kommo_users for select to authenticated using (true);

-- Tempo real: publica mudanças da tabela leads
alter publication supabase_realtime add table public.leads;
