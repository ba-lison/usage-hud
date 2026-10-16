import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register, RenderChildren, RenderSurface, Timer } from 'claude-code'

import type { ClawdState, HandoffState, ResumeOffer, UsageReading } from '../types'
import {
  ASKS,
  CLAUDE_ORANGE,
  CLAWD_LABEL,
  CLAWD_SIZE,
  CONTEXT_BLUE,
  TRANSIENT,
  baseColor,
  clawdSvg,
  miniClawd,
  rampColor,
  toolKind,
} from './clawd'
import type { ClawdKind } from './clawd'

const PANE = 'usage-hud-handoff'
const FIVE_HOUR = 'five_hour'
const TICK_MS = 60_000
const CELLS = 24
const LABEL_W = 11
const PCT_W = 5
const WARN_AT = 73 // the alert shows a little before the bars heat, while there is room to stop
const FULL_AT = 97 // past this a fork no longer fits: offer compaction instead
const HANDOFF_TIMEOUT_MS = 180_000
const SETTLE_MS = 5_000 // how long concluído, interrompido and erro stay before he settles
const RESUME_WITHIN_MS = 24 * 60 * 60 * 1000
const HANDOFF_DIR = '.claude/handoff'

const NO_USAGE: UsageReading = {
  fiveHourPct: null,
  fiveHourResetsAt: null,
  contextPct: null,
  contextTokens: null,
  contextWindow: null,
}

const nowAt = atom({ plugin: 'usage-hud', key: 'now' } as const, 0)
const usage = atom({ plugin: 'usage-hud', key: 'usage' } as const, NO_USAGE)
const handoff = atom({ plugin: 'usage-hud', key: 'handoff' } as const, { kind: 'idle' } as HandoffState)
const resume = atom({ plugin: 'usage-hud', key: 'resume' } as const, null as ResumeOffer)
const clawd = atom({ plugin: 'usage-hud', key: 'clawd' } as const, { kind: 'parado', at: 0 } as ClawdState)

// The micro-handoff: fixed fields with a cap on each, so the reply stays short and cheap.
const HANDOFF_PROMPT = [
  'Escreva o handoff desta sessão para eu continuar numa sessão nova sem perder nada.',
  'Não use ferramentas: responda só com o texto, a partir do que já está nesta conversa.',
  'Seja enxuto, no máximo uns 600 tokens. Português do Brasil, markdown, sem preâmbulo, exatamente estas seções:',
  '',
  '## Objetivo',
  '1 a 3 frases.',
  '',
  '## Estado',
  'Comece com "status: feito", "status: em andamento" ou "status: bloqueado". O que já está feito e verificado, o que está em andamento, a branch e o último commit se houver.',
  '',
  '## Decisões',
  'Até 5 itens, cada um com o motivo em poucas palavras, incluindo o que foi descartado e por quê.',
  '',
  '## Arquivos',
  'Até 10 caminhos, cada um com 1 linha do que mudou ou por que importa.',
  '',
  '## Bloqueios e pendências',
  'Até 3 itens.',
  '',
  '## Preferências',
  'Pedidos explícitos meus que valem na próxima sessão.',
  '',
  '## Próximo passo',
  'Uma frase imperativa.',
].join('\n')

// What the summarizer keeps when the person compacts from the HUD instead of leaving the session.
const COMPACT_INSTRUCTIONS = [
  'Resuma como um handoff: objetivo, estado atual, decisões com o motivo (incluindo o que foi descartado),',
  'arquivos alterados com o que mudou, bloqueios, preferências explícitas do usuário e o próximo passo.',
  'Mantenha decisões e restrições ao pé da letra; resuma só o resto.',
].join(' ')

const REASON_TEXT: Record<string, string> = {
  'nothing-to-fork': 'a sessão ainda não tem resposta para resumir',
  'api-error': 'a API recusou o pedido (o contexto pode estar cheio demais: tente Compactar)',
  'empty-reply': 'a resposta veio vazia, tente de novo',
  aborted: 'o pedido foi interrompido',
  timeout: 'demorou mais de 3 minutos, tente de novo',
}

function resumePrompt(path: string): string {
  return `Leia ${path} antes de qualquer ação: é o handoff da sessão anterior e a fonte de verdade. Confirme em 1 frase o próximo passo e comece por ele.`
}

// What the clipboard gets: the instruction first, so a paste is enough to resume.
function copyText(text: string): string {
  return `Leia o handoff abaixo antes de qualquer ação: ele é a fonte de verdade. Confirme em 1 frase o próximo passo e comece por ele.\n\n${text}`
}

// A thin bar in two runs: the filled part in one color, the rest a hairline track.
// Any use shows at least one cell, so 1% never reads as empty.
function bar(pct: number | null): { filled: string; track: string } {
  const p = Math.min(Math.max(pct ?? 0, 0), 100)
  const n = p > 0 ? Math.max(1, Math.round((p / 100) * CELLS)) : 0
  return { filled: '━'.repeat(n), track: '─'.repeat(CELLS - n) }
}

const CARD_BG = '#151517'
const CARD_BORDER = '#2a2a2d'
const PREVIEW_LINES = 8

// The handoff's first lines, for the card under the HUD; the pane holds the whole.
function preview(text: string): string {
  const lines = text.trim().split('\n')
  return (lines.length > PREVIEW_LINES ? [...lines.slice(0, PREVIEW_LINES), '…'] : lines).join('\n')
}

// The card's two rows, drawn as one SVG on surfaces that take it: hairline bars with
// a walking mini Clawd at the tip, figures, and the detail in two aligned columns.
const CARD = {
  width: 640,
  height: 52,
  row1: 16,
  row2: 40,
  label: 0,
  bar: 88,
  barWidth: 180,
  pct: 288,
  detail: 352,
  tail: 466, // the detail's second column, so both rows' "faltam" line up
} as const

const INK = {
  label: '#7c7c82',
  of100: '#525257',
  detail: '#85858b',
  sep: '#3f3f44',
  faded: '#6e6e73',
  remaining: '#a1a1a6',
  lime: '#a3e635',
} as const

type Run = { text: string; color: string }

type Row = {
  id: string
  label: string
  pct: number | null
  // The figure: its text, color, and whether "/100%" follows it.
  figure: { text: string; color: string; of100: boolean }
  // The detail's first column, and its second after a separator dot.
  lead: Run | null
  tail: readonly Run[]
  // The fill's two ends; the mini Clawd wears the second.
  fill: readonly [string, string]
  isHopping: boolean
}

// The last percent each bar was drawn at, so a new figure grows from the old one.
const drawnAt = new Map<string, number>()

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function hairline(row: Row, cy: number): string {
  const p = Math.min(Math.max(row.pct ?? 0, 0), 100)
  const prev = drawnAt.get(row.id) ?? 0
  drawnAt.set(row.id, p)
  const x = CARD.bar
  const w = (p / 100) * CARD.barWidth
  const w0 = (prev / 100) * CARD.barWidth
  const ease = 'dur=".7s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".16 1 .3 1"'
  const walker =
    row.pct !== null
      ? [
          `<g transform="translate(${x + w} ${cy - 1})">`,
          `<animateTransform attributeName="transform" type="translate" from="${x + w0} ${cy - 1}" to="${x + w} ${cy - 1}" ${ease}/>`,
          miniClawd(row.fill[1], row.isHopping),
          '</g>',
        ].join('')
      : ''
  return [
    `<linearGradient id="${row.id}-fill" x1="0" x2="1"><stop offset="0" stop-color="${row.fill[0]}"/><stop offset="1" stop-color="${row.fill[1]}"/></linearGradient>`,
    `<rect x="${x}" y="${cy - 1}" width="${CARD.barWidth}" height="2" rx="1" fill="#ffffff" fill-opacity=".07"/>`,
    `<rect x="${x}" y="${cy - 1}" width="${w}" height="2" rx="1" fill="url(#${row.id}-fill)">`,
    `<animate attributeName="width" from="${w0}" to="${w}" ${ease}/></rect>`,
    walker,
  ].join('')
}

function texts(row: Row, cy: number): string {
  const at = `y="${cy}" dominant-baseline="central"`
  const figure = row.figure.of100
    ? `<tspan fill="${row.figure.color}" font-weight="500">${esc(row.figure.text)}</tspan><tspan fill="${INK.of100}" font-size="11" dx="2">/100%</tspan>`
    : `<tspan fill="${row.figure.color}" font-weight="500">${esc(row.figure.text)}</tspan>`
  const tail = row.tail.map(run => `<tspan fill="${run.color}">${esc(run.text)}</tspan>`).join('')
  return [
    `<text x="${CARD.label}" ${at} fill="${INK.label}">${esc(row.label)}</text>`,
    `<text x="${CARD.pct}" ${at}>${figure}</text>`,
    row.lead ? `<text x="${CARD.detail}" ${at} fill="${row.lead.color}">${esc(row.lead.text)}</text>` : '',
    row.tail.length > 0
      ? `<text x="${CARD.tail - 14}" ${at} fill="${INK.sep}">·</text><text x="${CARD.tail}" ${at}>${tail}</text>`
      : '',
  ].join('')
}

function svgCard(rows: readonly [Row, Row]): string {
  const [one, two] = rows
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}"`,
    ` font-family="Inter, -apple-system, 'Segoe UI', system-ui, sans-serif" font-size="13" style="font-variant-numeric:tabular-nums">`,
    hairline(one, CARD.row1),
    texts(one, CARD.row1),
    hairline(two, CARD.row2),
    texts(two, CARD.row2),
    '</svg>',
  ].join('')
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`
  return `${tokens}`
}

function windowRow(reading: UsageReading, at: number): Row {
  const pct = reading.fiveHourPct
  const color = rampColor(CLAUDE_ORANGE, pct)
  const reset = reading.fiveHourResetsAt === null ? Number.NaN : Date.parse(reading.fiveHourResetsAt)
  const left = reset - at
  const lead: Run | null =
    pct === null
      ? { text: 'aguardando a primeira resposta', color: INK.detail }
      : Number.isNaN(reset) || at === 0
        ? null
        : left <= 0
          ? { text: 'já renovou', color: INK.detail }
          : { text: `renova às ${resetLabel(reset, at)}`, color: INK.detail }
  const tail: Run[] =
    pct !== null && !Number.isNaN(reset) && at !== 0 && left > 0 ? [{ text: `faltam ${timeLeft(left)}`, color: INK.detail }] : []
  return {
    id: 'window',
    label: 'Janela 5h',
    pct,
    figure: { text: pct === null ? '–' : `${pct}%`, color: color, of100: pct !== null },
    lead,
    tail,
    fill: [baseColor(CLAUDE_ORANGE, 0.45), color],
    isHopping: false,
  }
}

function contextRow(reading: UsageReading, isHopping: boolean): Row {
  const pct = reading.contextPct
  const used = reading.contextTokens
  const max = reading.contextWindow
  const color = rampColor(CONTEXT_BLUE, pct)
  const isKnown = used !== null && max !== null
  return {
    id: 'context',
    label: 'Contexto',
    pct,
    figure: { text: pct === null ? '–' : `${pct}%`, color, of100: false },
    lead: isKnown
      ? { text: `${formatTokens(used)} de ${formatTokens(max)}`, color: INK.detail }
      : { text: 'aguardando a primeira resposta', color: INK.detail },
    tail: isKnown
      ? [
          { text: 'faltam ', color: INK.faded },
          { text: formatTokens(Math.max(0, max - used)), color: INK.remaining },
        ]
      : [],
    fill: [baseColor(CONTEXT_BLUE, 0.45), color],
    isHopping,
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function clockLabel(at: number): string {
  const when = new Date(at)
  return `${pad(when.getHours())}:${pad(when.getMinutes())}`
}

function resetLabel(reset: number, at: number): string {
  const when = new Date(reset)
  const isToday = when.toDateString() === new Date(at).toDateString()
  return isToday ? clockLabel(reset) : `${pad(when.getDate())}/${pad(when.getMonth() + 1)} ${clockLabel(reset)}`
}

function timeLeft(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${pad(minutes % 60)}min` : `${minutes}min`
}

function fiveHourLine(reading: UsageReading, at: number): string {
  if (reading.fiveHourPct === null) return 'aguardando a primeira resposta'
  const reset = reading.fiveHourResetsAt === null ? Number.NaN : Date.parse(reading.fiveHourResetsAt)
  if (Number.isNaN(reset) || at === 0) return ''
  const left = reset - at
  if (left <= 0) return 'renovada'
  return `renova às ${resetLabel(reset, at)} · faltam ${timeLeft(left)}`
}

function short(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : `${Math.round(n / 1000)}k`
}

function contextLine(reading: UsageReading): string {
  if (reading.contextTokens === null || reading.contextWindow === null) return 'aguardando a primeira resposta'
  const left = Math.max(0, reading.contextWindow - reading.contextTokens)
  return `${short(reading.contextTokens)} de ${short(reading.contextWindow)} · faltam ${short(left)}`
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${pad(s % 60)}`
}

function jobLine(job: HandoffState, at: number): string {
  if (job.kind === 'working') return `gerando handoff… ${elapsed(at - job.startedAt)}`
  if (job.kind === 'failed') return `handoff falhou: ${job.reason}`
  if (job.kind === 'ready') return 'handoff pronto'
  return ''
}

// What the fork spent, and whether the cache carried the conversation.
function costLine(u: ModelUsage): string {
  const fresh = u.input_tokens + u.cache_creation_input_tokens
  const cached = u.cache_read_input_tokens
  const isCold = cached < fresh
  return `custou ${formatTokens(fresh)} novos + ${formatTokens(cached)} do cache · ${formatTokens(u.output_tokens)} de saída${isCold ? ' · cache frio' : ''}`
}

// The figures a usage reading carries, from the live window and the rate-limit windows.
function readingOf(
  context: { tokens?: number; window: number; percent?: number },
  rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[],
): UsageReading {
  const five = rateLimits.find(limit => limit.kind === FIVE_HOUR)
  return {
    fiveHourPct: five ? five.percentUsed : null,
    fiveHourResetsAt: five?.resetsAt ?? null,
    contextPct: context.percent ?? null,
    contextTokens: context.tokens ?? null,
    contextWindow: context.window,
  }
}

async function seed($: EngineInterface) {
  const session = await $.session.usage()
  await update($, usage, () => readingOf(session.context, session.rateLimits))
}

async function stamp($: EngineInterface) {
  const at = await $.clock.now()
  await update($, nowAt, () => at)
}

/* ---------------- the Rei Clawd ---------------- */

let settleTimer: Timer | undefined

// Never throws: the king is decoration, and must not touch the turn or its tools.
async function setClawd($: EngineInterface, kind: ClawdKind) {
  try {
    settleTimer?.cancel()
    settleTimer = undefined
    const was = await read($, clawd)
    if (was.kind !== kind) {
      const at = await $.clock.now()
      await update($, clawd, () => ({ kind, at }))
    }
    if (TRANSIENT.has(kind)) settleTimer = $.clock.after(SETTLE_MS, () => void settle($))
  } catch {
    // nothing to undo
  }
}

// Back to rest: waiting while background work still runs, idle otherwise.
async function settle($: EngineInterface) {
  const agents = await $.agent.list().catch(() => [])
  const isBusy = agents.some(a => a.status === 'running' || a.status === 'pending')
  await setClawd($, isBusy ? 'aguardando' : 'parado')
}

/* ---------------- the handoff ---------------- */

let isHandoffRunning = false
let workingTick: Timer | undefined

function fileStamp(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

async function handoffDir($: EngineInterface): Promise<string> {
  const repo = await $.session.repo().catch(() => null)
  return repo ? `${repo.root.replace(/\\/g, '/')}/${HANDOFF_DIR}` : HANDOFF_DIR
}

// Keeps the handoff on disk, the latest and a dated copy, so a failed copy loses nothing.
async function saveHandoff($: EngineInterface, text: string, at: number): Promise<string | null> {
  try {
    const dir = await handoffDir($)
    const doc = `<!-- usage-hud · handoff de ${new Date(at).toLocaleString('pt-BR')} -->\n\n${text}\n`
    await $.fs.write(`${dir}/${fileStamp(at)}.md`, doc)
    await $.fs.write(`${dir}/latest.md`, doc)
    return `${dir}/latest.md`
  } catch {
    return null
  }
}

async function makeHandoff($: EngineInterface, surface: RenderSurface) {
  if (isHandoffRunning) return
  isHandoffRunning = true
  const set = (value: HandoffState) => update($, handoff, () => value)
  let timeout: Timer | undefined
  try {
    const reading = await read($, usage)
    if (reading.contextPct !== null && reading.contextPct >= FULL_AT) {
      await set({ kind: 'failed', reason: `o contexto está em ${reading.contextPct}%, cheio demais para o handoff caber. Use Compactar.` })
      return
    }
    const startedAt = await $.clock.now()
    await set({ kind: 'working', startedAt })
    workingTick = $.clock.every(1000, () => void stamp($))
    const timedOut = new Promise<'timeout'>(resolve => {
      timeout = $.clock.after(HANDOFF_TIMEOUT_MS, () => resolve('timeout'))
    })
    const reply = await Promise.race([$.model.fork({ prompt: HANDOFF_PROMPT }), timedOut])
    if (reply === 'timeout') {
      await set({ kind: 'failed', reason: REASON_TEXT.timeout! })
      return
    }
    if (!reply.isAnswered) {
      await set({ kind: 'failed', reason: REASON_TEXT[reply.reason] ?? reply.reason })
      return
    }
    const text = reply.text.trim()
    const at = await $.clock.now()
    const path = await saveHandoff($, text, at)
    await set({ kind: 'ready', text, path, cost: costLine(reply.usage) })
    await $.ui.open({ id: PANE, title: 'Handoff' }).catch(() => undefined)
    const { isCopied } = await $.ui.copy({ text: copyText(text), surface }).catch(() => ({ isCopied: false }))
    $.ui.toast(
      isCopied
        ? 'Handoff salvo e copiado. Use "Continuar em sessão nova" ou cole numa sessão nova.'
        : 'Handoff salvo no painel e em arquivo.',
    )
  } catch (err) {
    await set({ kind: 'failed', reason: err instanceof Error ? err.message : String(err) }).catch(() => undefined)
  } finally {
    timeout?.cancel()
    workingTick?.cancel()
    workingTick = undefined
    isHandoffRunning = false
    void stamp($)
  }
}

// Leaves this conversation for a fresh one that starts by reading the saved handoff.
async function continueFresh($: EngineInterface, path: string) {
  try {
    await $.command.run({ command: 'clear' })
  } catch {
    $.ui.toast('Não consegui rodar o /clear sozinho: rode /clear e envie o texto que deixei no campo.')
  }
  await update($, handoff, () => ({ kind: 'idle' })).catch(() => undefined)
  await $.prompt.fill({ text: resumePrompt(path) }).catch(() => undefined)
}

async function compactWithHandoff($: EngineInterface) {
  try {
    await $.session.compact({ instructions: COMPACT_INSTRUCTIONS })
  } catch (err) {
    $.ui.toast(`Não deu para compactar: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// A new session: offer the handoff a previous one left, if it is recent.
async function findResume($: EngineInterface) {
  try {
    const path = `${await handoffDir($)}/latest.md`
    if (!(await $.fs.exists(path))) return
    const { mtimeMs } = await $.fs.stat(path)
    const at = await $.clock.now()
    if (at - mtimeMs < RESUME_WITHIN_MS) await update($, resume, () => ({ path, savedAt: mtimeMs }))
  } catch {
    // no offer
  }
}

/* ---------------- the hooks ---------------- */

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // A reload keeps $.state: a handoff left "working" by the old module would never finish.
    const job = await read($, handoff)
    if (job.kind === 'working') await update($, handoff, () => ({ kind: 'idle' }))
    await Promise.all([seed($), stamp($), setClawd($, 'parado')])
    if (job.kind === 'idle') void findResume($)
    $.clock.every(TICK_MS, () => {
      void stamp($)
      void seed($)
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => readingOf(e.context, e.rateLimits))

    return next(e)
  })

  // The first prompt of a session answers the resume offer either way.
  on('prompt.submit', async ($, e, next) => {
    await update($, resume, () => null).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  // The main loop's turn: thinking while each request runs, unless a question holds it.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await setClawd($, 'pensando')
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const was = await read($, clawd).catch(() => null)
      if (was?.kind !== 'esperando') await setClawd($, 'pensando')
    }
    return yield* next(e)
  })

  // Each main-loop tool: the pose of its kind; a question holds him until it is answered.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const tool = String(e.tool)
    await setClawd($, toolKind(tool))
    if (!ASKS.has(tool)) return next(e)
    const answered = await next(e)
    await setClawd($, 'pensando')
    return answered
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await setClawd($, 'compactando')
    try {
      return await next(e)
    } finally {
      void settle($)
    }
  }).catch(($, e, next) => next(e))

  // The main turn ends: done, interrupted or failed for a moment, then rest. A background
  // agent's end may be the last one he was waiting on.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await setClawd($, e.reason === 'answer' ? 'concluido' : e.reason === 'aborted' ? 'interrompido' : 'erro')
    } else {
      const was = await read($, clawd).catch(() => null)
      if (was?.kind === 'aguardando') void settle($)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const elements = $.ui.resolve(e)
    const { Box, Button, Code, Text } = elements
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
    const at = await read($, nowAt)
    const reading = await read($, usage)
    const job = await read($, handoff)
    const offer = await read($, resume)
    const king = await read($, clawd)

    const five = reading.fiveHourPct
    const context = reading.contextPct
    const isWarning = context !== null && context >= WARN_AT
    const isWorking = job.kind === 'working'
    const status = jobLine(job, at)

    const handoffButton = (
      <Button
        key="Gerar handoff"
        label={job.kind === 'working' ? `Gerando... ${elapsed(at - job.startedAt)}` : 'Gerar handoff'}
        variant="secondary"
        dimColor={Svg ? undefined : isWarning ? undefined : true}
        plain={Svg ? undefined : true}
        onPress={press => {
          if (!isWorking) void makeHandoff($, press.surface)
        }}
      />
    )
    const compactButton = isWarning ? (
      <Button
        key="Compactar"
        label="Compactar"
        variant="secondary"
        dimColor={Svg ? undefined : true}
        plain={Svg ? undefined : true}
        onPress={() => void compactWithHandoff($)}
      />
    ) : null

    const readyActions =
      job.kind === 'ready' ? (
        <Box flexDirection="row" gap={1}>
          <Button
            label="Copiar"
            variant="secondary"
            onPress={press => {
              void $.ui.copy({ text: copyText(job.text), surface: press.surface }).then(({ isCopied }) => {
                $.ui.toast(isCopied ? 'Handoff copiado.' : 'Não deu pra copiar: copie do painel.')
              })
            }}
          />
          <Button label="Abrir" variant="secondary" onPress={() => void $.ui.open({ id: PANE, title: 'Handoff' })} />
          {job.path !== null && (
            <Button label="Continuar em sessão nova" variant="primary" onPress={() => void continueFresh($, job.path!)} />
          )}
          <Button label="Fechar" role="dismiss" onPress={() => void update($, handoff, () => ({ kind: 'idle' }))} />
        </Box>
      ) : null

    const resumeCard =
      offer !== null && job.kind === 'idle' ? (
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Text color={INK.lime}>Handoff de {clockLabel(offer.savedAt)} disponível</Text>
          <Box flexDirection="row" gap={1}>
            <Button
              label="Retomar"
              variant="primary"
              onPress={() => {
                void $.prompt.fill({ text: resumePrompt(offer.path) })
                void update($, resume, () => null)
              }}
            />
            <Button label="Dispensar" role="dismiss" onPress={() => void update($, resume, () => null)} />
          </Box>
        </Box>
      ) : null

    // Surfaces that draw SVG get the king beside the card, its two rows in one SVG and the buttons.
    if (Svg) {
      const rows = [windowRow(reading, at), contextRow(reading, isWarning || isWorking)] as const
      const alt = `Janela 5h ${five ?? '–'}%, contexto ${context ?? '–'}%`
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Svg
              key={`clawd:${king.kind}`}
              source={clawdSvg(king.kind)}
              alt={`Rei Clawd: ${CLAWD_LABEL[king.kind]}`}
              width={CLAWD_SIZE.width}
              height={CLAWD_SIZE.height}
              isInteractive
            />
            <Box
              flexGrow={1}
              flexDirection="row"
              alignItems="flex-end"
              justifyContent="space-between"
              backgroundColor={CARD_BG}
              borderStyle="round"
              borderColor={CARD_BORDER}
              paddingX={1}
            >
              <Svg source={svgCard(rows)} alt={alt} width={CARD.width} height={CARD.height} isInteractive />
              <Box flexGrow={1} flexShrink={0} marginLeft={1} flexDirection="row" justifyContent="flex-end" gap={1}>
                {compactButton}
                {handoffButton}
              </Box>
            </Box>
          </Box>
          {resumeCard && (
            <Box backgroundColor={CARD_BG} borderStyle="round" borderColor={CARD_BORDER} paddingX={2}>
              {resumeCard}
            </Box>
          )}
          {job.kind === 'ready' && (
            <Box
              flexDirection="column"
              gap={1}
              backgroundColor={CARD_BG}
              borderStyle="round"
              borderColor={CARD_BORDER}
              paddingX={2}
              paddingY={1}
            >
              <Box flexDirection="row" alignItems="center" justifyContent="space-between">
                <Box flexDirection="column">
                  <Text color={INK.lime}>
                    Handoff pronto{job.path !== null ? ` · salvo em ${job.path}` : ''} · copiado
                  </Text>
                  <Text color="subtle">{job.cost}</Text>
                </Box>
                {readyActions}
              </Box>
              <Code source={preview(job.text)} language="markdown" wrap="truncate-end" />
            </Box>
          )}
          {job.kind === 'failed' && (
            <Box backgroundColor={CARD_BG} borderStyle="round" borderColor={CARD_BORDER} paddingX={2}>
              <Text color="#ef4444">{status}</Text>
            </Box>
          )}
        </Box>
      )
    }

    // The terminal: the king's status, then one metric per row in fixed columns.
    const row = (label: string, pct: number | null, color: string, detail: string, trailing?: RenderChildren) => {
      const { filled, track } = bar(pct)
      return (
        <Box flexDirection="row" alignItems="center">
          <Box width={LABEL_W} flexShrink={0}>
            <Text color="subtle">{label}</Text>
          </Box>
          <Box flexShrink={0}>
            <Text color={color}>{filled}</Text>
            <Text color="inactive">{track}</Text>
          </Box>
          <Box width={PCT_W} flexShrink={0} justifyContent="flex-end">
            <Text color={pct === null ? 'subtle' : color}>{pct === null ? '–' : `${pct}%`}</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1} marginLeft={2}>
            <Text color="subtle" wrap="truncate-end">{detail}</Text>
          </Box>
          {trailing}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="#d97757">♛ Rei Clawd · {CLAWD_LABEL[king.kind]}</Text>
        {row('Janela 5h', five, rampColor(CLAUDE_ORANGE, five), fiveHourLine(reading, at))}
        {row(
          'Contexto',
          context,
          rampColor(CONTEXT_BLUE, context),
          status !== '' ? status : contextLine(reading),
          <Box flexShrink={0} marginLeft={2} flexDirection="row" gap={1}>
            {compactButton}
            {handoffButton}
          </Box>,
        )}
        {resumeCard}
        {readyActions}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const job = await read($, handoff)

    if (job.kind !== 'ready') return <Text color="subtle">Nenhum handoff gerado ainda.</Text>

    const text = job.text

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Button
            label="Copiar handoff"
            variant="primary"
            onPress={press => $.ui.copy({ text: copyText(text), surface: press.surface })}
          />
          {job.path !== null && (
            <Button label="Continuar em sessão nova" variant="secondary" onPress={() => void continueFresh($, job.path!)} />
          )}
        </Box>
        {job.path !== null && <Text color="subtle">Salvo em {job.path}</Text>}
        <Text color="subtle">{job.cost}</Text>
        <Markdown text={text} />
      </Box>
    )
  })
}
