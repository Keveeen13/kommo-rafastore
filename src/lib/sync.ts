import {
  fetchContacts,
  fetchLeadCustomFields,
  fetchLeads,
  fetchLeadsByIds,
  fetchPipelines,
  fetchUsers,
  type KommoLead,
} from "./kommo";
import { supabaseAdmin } from "./supabase-admin";

const TZ = "America/Bahia";
const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null);

/** Converte o valor bruto de um campo da Kommo em texto legível. */
function formatValue(type: string | undefined, raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "boolean") return raw ? "Sim" : "Não";
  if (typeof raw === "number" && (type === "date" || type === "date_time" || type === "birthday")) {
    const d = new Date(raw * 1000);
    return type === "date_time"
      ? d.toLocaleString("pt-BR", { timeZone: TZ, hour12: false })
      : d.toLocaleDateString("pt-BR", { timeZone: TZ });
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>; // arquivos, endereços, vínculos…
    return String(o.file_name ?? o.name ?? o.value ?? JSON.stringify(o));
  }
  return String(raw);
}

/** { field_name: "valor1, valor2" } — campos de múltipla escolha viram texto separado por vírgula. */
function flattenCustomFields(lead: KommoLead): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of lead.custom_fields_values ?? []) {
    const v = f.values
      .map((x) => formatValue(f.field_type, x.value))
      .filter(Boolean)
      .join(", ");
    // Kommo permite dois campos com o MESMO nome (ex.: um de texto e um de lista): junta os valores.
    if (v) out[f.field_name] = out[f.field_name] ? `${out[f.field_name]}, ${v}` : v;
  }
  return out;
}

async function toRows(leads: KommoLead[]) {
  const contactIds = [
    ...new Set(
      leads
        .map((l) => (l._embedded?.contacts ?? []).find((c) => c.is_main)?.id ?? l._embedded?.contacts?.[0]?.id)
        .filter((x): x is number => !!x),
    ),
  ];
  const contacts = contactIds.length ? await fetchContacts(contactIds) : new Map();
  const now = new Date().toISOString();

  return leads.map((l) => {
    const cid = (l._embedded?.contacts ?? []).find((c) => c.is_main)?.id ?? l._embedded?.contacts?.[0]?.id ?? null;
    const c = cid ? contacts.get(cid) : undefined;
    return {
      id: l.id,
      name: l.name,
      price: l.price,
      pipeline_id: l.pipeline_id,
      status_id: l.status_id,
      responsible_user_id: l.responsible_user_id,
      contact_id: cid,
      contact_name: c?.name ?? null,
      phone: c?.phone ?? null,
      tags: (l._embedded?.tags ?? []).map((t) => t.name).join(", "),
      created_at_kommo: iso(l.created_at),
      updated_at_kommo: iso(l.updated_at),
      closed_at: iso(l.closed_at),
      is_deleted: false,
      custom_fields: flattenCustomFields(l),
      synced_at: now,
    };
  });
}

async function upsertLeads(leads: KommoLead[]) {
  if (!leads.length) return 0;
  const db = supabaseAdmin();
  const rows = await toRows(leads);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("leads").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error(`Supabase upsert: ${error.message}`);
  }
  return rows.length;
}

/** Rebusca na Kommo os leads informados (sempre dado completo e atual). */
export async function syncLeadsByIds(ids: number[]) {
  if (!ids.length) return 0;
  return upsertLeads(await fetchLeadsByIds(ids));
}

/**
 * FILA DE WEBHOOKS
 * Em vez de 1 busca na Kommo por webhook recebido, junta tudo que chegar em 1,5 s e busca de uma vez
 * (até 250 leads por requisição). Uma edição em massa de 1.000 leads vira ~4 requisições, e não 1.000.
 * Se o processo reiniciar com itens na fila, a reconciliação periódica (/api/sync?minutes=N) recupera.
 */
type Queue = { pending: Set<number>; timer: ReturnType<typeof setTimeout> | null; running: boolean };
const gq = globalThis as unknown as { __leadQueue?: Queue };
const queue: Queue = (gq.__leadQueue ??= { pending: new Set(), timer: null, running: false });
const FLUSH_DELAY_MS = 1500;

function schedule() {
  if (queue.timer || !queue.pending.size) return;
  queue.timer = setTimeout(flush, FLUSH_DELAY_MS);
}

async function flush() {
  queue.timer = null;
  if (queue.running) return schedule();
  queue.running = true;
  try {
    while (queue.pending.size) {
      const batch = [...queue.pending].slice(0, 250);
      batch.forEach((id) => queue.pending.delete(id));
      try {
        const n = await syncLeadsByIds(batch);
        console.log(`[webhook] ${n} lead(s) sincronizado(s)`);
      } catch (e) {
        console.error("[webhook] falha ao sincronizar lote", e);
      }
    }
  } finally {
    queue.running = false;
    schedule();
  }
}

export function queueLeadSync(ids: number[]) {
  ids.forEach((id) => queue.pending.add(id));
  schedule();
}

/** Leads excluídos na Kommo: marca como excluído (mantém histórico, some do dashboard). */
export async function markDeleted(ids: number[]) {
  if (!ids.length) return;
  const { error } = await supabaseAdmin().from("leads").update({ is_deleted: true }).in("id", ids);
  if (error) throw new Error(`Supabase delete: ${error.message}`);
}

/** Carga completa (ou só os alterados nos últimos N minutos — rede de segurança caso um webhook falhe). */
export async function syncAll(opts: { updatedWithinMinutes?: number } = {}) {
  const filters = new URLSearchParams();
  if (opts.updatedWithinMinutes) {
    const from = Math.floor(Date.now() / 1000) - opts.updatedWithinMinutes * 60;
    filters.set("filter[updated_at][from]", String(from));
  }
  filters.set("order[id]", "asc");
  const leads = await fetchLeads(filters);
  // processa em lotes para não segurar tudo em memória de uma vez
  let n = 0;
  for (let i = 0; i < leads.length; i += 500) n += await upsertLeads(leads.slice(i, i + 500));
  await syncDictionaries();
  return n;
}

/** Nomes de funis/etapas, usuários e definição dos campos personalizados (3 requisições). */
export async function syncDictionaries() {
  const db = supabaseAdmin();
  const [pipelines, users, fields] = await Promise.all([fetchPipelines(), fetchUsers(), fetchLeadCustomFields()]);

  const stages = pipelines.flatMap((p) =>
    (p._embedded?.statuses ?? []).map((s) => ({
      id: s.id,
      pipeline_id: p.id,
      pipeline_name: p.name,
      name: s.name,
      sort: s.sort,
    })),
  );
  if (stages.length) {
    // As etapas "Venda ganha/perdida" (ids 142/143) existem em TODOS os funis: a chave é funil + etapa.
    const { error } = await db.from("stages").upsert(stages, { onConflict: "pipeline_id,id" });
    if (error) throw new Error(`Supabase stages: ${error.message}`);
  }
  if (users.length) {
    const { error } = await db
      .from("kommo_users")
      .upsert(users.map((u) => ({ id: u.id, name: u.name })), { onConflict: "id" });
    if (error) throw new Error(`Supabase users: ${error.message}`);
  }
  if (fields.length) {
    const { error } = await db
      .from("field_defs")
      .upsert(fields.map((f) => ({ id: f.id, name: f.name, type: f.type, sort: f.sort })), { onConflict: "id" });
    if (error) throw new Error(`Supabase field_defs: ${error.message}`);
  }
}
