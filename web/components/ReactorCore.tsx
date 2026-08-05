"use client";

// The central JARVIS visualization. Fills its container (so it can shrink when it
// moves into the sidebar). State drives the animation:
//   idle/listening — calm rings   thinking — fast dashed arcs
//   speaking — ripples             booting — expanding burst rings

export type CoreState = "idle" | "listening" | "thinking" | "speaking" | "booting";

const SPEED: Record<CoreState, { outer: number; mid: number }> = {
  idle: { outer: 24, mid: 18 },
  listening: { outer: 15, mid: 11 },
  thinking: { outer: 3, mid: 2 },
  speaking: { outer: 8, mid: 6 },
  booting: { outer: 1.5, mid: 1 },
};

export function ReactorCore({ state }: { state: CoreState }) {
  const s = SPEED[state] ?? SPEED.idle;
  const g = "var(--glow)";

  return (
    <div className="relative grid h-full w-full place-items-center">
      <svg viewBox="0 0 300 300" width="100%" height="100%" style={{ maxWidth: "100%", maxHeight: "100%" }}>
        <circle cx="150" cy="150" r="130" fill="none" stroke={g} strokeOpacity="0.45"
          strokeWidth="1.5" strokeDasharray="6 10" className="spin-cw" style={{ animationDuration: `${s.outer}s` }} />
        <circle cx="150" cy="150" r="100" fill="none" stroke={g} strokeOpacity="0.7"
          strokeWidth="1.5" strokeDasharray="3 9" className="spin-ccw" style={{ animationDuration: `${s.mid}s` }} />

        {state === "thinking" && (
          <>
            <circle cx="150" cy="150" r="78" fill="none" stroke={g} strokeWidth="2.5"
              strokeDasharray="40 220" strokeLinecap="round" className="spin-cw" style={{ animationDuration: "1.1s" }} />
            <circle cx="150" cy="150" r="62" fill="none" stroke="#7dd3fc" strokeWidth="2"
              strokeDasharray="18 200" strokeLinecap="round" className="spin-ccw" style={{ animationDuration: "0.8s" }} />
          </>
        )}

        {state === "speaking" &&
          [0, 1, 2].map((i) => (
            <circle key={i} cx="150" cy="150" r="55" fill="none" stroke={g} strokeWidth="2"
              className="tbc" style={{ animation: `ripple 1.6s ease-out ${i * 0.5}s infinite` }} />
          ))}

        <circle cx="150" cy="150" r="40" fill="url(#coreGrad)" className="tbc"
          style={{ animation: state === "speaking" ? "breathe 0.5s ease-in-out infinite" : "breathe 3.2s ease-in-out infinite", filter: "drop-shadow(0 0 14px var(--glow))" }} />
        <defs>
          <radialGradient id="coreGrad">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="55%" stopColor="var(--glow)" />
            <stop offset="100%" stopColor="var(--glow-soft)" />
          </radialGradient>
        </defs>
      </svg>

      {state === "booting" &&
        [0, 1, 2].map((i) => (
          <span key={i} className="absolute rounded-full"
            style={{ width: "85%", height: "85%", border: "1px solid var(--glow)", animation: `bootBurst 1.4s ease-out ${i * 0.35}s infinite` }} />
        ))}
    </div>
  );
}
