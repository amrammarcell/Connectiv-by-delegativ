import type { FormState } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

export function FormMessage({ state, className }: { state: FormState; className?: string }) {
  if (state.error) {
    return (
      <p role="alert" className={cn("text-sm font-medium text-destructive", className)}>
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className={cn("text-sm font-medium text-primary", className)}>
        {state.success}
      </p>
    );
  }
  return null;
}
