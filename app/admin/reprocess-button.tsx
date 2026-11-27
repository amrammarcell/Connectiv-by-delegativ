"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/app/actions/auth";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { reprocessWebhooks } from "./actions";

export function ReprocessButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({});
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        type="button"
        disabled={pending || disabled}
        onClick={() => startTransition(async () => setState(await reprocessWebhooks()))}
      >
        {pending ? "Memproses…" : "Proses ulang"}
      </Button>
      <FormMessage state={state} className="max-w-md sm:text-right" />
    </div>
  );
}
