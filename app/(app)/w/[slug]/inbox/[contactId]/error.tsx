"use client";

import { RouteError } from "@/components/route-error";

// Daftar percakapan (layout inbox) tetap tampil; hanya percakapan yang gagal.
export default function ConversationError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <RouteError error={error} retry={retry} title="Percakapan gagal dimuat" />
    </div>
  );
}
