# Setup lingkungan

## 1. Menjalankan di laptop

1. Pasang Node.js LTS (≥ 24).
2. `npm install`
3. Salin `.env.example` menjadi `.env.local`, lalu isi kunci Supabase (langkah 2).
4. `npm run dev` lalu buka http://localhost:3000
5. Cek koneksi: http://localhost:3000/api/health harus menampilkan `"supabase":"ok"`.

## 2. Mengambil kunci Supabase

Project dev: `connectiv-dev` (region Singapore).

1. Buka dashboard Supabase → pilih project `connectiv-dev`.
2. Klik **Project Settings** (ikon gerigi) → **API Keys**.
3. Salin ke `.env.local`:

| Di Supabase | Variabel di `.env.local` |
|---|---|
| Project URL (menu **Data API**, atau tombol **Connect**) | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_...`) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Secret key (`sb_secret_...`, klik ikon mata untuk melihat) | `SUPABASE_SECRET_KEY` |

**Secret key melewati semua RLS.** Jangan dikirim lewat chat, ditempel di kode, atau di-commit. `.env.local` sudah diabaikan Git.

Kalau dashboard hanya menampilkan tab **Legacy API Keys** (`anon` dan `service_role`), buat dulu publishable dan secret key baru di tab **API Keys**.

## 3. Deploy ke Vercel

1. Masuk [vercel.com](https://vercel.com) dengan akun GitHub.
2. **Add New → Project** → import `Connectiv-by-delegativ`. Framework terdeteksi otomatis (Next.js).
3. Di **Environment Variables**, isi tiga variabel yang sama seperti `.env.local`.
4. **Deploy**. Setelah selesai, buka `https://<nama-project>.vercel.app/api/health`.

Setiap push ke `main` otomatis deploy ke produksi Vercel. Setiap pull request mendapat preview URL.

## 4. Supabase CLI (mulai Sprint 1)

```bash
npx supabase login
npx supabase link --project-ref <ref-project>   # ref ada di URL: https://<ref>.supabase.co
npx supabase db push                              # menjalankan migrasi ke project
```
