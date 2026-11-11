import { syncAll } from "@/lib/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Carga inicial / reconciliação.
 *   curl -X POST -H "Authorization: Bearer $SYNC_SECRET" https://SEU_DOMINIO/api/sync
 *   curl -X POST -H "Authorization: Bearer $SYNC_SECRET" "https://SEU_DOMINIO/api/sync?minutes=60"
 */
export async function POST(req: Request) {
  if (!process.env.SYNC_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.SYNC_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const minutes = Number(new URL(req.url).searchParams.get("minutes")) || undefined;
  try {
    const synced = await syncAll({ updatedWithinMinutes: minutes });
    return Response.json({ ok: true, synced });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
