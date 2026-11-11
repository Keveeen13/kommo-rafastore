# Leads · Kommo — dashboard em tempo real

Next.js + Supabase. A Kommo avisa via webhook → o servidor busca o lead completo na API → grava no Supabase → o Supabase Realtime empurra a mudança para o navegador (a linha pisca em amarelo).

```
Kommo ──webhook──▶ /api/webhooks/kommo ──API v4──▶ Supabase (leads) ──Realtime──▶ Dashboard
```

## 1. Supabase
1. Crie um projeto em supabase.com.
2. **SQL Editor** → cole e rode `supabase/migrations/001_init.sql` (cria tabelas, RLS e ativa o Realtime).
3. **Authentication → Users → Add user**: crie o login de quem vai ver o painel. Em *Authentication → Sign In / Providers*, desative "Allow new users to sign up".
4. Copie URL, `anon key` e `service_role key` (Project Settings → API).

## 2. Kommo
1. Configurações → Integrações → crie uma **integração privada** e gere um **token de longa duração** (escopo de leitura de CRM).
2. Anote o subdomínio (`https://SUBDOMINIO.kommo.com`).

## 3. Variáveis de ambiente
Copie `.env.example` para `.env.local` (local) e cadastre as mesmas no seu host. `WEBHOOK_SECRET` e `SYNC_SECRET` são strings aleatórias longas que você inventa.

## 4. Hospedar
Qualquer host que rode Next.js (Vercel, Railway, Render, VPS com `npm run build && npm start`). Precisa de HTTPS público para o webhook.

## 5. Carga inicial (uma vez)
```bash
curl -X POST -H "Authorization: Bearer $SYNC_SECRET" https://SEU_DOMINIO/api/sync
```
Importa todos os leads, nomes de etapas e usuários. Em contas muito grandes, rode local (`npm run dev`) para fugir do limite de tempo do host.

## 6. Webhook na Kommo
Integração → Webhooks → URL:
```
https://SEU_DOMINIO/api/webhooks/kommo?secret=SEU_WEBHOOK_SECRET
```
Marque os eventos de lead: **adicionado, editado, excluído, restaurado, etapa alterada, responsável alterado, nota adicionada**.

## 7. Colunas personalizadas
As colunas Vendedor, Marca, Produto procurado etc. são **campos personalizados** da Kommo, identificados pelo nome exato. Para ver os nomes:
```bash
curl -H "Authorization: Bearer $SYNC_SECRET" https://SEU_DOMINIO/api/fields
```
Ajuste `src/lib/columns.ts`. Para criar uma coluna nova é só somar uma linha lá — o banco guarda todos os campos em JSON, sem migração.

## Rede de segurança
Se um webhook se perder (a Kommo tenta no máximo 5 vezes), agende uma chamada periódica que reconcilia só o que mudou recentemente:
```bash
curl -X POST -H "Authorization: Bearer $SYNC_SECRET" "https://SEU_DOMINIO/api/sync?minutes=30"
```

## Notas
- A Kommo exige resposta do webhook em até 2 s; por isso a rota responde `200` na hora e processa depois (`after()`).
- Leads excluídos na Kommo ficam marcados como `is_deleted` (somem do painel, histórico preservado).
- Limite da API da Kommo: ~7 requisições/s; o cliente já espera e tenta de novo em `429`.
