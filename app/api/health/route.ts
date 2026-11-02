import { connection } from "next/server";
import { publicEnv } from "@/lib/env";

// Cek cepat bahwa aplikasi jalan dan bisa menjangkau Supabase dengan kunci
// yang dipasang. Tidak membocorkan nilai kunci.
export async function GET() {
  await connection();

  let supabase: "ok" | "env_tidak_lengkap" | "gagal" = "gagal";
  try {
    const env = publicEnv();
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      cache: "no-store",
    });
    supabase = res.ok ? "ok" : "gagal";
  } catch (error) {
    supabase =
      error instanceof Error && error.message.startsWith("Environment variable")
        ? "env_tidak_lengkap"
        : "gagal";
  }

  return Response.json(
    { app: "ok", supabase },
    { status: supabase === "ok" ? 200 : 503 },
  );
}
