# Pemilihan BSP untuk pilot

Status: **usulan, menunggu keputusan** · Riset: 10 Nov 2026

Checklist mengacu ke PRD §2.5. Data dari dokumentasi resmi Meta dan 360dialog, serta halaman Dualhook (vendor sendiri, termasuk perbandingan pesaing). Harga belum dikonfirmasi lewat kontak sales; cek ulang sebelum berlangganan.

## Fakta dari Meta (berlaku untuk semua BSP)

- Coexistence hanya bisa di-onboard oleh **Solution Partner atau Tech Provider** lewat Embedded Signup. Itu sebabnya kita butuh BSP sampai Delegativ sendiri menjadi Tech Provider.
- Syarat klien: WhatsApp Business app **versi 2.24.17+**, dan app harus dibuka kira-kira **setiap 14 hari** (vendor menyarankan 13 hari sebagai batas aman).
- **Riwayat chat 6 bulan** bisa disinkronkan, tetapi permintaan sync hanya sekali dan **harus dalam 24 jam setelah onboarding**. Ini masuk SOP onboarding.
- Webhook yang perlu: `messages`, `smb_message_echoes`, `history`, `smb_app_state_sync` (kontak), `account_update`.
- **Grup tidak disinkronkan.** Pesan sekali-lihat, pesan sementara, dan live location tidak didukung.
- **Balasan CS dari WhatsApp for Windows dan WearOS tidak memicu webhook**, jadi tidak ter-mirror. CS harus membalas dari HP (atau perangkat tertaut lain yang didukung). Ini berpengaruh langsung ke target mirror ≥ 99%.
- Throughput tetap 20 pesan/detik. Pesan dari app tetap gratis; hanya pesan yang dikirim lewat Cloud API yang dikenai biaya (MVP tidak mengirim).

## Perbandingan

| | **Dualhook** | **360dialog** | **WATI / respond.io** | **Twilio** | **Tech Provider sendiri** |
|---|---|---|---|---|---|
| Coexistence | Ya, Embedded Signup otomatis | Ya | Ya | **Tidak** | Ya |
| `history` + `smb_message_echoes` | Ya, sync diminta otomatis | Ya | Tidak jelas | — | Ya |
| Format webhook asli Meta | Ya (Webhook Override, langsung dari Meta) | Sebagian: pesan dan echo format Meta, `history` dan kontak dibungkus format 360dialog | Tidak jelas, platform inbox sendiri | — | Ya |
| Biaya | $12/bln (1 nomor), $25 (≤5), $45 (≤10), trial 14 hari | Mulai $59 / €49 per nomor per bulan | $59–$99+/bln, sudah termasuk inbox mereka | — | Gratis (biaya Meta saja) |
| Lock-in nomor | Belum jelas untuk pindah ke Tech Provider sendiri | **Nomor COEX tidak bisa dipindah antar WABA** | Tidak jelas | — | — |
| Catatan | Vendor kecil, reputasi dan SLA belum terbukti | Solution Partner mapan; ada laporan pengguna soal sinkronisasi tidak sesuai dokumentasi | Menyimpan isi chat di platform mereka, tumpang tindih dengan produk kita | Tidak memenuhi syarat | Butuh verifikasi bisnis PT + app review Meta (beberapa minggu) |

## Rekomendasi (direvisi 10 Nov 2026)

1. **Dualhook hanya untuk uji nomor internal Delegativ.** Ketentuan Dualhook: layanan untuk aset WhatsApp *milik sendiri*; onboarding nomor pihak ketiga, multi-tenant, dan reseller **tidak diizinkan di paket mana pun**. Jadi Dualhook tidak bisa dipakai untuk nomor klien pilot.
2. **Untuk nomor klien: Tech Provider Delegativ sendiri (utama) atau 360dialog (cadangan).** Mulai proses Tech Provider sekarang: verifikasi bisnis PT Trinitas Delegasi Kreatif + app review. Jika belum disetujui saat pilot, pakai program partner 360dialog (perhatikan pembungkus `history` dan nomor COEX yang tidak bisa dipindah antar WABA).
3. **Kode tidak bergantung pada pilihan ini.** Webhook Dualhook dan Tech Provider sama-sama format Meta.

## Temuan dari dokumentasi Dualhook

- Pesan, echo, history, dan kontak dikirim **langsung dari Meta** ke URL kita (Webhook Override) dalam format Meta. Dualhook tidak menyimpan dan tidak bisa mengirim ulang payload, jadi endpoint kita harus menyimpan dulu sebelum membalas 200.
- `X-Hub-Signature-256` ditandatangani dengan **app secret Dualhook** yang tidak bisa kita ketahui. Verifikasi signature (PRD §6) baru mungkin setelah memakai app Meta sendiri (Tech Provider). Selama uji, keaslian dijaga oleh token rahasia di URL, verify token, dan pemeriksaan bentuk payload.
- Sinkronisasi kontak lalu riwayat diminta otomatis oleh Dualhook saat onboarding (dalam 24 jam). Riwayat hanya dikirim jika bisnis memilih membagikannya; jika ditolak, datang error `2593109`.
- Media diunduh lewat Runtime API Dualhook dengan API key per koneksi (`dh_live_…`); media id masuk kedaluwarsa 7 hari.
- Onboarding memutus semua perangkat tertaut (WhatsApp Web dsb.); perlu ditautkan ulang.
- Trial 14 hari, wajib kartu pembayaran saat daftar, tidak ditagih jika dibatalkan sebelum trial berakhir.

WATI dan respond.io tidak disarankan: mereka platform inbox lengkap (pesaing produk kita) dan kita tidak butuh fiturnya. Twilio tidak mendukung Coexistence.

## Yang harus dibuktikan di uji nomor internal (sebelum klien)

- [ ] Payload `messages`, `smb_message_echoes`, `history` benar-benar format Meta (simpan contohnya sebagai fixture test).
- [ ] Riwayat chat masuk setelah onboarding; catat berapa lama.
- [ ] Balasan CS dari HP dan dari WhatsApp Web muncul sebagai echo; balasan dari WhatsApp for Windows tidak (konfirmasi batasan).
- [ ] Chat dari iklan CTWA membawa `referral` dengan `source_id` iklan.
- [ ] Bisa melepas nomor dari Dualhook tanpa mengganggu WhatsApp Business app.

## Sumber

- [Meta: Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)
- [Meta: WhatsApp changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog)
- [360dialog: Coexistence](https://docs.360dialog.com/docs/resources/phone-numbers/coexistence) · [Partner onboarding](https://docs.360dialog.com/partner/onboarding/whatsapp-coexistence) · [Webhook reference](https://docs.360dialog.com/docs/messaging/webhook/webhook-reference)
- [Dualhook: Coexistence docs](https://dualhook.com/docs/coexistence) · [Perbandingan provider (ditulis Dualhook)](https://dualhook.com/best-whatsapp-coexistence-providers)
- [360dialog: WhatsApp Coexistence (blog)](https://360dialog.com/blog/whatsapp-coexistence/)
- [Kanal: perbandingan 14 BSP](https://getkanal.com/blog/whatsapp-business-api-providers-compared)
- [Make Community: echoes tidak tersedia di konektor](https://community.make.com/t/whatsapp-coexistence-watch-events-does-not-expose-smb-message-echoes/114713)
