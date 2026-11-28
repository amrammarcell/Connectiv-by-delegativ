import { createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/lib/whatsapp/media";

// Membuka media sebuah pesan: cek sesi, baca pesan lewat RLS (CS hanya kontak
// miliknya), lalu alihkan ke signed URL Storage yang berlaku 1 jam. Signed URL
// juga dibuat dengan sesi user, jadi policy Storage ikut memeriksa.
// Dipakai langsung sebagai src <img>/<audio>/<video> dan tautan unduh
// (?download=1 memakai nama file asli).

const SIGNED_URL_SECONDS = 60 * 60;

export async function GET(request: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return new Response("Unauthorized", { status: 401 });

  const { data: message } = await supabase
    .from("messages")
    .select("media_path, nama_file")
    .eq("id", id)
    .maybeSingle<{ media_path: string | null; nama_file: string | null }>();
  if (!message?.media_path) return new Response("Not found", { status: 404 });

  const download = new URL(request.url).searchParams.has("download");
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(
      message.media_path,
      SIGNED_URL_SECONDS,
      download ? { download: message.nama_file ?? true } : undefined,
    );
  if (error || !data?.signedUrl) return new Response("Not found", { status: 404 });

  // Browser boleh memakai ulang pengalihan ini selama URL masih berlaku.
  return new Response(null, {
    status: 302,
    headers: {
      Location: data.signedUrl,
      "Cache-Control": `private, max-age=${SIGNED_URL_SECONDS - 300}`,
    },
  });
}
