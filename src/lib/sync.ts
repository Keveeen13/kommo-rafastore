import {
  fetchContacts,
  fetchLeads,
  fetchLeadsByIds,
  fetchPipelines,
  fetchUsers,
  type KommoLead,
} from "./kommo";
import { supabaseAdmin } from "./supabase-admin";

const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null);

/** { field_name: "valor1, valor2" } — campos de múltipla escolha viram texto separado por vírgula. */
function flattenCustomFields(lead: KommoLead): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of lead.custom_fields_values ?? []) {
    const v = f.values.map((x) => String(x.value ?? "")).filter(Boolean).join(", ");
    if (v) out[f.field_name] = v;
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

/** Chamado pelo webhook: rebusca na Kommo os leads alterados (sempre dado completo e atual). */
export async function syncLeadsByIds(ids: number[]) {
  if (!ids.length) return 0;
  return upsertLeads(await fetchLeadsByIds(ids));
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

/** Nomes de etapas/funis e usuários. */
export async function syncDictionaries() {
  const db = supabaseAdmin();
  const [pipelines, users] = await Promise.all([fetchPipelines(), fetchUsers()]);

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
    const { error } = await db.from("stages").upsert(stages, { onConflict: "id" });
    if (error) throw new Error(`Supabase stages: ${error.message}`);
  }
  if (users.length) {
    const { error } = await db
      .from("kommo_users")
      .upsert(users.map((u) => ({ id: u.id, name: u.name })), { onConflict: "id" });
    if (error) throw new Error(`Supabase users: ${error.message}`);
  }
}
