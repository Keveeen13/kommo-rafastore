import { fetchLeadCustomFields } from "@/lib/kommo";

export const dynamic = "force-dynamic";

/** Lista os nomes EXATOS dos campos personalizados de lead (usar em src/lib/columns.ts). */
export async function GET(req: Request) {
  if (!process.env.SYNC_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.SYNC_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const fields = await fetchLeadCustomFields();
  return Response.json(fields.map((f) => ({ id: f.id, name: f.name, type: f.type })));
}
