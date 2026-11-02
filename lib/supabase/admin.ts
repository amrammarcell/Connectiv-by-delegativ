import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

// Client dengan secret key: MELEWATI RLS. Hanya untuk webhook, cron, dan
// halaman Super Admin. Jangan dipakai untuk melayani request user biasa.
export function createAdminClient() {
  return createClient(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
