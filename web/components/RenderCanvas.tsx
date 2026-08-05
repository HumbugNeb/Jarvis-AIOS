"use client";

import type { RenderEvent } from "../lib/contract";

// The freed main area. JARVIS paints data here for any topic — up to 4 panels at once.

export function RenderCanvas({ events }: { events: RenderEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="grid h-full place-items-center">
        <p className="text-sm tracking-[0.3em]" style={{ color: "var(--muted)" }}>
          ASK ME ANYTHING — DATA APPEARS HERE
        </p>
      </div>
    );
  }

  if (events.length === 1) {
    return (
      <div className="grid h-full place-items-center">
        <div className="w-full max-w-3xl">
          <Panel event={events[0]} compact={false} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-2 content-start gap-4 overflow-y-auto pr-1">
      {events.map((e) => <Panel key={e.ts} event={e} compact />)}
    </div>
  );
}

function Panel({ event, compact }: { event: RenderEvent; compact: boolean }) {
  return (
    <div className={`fade-up rounded-2xl border ${compact ? "p-5" : "p-8"}`}
      style={{ background: "var(--panel)", borderColor: "var(--edge)", boxShadow: "0 0 40px rgba(56,189,248,0.08)" }}>
      <h2 className={`mb-4 ${compact ? "text-base" : "text-lg"} font-medium tracking-wide`} style={{ color: "var(--glow)" }}>
        {event.payload?.title}
      </h2>
      {event.render_type === "chart" && <Chart p={event.payload} compact={compact} />}
      {event.render_type === "stat" && <Stats p={event.payload} />}
      {event.render_type === "list" && <List p={event.payload} />}
      {event.render_type === "card" && <Card p={event.payload} />}
    </div>
  );
}

function Chart({ p, compact }: { p: any; compact: boolean }) {
  const labels: string[] = p.labels || [];
  const values: number[] = p.values || [];
  const w = 100, h = 50;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * w : 0;
    const y = max === min ? h / 2 : h - ((v - min) / (max - min)) * h;
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <div>
      {p.unit && <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>{p.unit}</p>}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: compact ? 150 : 240 }} preserveAspectRatio="none">
        <path d={d} fill="none" stroke="var(--glow)" strokeWidth={1.2} pathLength={1} className="draw"
          style={{ filter: "drop-shadow(0 0 4px var(--glow))" }} />
      </svg>
      <div className="mt-3 flex justify-between text-[11px]" style={{ color: "var(--muted)" }}>
        {labels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}

function Stats({ p }: { p: any }) {
  const labels: string[] = p.labels || [];
  const values: string[] = p.values || [];
  return (
    <div className="grid grid-cols-2 gap-3">
      {labels.map((l, i) => (
        <div key={i} className="fade-up rounded-xl border p-3" style={{ borderColor: "var(--edge)", animationDelay: `${i * 80}ms` }}>
          <div className="text-xl font-semibold" style={{ color: "var(--glow)" }}>{values[i]}</div>
          <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{l}</div>
        </div>
      ))}
    </div>
  );
}

function List({ p }: { p: any }) {
  const items: string[] = p.items || [];
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="fade-up flex gap-3" style={{ animationDelay: `${i * 70}ms` }}>
          <span style={{ color: "var(--glow)" }}>▹</span>
          <span className="text-[14px]">{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Card({ p }: { p: any }) {
  return <p className="fade-up whitespace-pre-wrap text-[14px] leading-relaxed">{p.body}</p>;
}
