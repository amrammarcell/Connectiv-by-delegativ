import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { accessFromHeaders } from "@/lib/activity-shared";
import { createAdminClient } from "@/lib/supabase/admin";

// Pencatatan aktivitas: log akses Super Admin (PRD §6) dan kunjungan halaman
// (metrik pilot). Ditulis lewat fungsi SQL khusus service_role setelah respons
// terkirim (after), jadi tidak menambah waktu muat halaman. Header dibaca
// sebelum after() karena Server Component tidak boleh membacanya di dalamnya.
// Kegagalan hanya dicatat di log server, tidak pernah menggagalkan halaman.

export async function logAdminAccess(userId: string, workspaceId: string) {
  const { path, aksi } = accessFromHeaders(await headers());
  after(async () => {
    const { error } = await createAdminClient().rpc("log_admin_access", {
      p_user: userId,
      p_workspace: workspaceId,
      p_path: path,
      p_aksi: aksi,
    });
    if (error) console.error(JSON.stringify({ level: "error", type: "admin_access_log", message: error.message }));
  });
}

export type TrackedPage = "dashboard";

export function logPageVisit(userId: string, workspaceId: string, halaman: TrackedPage) {
  after(async () => {
    const { error } = await createAdminClient().rpc("log_page_visit", {
      p_user: userId,
      p_workspace: workspaceId,
      p_halaman: halaman,
    });
    if (error) console.error(JSON.stringify({ level: "error", type: "page_visit", message: error.message }));
  });
}
