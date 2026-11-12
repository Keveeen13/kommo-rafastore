import { after } from "next/server";
import { markDeleted, queueLeadSync } from "@/lib/sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Eventos que exigem rebuscar o lead; "delete" marca como excluído.
const UPSERT_EVENTS = ["add", "update", "status", "responsible", "restore", "note"];

type Found = { upsert: Set<number>; del: Set<number> };

/** Aceita JSON ({leads:{update:[{id}]}}) ou form-urlencoded (leads[update][0][id]=123). */
function parsePayload(raw: string, contentType: string): Found {
  const found: Found = { upsert: new Set(), del: new Set() };
  const add = (event: string, id: unknown) => {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) return;
    (event === "delete" ? found.del : found.upsert).add(n);
  };

  let json: any = null;
  if (contentType.includes("json") || raw.trim().startsWith("{")) {
    try {
      json = JSON.parse(raw);
    } catch {}
  }

  if (json?.leads) {
    for (const [event, items] of Object.entries<any>(json.leads)) {
      if (!Array.isArray(items)) continue;
      for (const it of items) add(event, event === "note" ? (it?.note?.element_id ?? it?.element_id) : it?.id);
    }
  } else {
    for (const [k, v] of new URLSearchParams(raw)) {
      let m = k.match(/^leads\[(\w+)\]\[\d+\]\[id\]$/);
      if (m && m[1] !== "note") add(m[1], v);
      m = k.match(/^leads\[note\]\[\d+\]\[note\]\[element_id\]$/);
      if (m) add("note", v);
    }
  }
  return found;
}

export async function POST(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const raw = await req.text();
  const { upsert, del } = parsePayload(raw, req.headers.get("content-type") ?? "");

  // A Kommo exige resposta em até 2s: responde já e processa em seguida.
  after(async () => {
    try {
      // Os leads vão para a fila (agrupados em lotes, respeitando o limite da Kommo).
      queueLeadSync([...upsert].filter((id) => !del.has(id)));
      await markDeleted([...del]);
    } catch (e) {
      console.error("[webhook kommo]", e);
    }
  });

  return new Response("ok", { status: 200 });
}

export async function GET() {
  return new Response(`webhook ativo (eventos: ${UPSERT_EVENTS.join(", ")}, delete)`);
}
