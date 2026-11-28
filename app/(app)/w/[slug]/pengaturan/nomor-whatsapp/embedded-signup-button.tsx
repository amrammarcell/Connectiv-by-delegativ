"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/app/actions/auth";
import {
  COEXISTENCE_FEATURE_TYPE,
  SESSION_INFO_VERSION,
  parseEmbeddedSignupMessage,
} from "@/lib/whatsapp/embedded-signup";
import { completeEmbeddedSignup } from "./actions";

// Facebook JS SDK (dimuat dari connect.facebook.net). Hanya bagian yang dipakai.
type FbLoginResponse = { authResponse?: { code?: string } | null; status?: string };
type FbSdk = {
  init(opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(cb: (r: FbLoginResponse) => void, opts: Record<string, unknown>): void;
};
declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

const SDK_ID = "facebook-jssdk";

function loadSdk(appId: string, version: string): Promise<FbSdk> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB!);
    };
    if (document.getElementById(SDK_ID)) return;
    const script = document.createElement("script");
    script.id = SDK_ID;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error("Facebook SDK gagal dimuat."));
    document.body.appendChild(script);
  });
}

// Tombol Embedded Signup + Coexistence: Owner login Facebook, memilih akun
// WhatsApp Business App-nya, lalu code + WABA ID dikirim ke server.
export function EmbeddedSignupButton({
  slug,
  appId,
  configId,
  graphVersion,
}: {
  slug: string;
  appId: string;
  configId: string;
  graphVersion: string;
}) {
  const [state, setState] = useState<FormState>({});
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  // code (FB.login) dan WABA ID (postMessage) datang terpisah, urutan bebas.
  const session = useRef<{ code?: string; wabaId?: string; phoneNumberId?: string | null; done?: boolean }>({});
  const submitRef = useRef<() => void>(() => {});

  useEffect(() => {
    loadSdk(appId, graphVersion).catch(() => setState({ error: "Facebook SDK gagal dimuat. Muat ulang halaman." }));
  }, [appId, graphVersion]);

  useEffect(() => {
    function submitIfReady() {
      const s = session.current;
      if (!s.code || !s.wabaId || s.done) return;
      s.done = true;
      const input = { code: s.code, wabaId: s.wabaId, phoneNumberId: s.phoneNumberId ?? null };
      startTransition(async () => {
        const result = await completeEmbeddedSignup(slug, input);
        setState(result);
        setBusy(false);
      });
    }

    function onMessage(e: MessageEvent) {
      const ev = parseEmbeddedSignupMessage(e.origin, e.data);
      if (!ev) return;
      if (ev.kind === "finish") {
        session.current.wabaId = ev.wabaId;
        session.current.phoneNumberId = ev.phoneNumberId;
        submitIfReady();
      } else if (ev.kind === "cancel") {
        setBusy(false);
        setState({ error: "Penyambungan dibatalkan." });
      } else {
        setBusy(false);
        setState({ error: `Meta: ${ev.message}` });
      }
    }

    window.addEventListener("message", onMessage);
    // Simpan submitIfReady untuk callback FB.login.
    submitRef.current = submitIfReady;
    return () => window.removeEventListener("message", onMessage);
  }, [slug]);

  async function start() {
    setState({});
    session.current = {};
    let fb: FbSdk;
    try {
      fb = await loadSdk(appId, graphVersion);
    } catch {
      setState({ error: "Facebook SDK gagal dimuat. Muat ulang halaman." });
      return;
    }
    setBusy(true);
    fb.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setBusy(false);
          setState((prev) => (prev.error ? prev : { error: "Login Facebook dibatalkan." }));
          return;
        }
        session.current.code = code;
        submitRef.current();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: COEXISTENCE_FEATURE_TYPE,
          sessionInfoVersion: SESSION_INFO_VERSION,
        },
      },
    );
  }

  const working = busy || pending;
  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" onClick={start} disabled={working}>
        {pending ? "Menyambungkan…" : busy ? "Menunggu Meta…" : "Tambah nomor WhatsApp"}
      </Button>
      <FormMessage state={state} className="max-w-sm text-right" />
    </div>
  );
}
