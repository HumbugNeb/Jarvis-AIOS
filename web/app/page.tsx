"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { ReactorCore, type CoreState } from "../components/ReactorCore";
import { CameraHud } from "../components/CameraHud";
import { RenderCanvas } from "../components/RenderCanvas";
import { Transcript, type Line } from "../components/Transcript";
import { RENDER_TYPES, type RenderEvent } from "../lib/contract";

type Conn = "idle" | "connecting" | "live" | "error";
type Ai = "listening" | "thinking" | "speaking";

export default function Page() {
  const [conn, setConn] = useState<Conn>("idle");
  const [booting, setBooting] = useState(false);
  const [ai, setAi] = useState<Ai>("listening");
  const [panels, setPanels] = useState<RenderEvent[]>([]);  // up to 4 panels on screen
  const [lines, setLines] = useState<Line[]>([]);
  const [camTrack, setCamTrack] = useState<MediaStreamTrack | null>(null);

  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement | null>(null);
  const topSlot = useRef<HTMLDivElement | null>(null);
  const centerSlot = useRef<HTMLDivElement | null>(null);
  const powerSlot = useRef<HTMLDivElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const [coreBox, setCoreBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [powerPos, setPowerPos] = useState<{ cx: number; cy: number } | null>(null);

  const agentSpeaking = useRef(false);
  const userSpeaking = useRef(false);
  const lastUserSpoke = useRef(0);
  const agentAttr = useRef("");

  const awake = conn === "live";

  // Float the core over the active slot — centre before Wake, sidebar after.
  const placeCore = useCallback(() => {
    const el = awake ? topSlot.current : centerSlot.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoreBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [awake]);

  // The power button lives in the top slot while asleep and glides down to sit above
  // the camera once awake (Wake -> Shut Down). We track its centre and translate it.
  const placePower = useCallback(() => {
    const el = awake ? powerSlot.current : topSlot.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPowerPos({ cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
  }, [awake]);

  useLayoutEffect(() => {
    placeCore();
    placePower();
    // re-measure after layout settles (the camera panel changes the sidebar height)
    const t1 = setTimeout(() => { placeCore(); placePower(); }, 120);
    const t2 = setTimeout(() => { placeCore(); placePower(); }, 650);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [placeCore, placePower]);

  useEffect(() => {
    const onResize = () => { placeCore(); placePower(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [placeCore, placePower]);

  // Follow any sidebar layout shift (so the floating button never drifts off the camera).
  useEffect(() => {
    const el = asideRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { placeCore(); placePower(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [placeCore, placePower]);

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  function recompute() {
    let s: Ai;
    if (agentSpeaking.current || agentAttr.current === "speaking") s = "speaking";
    else if (agentAttr.current === "thinking") s = "thinking";
    else if (userSpeaking.current) s = "listening";
    else if (Date.now() - lastUserSpoke.current < 3500) s = "thinking";
    else s = "listening";
    setAi(s);
  }

  function pushLine(who: "you" | "jarvis", id: string, text: string, final: boolean) {
    if (!text) return;
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === id);
      const line: Line = { id, who, text, final };
      if (i >= 0) { const c = prev.slice(); c[i] = line; return c; }
      return [...prev, line].slice(-50);
    });
  }

  async function start() {
    try {
      setConn("connecting");
      const res = await fetch("/api/token");
      if (!res.ok) throw new Error("token request failed");
      const { token, url } = await res.json();

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio && audioRef.current) audioRef.current.appendChild(track.attach());
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const me = room.localParticipant.identity;
        agentSpeaking.current = speakers.some((p) => p.identity !== me);
        userSpeaking.current = speakers.some((p) => p.identity === me);
        if (userSpeaking.current) lastUserSpoke.current = Date.now();
        recompute();
      });
      room.on(RoomEvent.ParticipantAttributesChanged, (changed, p) => {
        if (p.identity !== room.localParticipant.identity) {
          const v = changed?.["lk.agent.state"] ?? p.attributes?.["lk.agent.state"];
          if (v) { agentAttr.current = v; recompute(); }
        }
      });
      // render events from JARVIS's screen tools
      room.on(RoomEvent.DataReceived, (payload, _p, _k, topic) => {
        if (topic !== "AIOS") return;
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload)) as RenderEvent;
          if (!(RENDER_TYPES as readonly string[]).includes(msg.render_type)) return;
          if (msg.render_type === "clear") setPanels([]);
          else setPanels((prev) => [...prev, msg].slice(-4)); // keep newest 4
        } catch { /* ignore */ }
      });
      // transcript: your words + JARVIS's replies
      room.on(RoomEvent.TranscriptionReceived, (segs, participant) => {
        const who = participant && participant.identity === room.localParticipant.identity ? "you" : "jarvis";
        for (const s of segs) pushLine(who, s.id, s.text, s.final);
      });
      room.on(RoomEvent.Disconnected, () => setConn("idle"));

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);

      setConn("live");
      setBooting(true);
      setTimeout(() => setBooting(false), 2600);

      // publish the webcam in the BACKGROUND so going live isn't delayed by camera setup;
      // the agent (and the HUD overlay) pick up the track as soon as it's ready
      room.localParticipant
        .setCameraEnabled(true)
        .then((camPub) => setCamTrack(camPub?.track?.mediaStreamTrack ?? null))
        .catch((e) => console.warn("camera publish failed", e));
    } catch (e) {
      console.error(e);
      setConn("error");
    }
  }

  // Return to the "sleep" state: leave the room (the agent ends its job on our
  // disconnect) and reset the HUD, without closing the tab. Wake starts fresh.
  function shutdown() {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setConn("idle");
    setBooting(false);
    setPanels([]);
    setLines([]);
    setCamTrack(null);
    setAi("listening");
  }

  useEffect(() => {
    if (conn !== "live") return;
    const id = setInterval(recompute, 400);
    return () => clearInterval(id);
  }, [conn]);

  const coreState: CoreState = booting ? "booting" : awake ? ai : "idle";
  const statusLabel =
    awake ? (booting ? "Booting…" : ai[0].toUpperCase() + ai.slice(1)) :
    conn === "connecting" ? "Connecting…" :
    conn === "error" ? "Error — see console" : "Standby";

  return (
    <main className="relative flex h-screen flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <aside ref={asideRef} className="flex w-72 shrink-0 flex-col gap-4 border-r p-6" style={{ borderColor: "var(--edge)" }}>
          <div className="flex items-center gap-3">
            <span className="orb inline-block h-3 w-3 rounded-full" style={{ background: "var(--glow)", boxShadow: "0 0 16px var(--glow)" }} />
            <h1 className="text-xl font-semibold tracking-[0.3em]">JARVIS</h1>
          </div>

          {/* reactor lands here (top-left); the power button's asleep anchor otherwise */}
          <div ref={topSlot} className="h-24 w-full" />

          {/* status — sits directly underneath the reactor */}
          <p className="text-center text-xs uppercase tracking-widest" style={{ color: "var(--muted)" }}>{statusLabel}</p>

          <div className="mt-auto flex flex-col gap-3">
            {/* the power button glides down to here (above the camera) once awake */}
            <div ref={powerSlot} className="h-11 w-full" />
            {awake && <CameraHud track={camTrack} />}
          </div>
        </aside>

        <section className="relative flex-1 overflow-hidden p-6">
          {/* pre-Wake the core is centred here; on Wake it glides to the sidebar (top-left) */}
          <div ref={centerSlot} className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2" />
          {awake ? (
            <RenderCanvas events={panels} />
          ) : (
            <div className="flex h-full items-end justify-center pb-10">
              <p className="text-sm tracking-[0.3em]" style={{ color: "var(--muted)" }}>
                {conn === "connecting" ? "WAKING…" : conn === "error" ? "SOMETHING WENT WRONG" : "PRESS WAKE TO BEGIN"}
              </p>
            </div>
          )}
        </section>
      </div>

      <Transcript lines={lines} visible={awake} />

      {/* power control: "Wake JARVIS" up top while asleep; glides down to a red
          "Shut Down JARVIS" above the camera once awake. */}
      {powerPos && (
        <button
          onClick={awake ? shutdown : start}
          disabled={conn === "connecting"}
          className="fixed z-20 whitespace-nowrap rounded-md border px-5 py-2.5 text-sm tracking-wide transition-colors hover:bg-white/5 disabled:opacity-50"
          style={{
            top: powerPos.cy, left: powerPos.cx, transform: "translate(-50%, -50%)",
            borderColor: awake ? "var(--risk)" : "var(--glow)",
            color: awake ? "var(--risk)" : "var(--glow)",
            transition: "top 0.7s cubic-bezier(0.4,0,0.2,1), left 0.7s cubic-bezier(0.4,0,0.2,1), color 0.4s ease, border-color 0.4s ease",
          }}
        >
          {awake ? "Shut Down JARVIS" : conn === "connecting" ? "Connecting…" : "Wake JARVIS"}
        </button>
      )}

      {/* the floating core that animates between the centre and the sidebar */}
      {coreBox && (
        <div className="pointer-events-none fixed z-10"
          style={{ top: coreBox.top, left: coreBox.left, width: coreBox.width, height: coreBox.height, transition: "top 0.7s cubic-bezier(0.4,0,0.2,1), left 0.7s cubic-bezier(0.4,0,0.2,1), width 0.7s cubic-bezier(0.4,0,0.2,1), height 0.7s cubic-bezier(0.4,0,0.2,1)" }}>
          <ReactorCore state={coreState} />
        </div>
      )}

      <div ref={audioRef} className="hidden" />
    </main>
  );
}
