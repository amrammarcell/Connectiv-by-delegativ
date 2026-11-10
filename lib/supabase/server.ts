import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { publicEnv } from "@/lib/env";

// Client untuk Server Component, Server Action, dan Route Handler dengan sesi
// user dari cookie. Semua query tunduk RLS.
export async function createClient() {
  // Data per user selalu dibaca saat request. Tanpa ini Next.js 16 mencoba
  // prerender dan gagal karena Supabase memeriksa masa berlaku token (Date.now).
  await connection();
  const env = publicEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Dipanggil dari Server Component (cookie read-only). Aman diabaikan
            // selama proxy menyegarkan sesi.
          }
        },
      },
    },
  );
}
