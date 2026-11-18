"use client";

import { useEffect, useState } from "react";

// Waktu sekarang yang diperbarui berkala, supaya label "12 mnt lalu" berjalan
// sendiri tanpa query ulang.
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
