import { createClient } from "@supabase/supabase-js";

// Cliente com service role: ignora RLS. Usar SOMENTE em código de servidor.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Variáveis do Supabase não definidas");
  return createClient(url, key, { auth: { persistSession: false } });
}
