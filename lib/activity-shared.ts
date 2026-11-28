// Bagian murni dari lib/activity.ts, dipakai juga oleh proxy.ts dan test.

// Diisi proxy.ts dengan pathname request (header asli dari klien ditimpa).
export const PATH_HEADER = "x-connectiv-path";

export type AccessKind = "lihat" | "aksi";

type HeaderReader = { get(name: string): string | null };

// Server Action dikirim dengan header "next-action"; selain itu membuka halaman.
export function accessFromHeaders(headers: HeaderReader): { path: string; aksi: AccessKind } {
  const raw = headers.get(PATH_HEADER) ?? "";
  const path = raw.startsWith("/") ? raw.slice(0, 300) : "/";
  return { path, aksi: headers.get("next-action") ? "aksi" : "lihat" };
}
