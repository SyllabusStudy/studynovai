import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";

/** Phone-only drag for floating buttons. Offset is remembered per key. */
export function useDraggable(storageKey: string) {
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [mobile, setMobile] = useState(false);
  const start = useRef<{ px: number; py: number; x: number; y: number; rect: DOMRect } | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    try {
      const v = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (v && typeof v.x === "number" && typeof v.y === "number") setOff(v);
    } catch { /* ignore */ }
    return () => mq.removeEventListener("change", on);
  }, [storageKey]);

  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    if (!mobile) return;
    moved.current = false;
    start.current = { px: e.clientX, py: e.clientY, x: off.x, y: off.y, rect: e.currentTarget.getBoundingClientRect() };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s) return;
    let dx = e.clientX - s.px;
    let dy = e.clientY - s.py;
    if (!moved.current && Math.hypot(dx, dy) < 6) return;
    moved.current = true;
    const m = 8;
    dx = Math.min(Math.max(dx, m - s.rect.left), window.innerWidth - m - s.rect.right);
    dy = Math.min(Math.max(dy, m - s.rect.top), window.innerHeight - m - s.rect.bottom);
    setOff({ x: s.x + dx, y: s.y + dy });
  };
  const onPointerUp = () => {
    if (start.current && moved.current) {
      setOff((o) => { localStorage.setItem(storageKey, JSON.stringify(o)); return o; });
    }
    start.current = null;
  };
  /** Call at the top of onClick; returns true if the click was really a drag. */
  const wasDrag = () => {
    const d = moved.current;
    moved.current = false;
    return d;
  };

  return {
    wasDrag,
    dragProps: {
      onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp,
      style: mobile ? { transform: `translate(${off.x}px, ${off.y}px)`, touchAction: "none" as const } : undefined,
    },
  };
}
