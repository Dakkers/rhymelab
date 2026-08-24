/**
 * A module-scoped Baritone toast manager, so code that runs *outside* React can
 * still fire toasts. Our one caller is the global TanStack Query `MutationCache`
 * in `#/router`, whose `onError` has no component to reach `useToast()` from.
 *
 * `BaritoneProvider` (in `#/routes/__root`) is handed this same manager via its
 * `toastManager` prop, which is what connects it to the on-screen viewport.
 * Baritone's `useToast().add` accepts the design-system fields (`intent`, …) at
 * the top level and packs them into base-ui's per-toast `data` bag; firing
 * through the raw manager, we pack `data` ourselves (see {@link ToastData}).
 *
 * `createToastManager` isn't re-exported by Baritone, so it comes straight from
 * `@base-ui/react` — a direct dependency, and the exact provider Baritone's own
 * toast layer is built on.
 */
import type { ReactNode } from "react";
import { Toast } from "@base-ui/react/toast";
import type { ToastData } from "@saintly-software/baritone";

export const toastManager = Toast.createToastManager<ToastData>();

/**
 * Fire a `negative`-intent error toast. `high` priority routes it to an
 * assertive live region so assistive tech announces the failure at once.
 */
export function toastError(title: ReactNode, description?: ReactNode): void {
  toastManager.add({
    title,
    description,
    priority: "high",
    data: { intent: "negative" },
  });
}
