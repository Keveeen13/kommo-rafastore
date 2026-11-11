-- Corrige a chave da tabela stages (rodar UMA vez em quem já executou a 001 antiga).
-- Etapas de sistema da Kommo (142 = ganha, 143 = perdida) se repetem em todos os funis.
alter table public.stages drop constraint if exists stages_pkey;
alter table public.stages add primary key (pipeline_id, id);
