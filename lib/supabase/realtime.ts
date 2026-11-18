import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./client";

// Berlangganan Realtime dengan JWT user. Tanpa setAuth eksplisit, channel yang
// dibuka sebelum sesi terbaca memakai kunci anonim, sehingga RLS menolak semua
// baris dan tidak ada event yang masuk.
export function subscribeWithAuth(
  name: string,
  setup: (channel: RealtimeChannel, supabase: SupabaseClient) => RealtimeChannel,
): () => void {
  const supabase = createClient();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  void (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) await supabase.realtime.setAuth(data.session.access_token);
    if (cancelled) return;
    channel = setup(supabase.channel(name), supabase).subscribe();
  })();

  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
