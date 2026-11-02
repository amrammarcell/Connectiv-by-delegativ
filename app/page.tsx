import { redirect } from "next/navigation";

// Sementara: langsung ke workspace contoh. Di Sprint 1 halaman ini memeriksa
// login dan mengarahkan ke workspace milik user.
export default function Home() {
  redirect("/w/demo/inbox");
}
