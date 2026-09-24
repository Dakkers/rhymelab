/**
 * Toasts for code outside React. `toastManager` MUST be passed to
 * `BaritoneProvider` for toasts to appear.
 *
 * Unlike `useToast().add`, the raw manager takes Baritone fields such as
 * `intent` inside `data` (see {@link ToastData}).
 */
import type { ReactNode } from "react";
import { Toast } from "@base-ui/react/toast";
import type { ToastData } from "@saintly-software/baritone";

/** Show an error toast that screen readers announce immediately. */
export function toastError(title: ReactNode, description?: ReactNode): void {
  toastManager.add({
    title,
    description,
    priority: "high",
    data: { intent: "negative" },
  });
}

export const toastManager = Toast.createToastManager<ToastData>();
