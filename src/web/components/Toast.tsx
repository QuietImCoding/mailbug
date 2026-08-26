import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastState {
  message: string;
  /** Bumped on every call so repeating the same message restarts the timer. */
  seq: number;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const seq = useRef(0);

  const show = useCallback((message: string) => {
    seq.current += 1;
    setToast({ message, seq: seq.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  return { toast, show };
}

export function Toast({ toast }: { toast: ToastState | null }) {
  return (
    <div
      className={toast ? "toast show" : "toast"}
      role="status"
      aria-live="polite"
    >
      {toast?.message ?? ""}
    </div>
  );
}
