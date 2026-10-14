// The HUD's state contract: the values its band and handoff pane draw from.
// Held by the session in $.state; each session reads its own figures.

export type UsageReading = {
  // The five-hour rate-limit window, null until a response reports it.
  fiveHourPct: number | null
  fiveHourResetsAt: string | null
  // The live context window; null until the session's first response.
  contextPct: number | null
  contextTokens: number | null
  contextWindow: number | null
}

export type HandoffState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'ready'; text: string }
  | { kind: 'failed'; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-hud': {
      now: number
      usage: UsageReading
      handoff: HandoffState
    }
  }
}
