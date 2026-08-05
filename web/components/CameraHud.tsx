"use client";

import { useEffect, useRef, useState } from "react";

// Live webcam HUD. Runs entirely in the browser via MediaPipe:
//   - ObjectDetector  -> "what's in frame" (labelled boxes)
//   - GestureRecognizer -> hand tracking + recognised gestures
// Models + WASM load from CDN on first mount.

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const GESTURE_MODEL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
const OBJECT_MODEL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite";

// --- gesture classification from 21 hand landmarks -------------------------
const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);

// angle (degrees) at vertex b, between b->a and b->c — rotation-invariant
function angleAt(b: any, a: any, c: any): number {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}
// a finger is "extended" only if it's roughly straight at its PIP knuckle (not curled)
const isExtended = (lm: any[], mcp: number, pip: number, tip: number) => angleAt(lm[pip], lm[mcp], lm[tip]) > 150;

function classifyGesture(lm: any[], mpName: string): string {
  const handSize = dist(lm[0], lm[9]) || 1;
  const idx = isExtended(lm, 5, 6, 8);
  const mid = isExtended(lm, 9, 10, 12);
  const ring = isExtended(lm, 13, 14, 16);
  const pinky = isExtended(lm, 17, 18, 20);
  const thumbIndexPinched = dist(lm[4], lm[8]) < handSize * 0.5;

  // custom gestures (not in MediaPipe's defaults) take priority
  if (thumbIndexPinched && mid && ring && pinky) return "OK sign";       // 👌 thumb+index circle, 3 spread
  if (mid && !idx && !ring && !pinky) return "Middle finger";            // 🖕 only middle up

  // map MediaPipe's built-ins to the requested labels
  const map: Record<string, string> = {
    Open_Palm: "Open palm",
    Closed_Fist: "Closed palm",
    Thumb_Up: "Thumbs up",
    Thumb_Down: "Thumbs down",
  };
  return map[mpName] || (mpName ? mpName.replace(/_/g, " ") : "—");
}

// most-common label over recent frames -> a stable, non-flickering reading
function mode(arr: string[]): string {
  const counts: Record<string, number> = {};
  let best = arr[arr.length - 1] ?? "—", bestN = 0;
  for (const x of arr) {
    counts[x] = (counts[x] || 0) + 1;
    if (counts[x] > bestN) { bestN = counts[x]; best = x; }
  }
  return best;
}

export function CameraHud({ track }: { track: MediaStreamTrack | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gestureBuffers = useRef<Record<string, string[]>>({});  // per-hand smoothing buffers
  const lastGesture = useRef("—");
  const [gesture, setGesture] = useState("—");
  const [objects, setObjects] = useState<string[]>([]);
  const [status, setStatus] = useState("loading optics…");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!track) return;   // wait for the shared camera track published to the room

    // MediaPipe's TFLite runtime prints benign "INFO:" notices (e.g. creating the
    // XNNPACK CPU delegate) to stderr, which Emscripten forwards to console.error.
    // Next's dev overlay then flags them as red "Console Error" cards though nothing
    // is wrong. Drop just those info lines once; every real error still passes through.
    if (!(window as any).__mpQuietPatched) {
      (window as any).__mpQuietPatched = true;
      const origError = console.error.bind(console);
      console.error = (...a: any[]) =>
        typeof a[0] === "string" && a[0].startsWith("INFO:") ? undefined : origError(...a);
    }

    let raf = 0;
    let gestureRec: any = null;
    let objectDet: any = null;
    let draw: any = null;
    let HAND: any = null;
    let stopped = false;
    let lastObjAt = 0;
    let lastTs = 0;
    let boxes: any[] = [];

    (async () => {
      try {
        const vision: any = await import("@mediapipe/tasks-vision");
        const { FilesetResolver, GestureRecognizer, ObjectDetector, DrawingUtils } = vision;
        HAND = GestureRecognizer.HAND_CONNECTIONS;

        const fileset = await FilesetResolver.forVisionTasks(WASM);
        gestureRec = await GestureRecognizer.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: GESTURE_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        objectDet = await ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: OBJECT_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          scoreThreshold: 0.45,
          maxResults: 5,
        });

        const video = videoRef.current!;
        video.srcObject = new MediaStream([track]);   // the same track that's published to the room
        // play() can reject with an AbortError if the effect re-runs — harmless, ignore it.
        try { await video.play(); } catch { /* interrupted / autoplay policy */ }
        if (stopped) return;
        setStatus("");

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        draw = new DrawingUtils(ctx);

        const loop = () => {
          if (stopped) return;
          const v = videoRef.current;
          if (v && v.readyState >= 2) {
            if (canvas.width !== v.videoWidth) {
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
            }
            // MediaPipe VIDEO mode requires strictly-increasing timestamps; a repeated
            // or backwards value throws and would kill the loop. Force it monotonic.
            let now = performance.now();
            if (now <= lastTs) now = lastTs + 1;
            lastTs = now;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // hands + gestures (every frame) — guarded so a transient vision error skips
            // one frame instead of throwing out of the animation loop.
            let g: any = null;
            try { g = gestureRec.recognizeForVideo(v, now); } catch { /* skip this frame */ }
            if (g?.landmarks) {
              for (const lm of g.landmarks) {
                draw.drawConnectors(lm, HAND, { color: "rgba(56,189,248,0.9)", lineWidth: 3 });
                draw.drawLandmarks(lm, { color: "#e0f2fe", radius: 3 });
              }
            }
            // classify + smooth EACH hand independently (keyed by handedness so the two
            // readings don't swap), then show both
            if (g?.landmarks && g.landmarks.length > 0) {
              const seen: Record<string, string> = {};
              for (let i = 0; i < g.landmarks.length; i++) {
                const hand = g.handedness?.[i]?.[0]?.categoryName || `H${i}`;
                const mp = g.gestures?.[i]?.[0]?.categoryName || "";
                const raw = classifyGesture(g.landmarks[i], mp);
                const buf = (gestureBuffers.current[hand] ||= []);
                buf.push(raw);
                if (buf.length > 6) buf.shift();
                seen[hand] = mode(buf);
              }
              // forget hands that have left the frame
              for (const k of Object.keys(gestureBuffers.current)) if (!(k in seen)) delete gestureBuffers.current[k];
              const order = ["Left", "Right"];
              const combined = Object.keys(seen)
                .sort((a, b) => order.indexOf(a) - order.indexOf(b))
                .map((k) => seen[k])
                .join("   ·   ");
              if (combined !== lastGesture.current) { lastGesture.current = combined; setGesture(combined); }
            } else {
              gestureBuffers.current = {};
              if (lastGesture.current !== "—") { lastGesture.current = "—"; setGesture("—"); }
            }

            // objects (throttled) — same guard as gestures
            if (now - lastObjAt > 250) {
              lastObjAt = now;
              try {
                const od = objectDet.detectForVideo(v, now);
                boxes = od.detections || [];
                setObjects(
                  Array.from(new Set(boxes.map((d: any) => d.categories?.[0]?.categoryName).filter(Boolean))).slice(0, 4) as string[]
                );
              } catch { /* skip this detection */ }
            }
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(125,211,252,0.9)";
            ctx.fillStyle = "rgba(125,211,252,0.95)";
            ctx.font = "13px sans-serif";
            for (const d of boxes) {
              const b = d.boundingBox;
              if (!b) continue;
              ctx.strokeRect(b.originX, b.originY, b.width, b.height);
              const c = d.categories?.[0];
              if (c) ctx.fillText(`${c.categoryName} ${Math.round(c.score * 100)}%`, b.originX + 4, b.originY + 16);
            }
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch (e: any) {
        console.error(e);
        setErr(e?.message || "camera / vision failed to start");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      // the camera track is owned by the LiveKit room, so we don't stop it here
      try { gestureRec?.close?.(); objectDet?.close?.(); } catch {}
    };
  }, [track]);

  return (
    <div className="rounded-xl border p-2" style={{ borderColor: "var(--edge)", background: "var(--panel)" }}>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--muted)" }}>Optics</span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: err ? "var(--risk)" : "var(--glow)", boxShadow: "0 0 6px var(--glow)" }} />
      </div>

      <div className="relative overflow-hidden rounded-lg" style={{ aspectRatio: "4 / 3", background: "#000" }}>
        <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute left-0 h-[2px] w-full"
          style={{ background: "linear-gradient(90deg, transparent, var(--glow), transparent)", animation: "scanline 3.5s linear infinite", opacity: 0.5 }} />
        {(status || err) && (
          <div className="absolute inset-0 grid place-items-center px-2 text-center text-[11px]" style={{ color: err ? "var(--risk)" : "var(--muted)" }}>
            {err || status}
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1 px-1 text-[11px]">
        <div><span style={{ color: "var(--muted)" }}>gesture </span><span style={{ color: "var(--glow)" }}>{gesture}</span></div>
        <div><span style={{ color: "var(--muted)" }}>objects </span><span>{objects.length ? objects.join(" · ") : "—"}</span></div>
      </div>
    </div>
  );
}
