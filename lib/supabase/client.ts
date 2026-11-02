import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

// Client untuk Client Component (realtime, query dengan sesi user, tunduk RLS).
export function createClient() {
  const env = publicEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
