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

## 6. Nomor tes WhatsApp (app Meta "Connectiv")

App ID `1432513006614956`, nomor tes `+1 555 166 1742`, WABA (Messaging account) `1785116869270754`.

1. Webhook: **Connect on WhatsApp → Step 2. Production setup → Configure Webhooks**. Callback URL `https://<domain>/api/webhooks/whatsapp/<WHATSAPP_WEBHOOK_PATH_TOKEN>`, Verify token `WHATSAPP_VERIFY_TOKEN`, subscribe field `messages`.
2. App harus **Published**; sebelum itu Meta hanya mengirim webhook tes dari dashboard.
3. **Wajib**: langganankan app ke WABA. Di [Graph API Explorer](https://developers.facebook.com/tools/explorer/), app Connectiv, user token dengan `whatsapp_business_management` + `whatsapp_business_messaging`, lalu `POST 1785116869270754/subscribed_apps` → `{"success": true}`. Cek dengan `GET` di path yang sama: Connectiv harus ada di daftar. Tanpa ini chat asli tidak diteruskan.
4. Nomor HP penerima didaftarkan di **Step 1. Try it out → Recipient** (maks. 5).
5. Lihat webhook yang masuk: `npm run webhook:latest` (tambah `-- 3 --raw` untuk payload lengkap).

## 7. Data iklan Meta (spend harian)

Dashboard menghitung biaya per chat, biaya per closing, dan ROAS dari spend yang ditarik setiap hari pukul 02.00 WIB (Vercel Cron `/api/cron/daily`).

1. **Klien membagikan ad account ke BM Delegativ.** Di Business Manager klien: Business settings → Accounts → Ad accounts → pilih akun → Assign partners → masukkan Business ID Delegativ → izin lihat performa (View performance / Analyze).
2. **System user di BM Delegativ.** Business settings → Users → System users → Add. Lalu Assign assets: ad account klien tadi (lihat performa) dan app **Connectiv**.
3. **Token.** Pada system user → Generate new token → app Connectiv → izin `ads_read` → masa berlaku *Never*. Simpan ke Vercel dan `.env.local` sebagai `META_ADS_ACCESS_TOKEN`. Jika sync gagal dengan pesan izin `ads_read`, tambahkan izin itu di app (Permissions and features).
4. **`CRON_SECRET`** di Vercel: salin dari `.env.local` (`npm run webhook:tokens` membuatnya).
5. **Daftarkan ad account** di `/admin` → Akun iklan Meta (ID `act_…`, ada di Ads Manager), lalu klik **Sync sekarang**.

## 8. Nomor klien lewat Dualhook (sementara, sebelum Tech Provider aktif)

Dualhook dipakai atas nama klien (nomor milik klien sendiri). Webhook-nya memakai URL terpisah karena Meta menandatangani dengan app secret Dualhook.

1. Vercel: tambahkan `WHATSAPP_DUALHOOK_PATH_TOKEN` dan `WHATSAPP_DUALHOOK_VERIFY_TOKEN` (salin dari `.env.local`, dibuat oleh `npm run webhook:tokens`), lalu Redeploy.
2. Dashboard Dualhook → **New Connection** (satu per nomor):
   - Webhook URL: `https://<domain>/api/webhooks/whatsapp/<WHATSAPP_DUALHOOK_PATH_TOKEN>`
   - Verify token: `WHATSAPP_DUALHOOK_VERIFY_TOKEN`
   - Embedded Signup dengan **Business Portfolio milik klien**; HP CS memakai WhatsApp Business 2.24.17+; izinkan berbagi riwayat chat.
   - Klik **Test Ping** (harus sukses).
3. Salin **Phone Number ID** dan **WABA ID** dari Dualhook ke `/admin` → Nomor WhatsApp (pilih workspace klien, label, CS pemilik). Webhook yang sempat masuk sebelum nomor didaftarkan langsung diproses.
4. Pindah ke jalur resmi nanti: di HP, WhatsApp Business → Settings → Account → Business Platform → Disconnect, lalu sambungkan ulang lewat Connectiv. Data kontak dan pesan tetap.
