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
  | { kind: 'working'; startedAt: number }
  // `path` is where the handoff was saved, null when the write failed; `cost` reads what the fork spent.
  | { kind: 'ready'; text: string; path: string | null; cost: string }
  | { kind: 'failed'; reason: string }

// A handoff a previous session left on disk, offered when a new session opens.
export type ResumeOffer = { path: string; savedAt: number } | null

export type ClawdState = {
  kind:
    | 'parado'
    | 'pensando'
    | 'lendo'
    | 'editando'
    | 'terminal'
    | 'web'
    | 'orquestrando'
    | 'trabalhando'
    | 'esperando'
    | 'aguardando'
    | 'compactando'
    | 'concluido'
    | 'interrompido'
    | 'erro'
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-hud': {
      now: number
      usage: UsageReading
      handoff: HandoffState
      resume: ResumeOffer
      clawd: ClawdState
    }
  }
}
