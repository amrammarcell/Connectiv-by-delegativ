import type { Metadata } from "next";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Kebijakan Privasi" };

export default function KebijakanPrivasiPage() {
  return (
    <>
      <h1>Kebijakan Privasi</h1>
      <p className="text-sm text-muted-foreground">Terakhir diperbarui: {COMPANY.lastUpdated}</p>

      <p>
        {COMPANY.product} adalah layanan CRM WhatsApp yang dioperasikan oleh {COMPANY.legalName} (&ldquo;
        {COMPANY.brand}&rdquo;, &ldquo;kami&rdquo;). Kebijakan ini menjelaskan data apa yang kami proses, untuk apa, dan
        hak Anda atas data tersebut, sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.
      </p>

      <h2>Peran kami</h2>
      <ul>
        <li>
          Untuk data akun pengguna {COMPANY.product} (pemilik bisnis, supervisor, dan CS), kami adalah{" "}
          <strong>pengendali data</strong>.
        </li>
        <li>
          Untuk data pelanggan dari bisnis yang memakai {COMPANY.product} (isi chat WhatsApp, nama, dan nomor telepon),
          kami bertindak sebagai <strong>prosesor data</strong> atas nama bisnis tersebut, berdasarkan perjanjian dengan
          bisnis itu.
        </li>
      </ul>

      <h2>Data yang kami proses</h2>
      <ul>
        <li>Data akun pengguna: nama, email, peran, dan riwayat login.</li>
        <li>
          Data WhatsApp dari nomor bisnis yang dihubungkan klien melalui WhatsApp Business Platform milik Meta: pesan
          masuk dan keluar (teks dan lampiran), nama profil dan nomor telepon kontak, waktu pesan, dan riwayat chat yang
          dibagikan bisnis saat menghubungkan nomornya.
        </li>
        <li>
          Data iklan: identitas iklan asal chat (Click-to-WhatsApp), serta biaya, tayangan, dan klik iklan dari akun iklan
          Meta yang aksesnya diberikan klien.
        </li>
        <li>Data pipeline yang dimasukkan pengguna: tahap penjualan, nilai transaksi, alasan batal, dan catatan.</li>
      </ul>

      <h2>Tujuan pemrosesan</h2>
      <ul>
        <li>Menampilkan percakapan WhatsApp bisnis klien di satu dashboard untuk dipantau tim mereka.</li>
        <li>Mengelola pipeline penjualan dan mencatat hasil closing atau batal.</li>
        <li>Menghitung performa iklan sampai penjualan, misalnya biaya per closing.</li>
        <li>Menjaga keamanan layanan, mencegah penyalahgunaan, dan memberikan dukungan.</li>
      </ul>
      <p>
        Kami tidak menjual data, tidak memakai isi chat pelanggan klien untuk iklan kami sendiri, dan tidak membagikannya
        kepada pihak lain selain penyedia infrastruktur yang disebut di bawah.
      </p>

      <h2>Penyimpanan dan pihak ketiga</h2>
      <ul>
        <li>Data disimpan di database dan storage terenkripsi milik Supabase, dengan akses dibatasi per workspace.</li>
        <li>Aplikasi dijalankan di infrastruktur Vercel.</li>
        <li>Data WhatsApp dan iklan diterima dari Meta Platforms sesuai izin yang diberikan klien.</li>
      </ul>

      <h2>Masa simpan</h2>
      <p>
        Data disimpan selama klien berlangganan. Setelah langganan berakhir atau atas permintaan klien, data workspace
        dihapus paling lambat 30 hari, kecuali wajib disimpan lebih lama menurut hukum.
      </p>

      <h2>Hak Anda</h2>
      <p>
        Anda berhak meminta akses, perbaikan, atau penghapusan data pribadi Anda, serta menarik persetujuan. Pelanggan
        dari bisnis yang memakai {COMPANY.product} dapat menghubungi bisnis tersebut atau kami. Cara meminta penghapusan
        dijelaskan di halaman <a href="/hapus-data">Penghapusan Data</a>.
      </p>

      <h2>Kontak</h2>
      <p>
        {COMPANY.legalName}
        <br />
        {COMPANY.address}
        <br />
        Email: {COMPANY.email}
      </p>
    </>
  );
}
