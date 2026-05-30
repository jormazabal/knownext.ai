import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type CountdownCloseButtonProps = {
  onClose: () => void;
  ariaLabel: string;
  durationMs?: number;
  resetKey?: string | number;
  className?: string;
};

const DEFAULT_DURATION_MS = 10_000;
const RADIUS = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CountdownCloseButton({
  onClose,
  ariaLabel,
  durationMs = DEFAULT_DURATION_MS,
  resetKey,
  className = "",
}: CountdownCloseButtonProps) {
  const onCloseRef = useRef(onClose);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const closedRef = useRef(false);
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const clampedDurationMs = Math.max(durationMs, 1);
  const progress = Math.max(0, Math.min(1, remainingMs / clampedDurationMs));

  function clearCountdownTimers() {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function closeOnce() {
    if (closedRef.current) return;
    closedRef.current = true;
    clearCountdownTimers();
    onCloseRef.current();
  }

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const startedAt = Date.now();
    closedRef.current = false;
    clearCountdownTimers();
    setRemainingMs(clampedDurationMs);

    intervalRef.current = window.setInterval(() => {
      setRemainingMs(Math.max(0, clampedDurationMs - (Date.now() - startedAt)));
    }, 100);
    timeoutRef.current = window.setTimeout(closeOnce, clampedDurationMs);

    return clearCountdownTimers;
  }, [clampedDurationMs, resetKey]);

  return (
    <button
      type="button"
      className={[
        "relative grid h-7 w-7 shrink-0 place-items-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-brand-orange/30",
        className,
      ].join(" ")}
      aria-label={ariaLabel}
      onClick={closeOnce}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r={RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
        <circle
          cx="14"
          cy="14"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </svg>
      <X className="pointer-events-none" size={13} strokeWidth={2.2} />
    </button>
  );
}
