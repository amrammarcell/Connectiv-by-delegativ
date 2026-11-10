# Setup lingkungan

## 1. Menjalankan di laptop

1. Pasang Node.js LTS (≥ 24).
2. `npm install`
3. Salin `.env.example` menjadi `.env.local`, lalu isi kunci Supabase (langkah 2).
4. `npm run dev` lalu buka http://localhost:3000
5. Cek koneksi: http://localhost:3000/api/health harus menampilkan `"supabase":"ok"`.

## 2. Mengambil kunci Supabase

Project dev: `connectiv-dev` (ref `ghytnrhapfxzwfszdyop`, region Seoul). Paket Free mem-pause project setelah ±7 hari tidak dipakai: buka dashboard lalu klik **Restore project**.

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

## 4. Supabase CLI dan migrasi

```bash
npx supabase login                                    # sekali per laptop
npx supabase link --project-ref ghytnrhapfxzwfszdyop  # sekali per clone
npx supabase db push --remote                         # terapkan migrasi baru
```

Migrasi baru ditulis di `supabase/migrations/<timestamp>_<nama>.sql`. Tanpa Docker, tidak ada database lokal: migrasi langsung diterapkan ke project dev, lalu `npm test` menjalankan test RLS terhadapnya.

## 5. Akun

- **Super Admin Delegativ**: buat akun di Supabase → **Authentication → Users → Add user → Create new user** (centang *Auto Confirm User*, isi password sendiri), lalu jalankan `npm run admin:promote -- email@anda.com`. Masuk lewat `/login`, halaman admin ada di `/admin`.
- **Workspace dan Owner klien**: dibuat dari `/admin`. Owner menambah Supervisor/CS dari **Pengaturan**. Akun baru mendapat password sementara yang ditampilkan sekali; user menggantinya lewat menu **Ganti password**.
- **Pendaftaran publik dimatikan**: Supabase → **Authentication → Sign In / Providers** → matikan *Allow new users to sign up*. Akun hanya dibuat oleh admin atau Owner.
- **Data demo (khusus dev)**: `npm run seed:dev` membuat workspace `/w/demo` dan akun QA Owner + CS. Kredensialnya ditulis ke `.qa-credentials.json` (tidak di-commit).
