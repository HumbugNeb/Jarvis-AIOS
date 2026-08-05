"use client";

import { useEffect, useRef } from "react";

export type Line = { id: string; who: "you" | "jarvis"; text: string; final: boolean };

// Thin, full-width transcript bar at the bottom: what you said + what JARVIS replied.
export function Transcript({ lines, visible }: { lines: Line[]; visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  if (!visible) return null;

  return (
    <div className="shrink-0 border-t" style={{ borderColor: "var(--edge)", background: "rgba(11,20,38,0.65)" }}>
      {/* fixed height (not max-height) so streaming replies scroll INSIDE the bar
          instead of growing it and shoving the rest of the HUD upward */}
      <div ref={ref} className="mx-auto flex h-16 max-w-5xl flex-col gap-1 overflow-y-auto px-6 py-2 text-[13px]">
        {lines.length === 0 ? (
          <span style={{ color: "var(--muted)" }}>transcript will appear here as you talk…</span>
        ) : (
          lines.map((l) => (
            <div key={l.id} className="flex gap-2">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: l.who === "you" ? "var(--muted)" : "var(--glow)" }}>
                {l.who === "you" ? "You" : "JARVIS"}
              </span>
              <span style={{ opacity: l.final ? 1 : 0.55 }}>{l.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
