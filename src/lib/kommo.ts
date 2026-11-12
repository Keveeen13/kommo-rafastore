// Cliente mínimo da API v4 da Kommo (somente servidor).
// Docs: https://pt-developers.kommo.com/reference/lista-de-leads

export type KommoCustomField = {
  field_id: number;
  field_name: string;
  field_code: string | null;
  field_type?: string;
  values: { value: unknown }[];
};

export type KommoLead = {
  id: number;
  name: string | null;
  price: number | null;
  responsible_user_id: number | null;
  status_id: number | null;
  pipeline_id: number | null;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
  is_deleted?: boolean;
  custom_fields_values: KommoCustomField[] | null;
  _embedded?: {
    contacts?: { id: number; is_main: boolean }[];
    tags?: { id: number; name: string }[];
  };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function baseUrl() {
  const sub = process.env.KOMMO_SUBDOMAIN;
  if (!sub) throw new Error("KOMMO_SUBDOMAIN não definido");
  return `https://${sub}.kommo.com/api/v4`;
}

/**
 * LIMITADOR GLOBAL DE REQUISIÇÕES
 * A Kommo permite no máximo 7 requisições/segundo por conta. Toda chamada ao Kommo passa por aqui:
 * cada requisição só pode começar 200 ms depois da anterior (= no máx. 5 por segundo, deixando folga
 * para outras integrações que usem a mesma conta). O estado fica em globalThis para ser UM só,
 * compartilhado entre webhook, sincronização e qualquer rota do Next dentro do mesmo processo.
 */
const MIN_INTERVAL_MS = Math.max(150, Number(process.env.KOMMO_MIN_INTERVAL_MS) || 200);
const gl = globalThis as unknown as { __kommoNextSlot?: number };

async function throttle() {
  const now = Date.now();
  const start = Math.max(now, gl.__kommoNextSlot ?? 0);
  gl.__kommoNextSlot = start + MIN_INTERVAL_MS;
  if (start > now) await sleep(start - now);
}

export async function kommoGet<T>(path: string, params?: URLSearchParams): Promise<T | null> {
  const url = `${baseUrl()}${path}${params ? `?${params}` : ""}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    await throttle();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.KOMMO_ACCESS_TOKEN}` },
      cache: "no-store",
    });
    if (res.status === 204) return null; // sem conteúdo (fim da paginação)
    if (res.status === 429) {
      // A Kommo disse "devagar": segura TODAS as requisições por alguns segundos.
      gl.__kommoNextSlot = Date.now() + 1000 * (attempt + 1);
      continue;
    }
    if (!res.ok) throw new Error(`Kommo ${res.status} em ${path}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }
  throw new Error(`Kommo: muitas tentativas (429) em ${path}`);
}

const LIMIT = 250; // máximo permitido pela API

/** Busca leads por filtro, paginando até acabar. */
export async function fetchLeads(filters: URLSearchParams = new URLSearchParams()): Promise<KommoLead[]> {
  const all: KommoLead[] = [];
  for (let page = 1; ; page++) {
    const p = new URLSearchParams(filters);
    p.set("with", "contacts");
    p.set("limit", String(LIMIT));
    p.set("page", String(page));
    const data = await kommoGet<{ _embedded?: { leads: KommoLead[] } }>("/leads", p);
    const leads = data?._embedded?.leads ?? [];
    all.push(...leads);
    if (leads.length < LIMIT) break;
  }
  return all;
}

export async function fetchLeadsByIds(ids: number[]): Promise<KommoLead[]> {
  const out: KommoLead[] = [];
  for (let i = 0; i < ids.length; i += LIMIT) {
    const f = new URLSearchParams();
    ids.slice(i, i + LIMIT).forEach((id) => f.append("filter[id][]", String(id)));
    out.push(...(await fetchLeads(f)));
  }
  return out;
}

export type ContactInfo = { name: string | null; phone: string | null };

export async function fetchContacts(ids: number[]): Promise<Map<number, ContactInfo>> {
  const map = new Map<number, ContactInfo>();
  for (let i = 0; i < ids.length; i += LIMIT) {
    const p = new URLSearchParams();
    ids.slice(i, i + LIMIT).forEach((id) => p.append("filter[id][]", String(id)));
    p.set("limit", String(LIMIT));
    const data = await kommoGet<{
      _embedded?: { contacts: { id: number; name: string | null; custom_fields_values: KommoCustomField[] | null }[] };
    }>("/contacts", p);
    for (const c of data?._embedded?.contacts ?? []) {
      const phone = c.custom_fields_values?.find((f) => f.field_code === "PHONE")?.values?.[0]?.value;
      map.set(c.id, { name: c.name, phone: phone != null ? String(phone) : null });
    }
  }
  return map;
}

export async function fetchPipelines() {
  const data = await kommoGet<{
    _embedded?: {
      pipelines: { id: number; name: string; _embedded?: { statuses: { id: number; name: string; sort: number }[] } }[];
    };
  }>("/leads/pipelines");
  return data?._embedded?.pipelines ?? [];
}

export async function fetchUsers() {
  const data = await kommoGet<{ _embedded?: { users: { id: number; name: string }[] } }>("/users");
  return data?._embedded?.users ?? [];
}

export async function fetchLeadCustomFields() {
  const data = await kommoGet<{
    _embedded?: { custom_fields: { id: number; name: string; type: string; sort: number }[] };
  }>("/leads/custom_fields", new URLSearchParams({ limit: "250" }));
  return data?._embedded?.custom_fields ?? [];
}
