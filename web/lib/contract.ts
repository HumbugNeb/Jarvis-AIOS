// Agent -> HUD render contract (mirrors agent/render.py :: RENDER_TYPES).
// JARVIS can paint the main area for ANY topic via these general panel types.

export const RENDER_TYPES = ["chart", "stat", "list", "card", "clear"] as const;
export type RenderType = (typeof RENDER_TYPES)[number];

export interface RenderEvent {
  v: number;
  render_type: RenderType;
  ts: number;
  payload: any;
}

// payload shapes:
//  chart -> { title, labels: string[], values: number[], unit?: string }
//  stat  -> { title, labels: string[], values: string[] }
//  list  -> { title, items: string[] }
//  card  -> { title, body: string }
