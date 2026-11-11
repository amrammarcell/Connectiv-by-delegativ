# Connectiv

CRM WhatsApp dengan atribusi iklan Meta sampai closing, untuk klien Delegativ.

- Apa yang dibangun: `docs/PRD.md`
- Bagaimana dibangun: `docs/ARCHITECTURE.md`
- Task per sprint: `docs/TASKS.md` (centang task yang selesai)

@AGENTS.md

## Stack

Next.js 16 (App Router, `cacheComponents` aktif) · TypeScript · Tailwind v4 + shadcn/ui (Base UI) · Supabase (Postgres + RLS, Auth, Realtime, Storage) · Vitest · Vercel.

Next.js 16 berbeda dari versi lama: `middleware.ts` sekarang `proxy.ts`, data runtime (`cookies()`, `headers()`, query DB) harus berada di dalam `<Suspense>` atau di-cache dengan `use cache`. Baca `node_modules/next/dist/docs/` sebelum memakai API yang belum pernah dipakai di repo ini.

## Perintah

```bash
npm run dev         # http://localhost:3000
npm run lint
npm run typecheck
npm test            # Vitest
npm run build
npx supabase db push --remote   # terapkan migrasi ke project dev (tanpa Docker)
npm run seed:dev    # workspace /w/demo + akun QA (kredensial di .qa-credentials.json)
npm run admin:promote -- email   # jadikan akun Super Admin
npm run webhook:tokens   # buat token webhook WhatsApp di .env.local (tidak dicetak)
```

Webhook WhatsApp: `app/api/webhooks/whatsapp/[token]/route.ts`. Lewat Dualhook, signature Meta tidak bisa diverifikasi (secret milik Dualhook), jadi token rahasia di URL wajib. Payload mentah selalu disimpan ke `webhook_events` sebelum membalas 200. Lihat `docs/BSP.md`.

`npm test` juga menjalankan test RLS (`tests/rls/`) terhadap project Supabase dev dari `.env.local`; test itu dilewati jika kunci tidak ada (CI). Setiap tabel baru dengan `workspace_id` wajib ditambah ke test isolasi.

## Auth dan akses

- `proxy.ts` menyegarkan sesi dan mengarahkan ke `/login`. Hak akses per workspace dicek di `lib/auth.ts` (`requireUser`, `requireWorkspace`, `requireSuperAdmin`), lalu dijaga lagi oleh RLS.
- Komponen yang membaca sesi atau data user harus berada di dalam `<Suspense>`. `lib/supabase/server.ts` memanggil `connection()` supaya selalu dirender saat request.
- Server Action wajib memanggil `requireWorkspace`/`requireSuperAdmin` sendiri dan memakai `refresh()` dari `next/cache` setelah mengubah data.
- Pembuatan akun (`lib/accounts.ts`) memakai Admin API; pemanggil harus sudah memeriksa hak akses. Keanggotaan tetap ditulis lewat client sesi supaya RLS ikut memeriksa.

Di laptop pengembang (Windows), Node ada di `C:\Program Files\nodejs`. Jika `node` tidak ditemukan di Bash, tambahkan ke PATH.

## Struktur

- `app/(app)/w/[slug]/...` halaman per workspace (inbox, pipeline, kontak, dashboard, pengaturan)
- `app/api/...` route handler (webhook, cron, health)
- `components/ui` komponen shadcn (jangan diedit manual kecuali perlu), `components/` komponen aplikasi
- `lib/supabase/{client,server,admin}.ts` tiga jenis client Supabase
- `lib/env.ts` (publik) dan `lib/env.server.ts` (rahasia) validasi env dengan Zod
- `supabase/migrations` skema, RLS, fungsi SQL
- `tests/` Vitest

## Aturan

- **Bahasa UI Indonesia.** Format angka/Rupiah `id-ID`, zona waktu `Asia/Jakarta`. Kode, nama variabel, dan pesan commit dalam bahasa Inggris; komentar boleh Indonesia.
- **Isolasi workspace di database.** Setiap tabel dengan `workspace_id` wajib RLS. Query dari UI selalu lewat `lib/supabase/server.ts` atau `client.ts` (sesi user).
- **`lib/supabase/admin.ts` melewati RLS.** Hanya untuk webhook, cron, dan halaman Super Admin.
- **Rahasia hanya di env var** (`.env.local`, Vercel). Jangan menulis kunci di kode, test, log, atau chat. Variabel baru: tambahkan ke schema Zod dan `.env.example`.
- **Test wajib** untuk webhook handler (adapter + processor, pakai fixture payload Meta) dan RLS (isolasi antar workspace dan peran).
- **Satu fitur per sesi**: rencana → kode → `lint`, `typecheck`, `test` → commit.
- Tampilan mengikuti prototipe UI (artifact "Connectiv UI Preview"): warna utama teal `#0F5E57`, sidebar gelap `#0E1B1A`, font Plus Jakarta Sans. Token warna ada di `app/globals.css`.
