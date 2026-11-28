"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";

// Notifikasi browser untuk chat baru. Izin hanya diminta lewat klik user.

type Permission = NotificationPermission | "unsupported";

function currentPermission(): Permission {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

export function showChatNotification({
  tag,
  title,
  body,
  onClick,
}: {
  tag: string;
  title: string;
  body: string;
  onClick: () => void;
}) {
  if (currentPermission() !== "granted") return;
  try {
    const n = new Notification(title, { body, tag, icon: "/icon.svg" });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch {
    // Beberapa browser HP hanya mengizinkan notifikasi lewat service worker.
  }
}

export function NotificationToggle() {
  // Dibaca setelah mount supaya HTML server dan klien sama.
  const [permission, setPermission] = useState<Permission | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- izin hanya ada di browser
    setPermission(currentPermission());
  }, []);

  if (!permission || permission === "unsupported") return <span />;

  if (permission === "granted") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <BellRing aria-hidden className="size-4 text-primary" />
        Notifikasi chat baru aktif
      </span>
    );
  }

  if (permission === "denied") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Izinkan notifikasi untuk situs ini di pengaturan browser">
        <BellOff aria-hidden className="size-4" />
        Notifikasi diblokir browser
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={async () => setPermission(await Notification.requestPermission())}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-accent"
    >
      <Bell aria-hidden className="size-4" />
      Aktifkan notifikasi chat baru
    </button>
  );
}
