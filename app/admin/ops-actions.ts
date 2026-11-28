"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Menutup alert secara manual (mis. sudah ditangani). Alert dibuka lagi jika
// kondisinya masih gagal di pemeriksaan berikutnya.
export async function dismissOpsAlert(id: number): Promise<void> {
  await requireSuperAdmin();
  const parsed = z.number().int().positive().safeParse(id);
  if (!parsed.success) return;
  await createAdminClient()
    .from("ops_alerts")
    .update({ selesai_pada: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("selesai_pada", null);
  refresh();
}
