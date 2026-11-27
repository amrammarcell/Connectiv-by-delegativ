import { connection } from "next/server";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { timed } from "@/lib/timing";

type SupabaseStatus = "ok" | "env_tidak_lengkap" | "gagal";

function isMissingEnv(error: unknown) {
  return (
    error instanceof Error && error.message.startsWith("Environment variable")
  );
}

// Cek cepat bahwa aplikasi jalan dan bisa menjangkau Supabase dengan kunci
// yang dipasang, plus latensi ke database dan region fungsi Vercel (kosong di
// lokal). Tidak membocorkan nilai kunci atau env lain.
export async function GET() {
  await connection();

  let supabase: SupabaseStatus = "gagal";
  let authMs: number | null = null;
  try {
    const env = publicEnv();
    const auth = await timed(() =>
      fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
        cache: "no-store",
      }),
    );
    if (auth.result) authMs = auth.ms;
    supabase = auth.result?.ok ? "ok" : "gagal";
  } catch (error) {
    supabase = isMissingEnv(error) ? "env_tidak_lengkap" : "gagal";
  }

  // Query ringan lewat PostgREST (admin client, tanpa data dikembalikan).
  let queryMs: number | null = null;
  if (supabase === "ok") {
    try {
      const admin = createAdminClient();
      const query = await timed(async () => {
        const { error } = await admin
          .from("workspaces")
          .select("id", { head: true, count: "exact" })
          .limit(1);
        if (error) throw error;
      });
      if (!query.error) queryMs = query.ms;
    } catch {
      // Secret key tidak terpasang: lewati pengukuran query.
    }
  }

  return Response.json(
    {
      app: "ok",
      supabase,
      region: process.env.VERCEL_REGION ?? "",
      db_latency_ms: { auth_health: authMs, query: queryMs },
    },
    { status: supabase === "ok" ? 200 : 503 },
  );
}
