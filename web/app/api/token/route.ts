import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

// Mints a short-lived LiveKit token so the browser HUD can join the room.
// Server-side only — the API secret never reaches the client.
export async function GET() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  // Unique room per connect: guarantees LiveKit dispatches a fresh agent every Wake,
  // instead of reusing a stale/agentless room on reconnect.
  const room = `jarvis-${Math.random().toString(36).slice(2, 10)}`;

  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json(
      { error: "Missing LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET in .env.local" },
      { status: 500 },
    );
  }

  const identity = `hud-${Math.random().toString(36).slice(2, 8)}`;
  const at = new AccessToken(apiKey, apiSecret, { identity });
  at.addGrant({
    room,
    roomJoin: true,
    canSubscribe: true, // hear JARVIS + receive render events
    canPublish: true, // publish the operator's mic so Gemini can hear
    canPublishData: true,
  });

  const token = await at.toJwt();
  return NextResponse.json({ token, url });
}
