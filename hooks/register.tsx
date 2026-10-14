import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, RenderSurface } from 'claude-code'

import type { HandoffState, UsageReading } from '../types'

const PANE = 'usage-hud-handoff'
const FIVE_HOUR = 'five_hour'
const TICK_MS = 60_000
const CELLS = 24
const LABEL_W = 11
const PCT_W = 5
const RED_AT = 75 // the context gauge reaches red here and stays red past it
const WARN_AT = 73 // the alert shows a little before red, while there is room to stop

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

const HANDOFF_PROMPT = [
  'Escreva o handoff desta sessão para eu continuar numa sessão nova sem perder nada.',
  'Responda só com o documento, sem preâmbulo, em português do Brasil e em markdown, com estas seções:',
  '',
  '## Objetivo',
  'O que estou tentando alcançar, em 2 a 4 frases.',
  '',
  '## Estado atual',
  'O que já está feito e verificado, e o que está em andamento.',
  '',
  '## Próximos passos',
  'Lista numerada, concreta, na ordem certa.',
  '',
  '## Decisões e motivos',
  'Escolhas já feitas e por quê, incluindo o que foi descartado.',
  '',
  '## Arquivos e comandos',
  'Caminhos dos arquivos alterados ou relevantes, o que mudou em cada um, e os comandos rodados com o resultado.',
  '',
  '## Erros e pendências',
  'Problemas encontrados, causa conhecida e o que ainda não foi resolvido.',
  '',
  '## Preferências e restrições',
  'Pedidos explícitos meus que valem na próxima sessão.',
  '',
  '## Prompt para a próxima sessão',
  'Um bloco de código com o texto exato para eu colar na sessão nova. Ele deve dizer que o handoff acima é a fonte de verdade, resumir o objetivo e pedir para começar pelo primeiro próximo passo.',
].join('\n')

const REASON_TEXT: Record<string, string> = {
  'nothing-to-fork': 'a sessão ainda não tem resposta para resumir',
  'api-error': 'a API recusou o pedido',
  'empty-reply': 'a resposta veio vazia',
  aborted: 'o pedido foi interrompido',
}

type Rgb = readonly [number, number, number]
const GREEN: Rgb = [61, 190, 106]
const AMBER: Rgb = [224, 169, 59]
const RED: Rgb = [229, 72, 77]

// Green at 0, amber halfway to RED_AT, red at RED_AT and beyond.
function heat(pct: number): string {
  const p = Math.min(Math.max(pct, 0), RED_AT) / RED_AT
  const isFirstHalf = p <= 0.5
  const [fr, fg, fb] = isFirstHalf ? GREEN : AMBER
  const [tr, tg, tb] = isFirstHalf ? AMBER : RED
  const t = isFirstHalf ? p / 0.5 : (p - 0.5) / 0.5
  const hex = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0')
  return `#${hex(fr, tr)}${hex(fg, tg)}${hex(fb, tb)}`
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

// The card's two rows, drawn as one SVG on surfaces that take it: hairline bars
// with a glowing dot at the tip, figures and details in the card's palette.
const CARD = {
  width: 640,
  height: 44,
  row1: 11,
  row2: 33,
  label: 0,
  bar: 88,
  barWidth: 180,
  pct: 282,
  detail: 352,
} as const

const INK = {
  label: '#7c7c82',
  figure: '#f2f2f5',
  of100: '#525257',
  detail: '#85858b',
  sep: '#3f3f44',
  faded: '#6e6e73',
  remaining: '#a1a1a6',
  lime: '#a3e635',
} as const

type Row = {
  id: string
  label: string
  pct: number | null
  // The figure: its text, color, and whether "/100%" follows it.
  figure: { text: string; color: string; of100: boolean }
  // Runs of the detail line, each in its own color; `null` color is a separator dot.
  detail: readonly { text: string; color: string | null }[]
  // The fill's two ends and the dot's color.
  fill: readonly [string, string]
  dot: string
  isPulsing: boolean
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
  const r = row.isPulsing ? 3 : 2
  const breathe = row.isPulsing
    ? `<animate attributeName="r" values="3;4;3" dur="1.4s" repeatCount="indefinite"/>`
    : ''
  const dot =
    p > 0
      ? [
          `<circle cx="${x + w}" cy="${cy}" r="${r + 3}" fill="${row.dot}" opacity=".55" filter="url(#${row.id}-glow)">`,
          `<animate attributeName="cx" from="${x + w0}" to="${x + w}" ${ease}/></circle>`,
          `<circle cx="${x + w}" cy="${cy}" r="${r}" fill="${row.dot}">`,
          `<animate attributeName="cx" from="${x + w0}" to="${x + w}" ${ease}/>${breathe}</circle>`,
        ].join('')
      : ''
  return [
    `<linearGradient id="${row.id}-fill" x1="0" x2="1"><stop offset="0" stop-color="${row.fill[0]}"/><stop offset="1" stop-color="${row.fill[1]}"/></linearGradient>`,
    `<filter id="${row.id}-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3"/></filter>`,
    `<rect x="${x}" y="${cy - 1}" width="${CARD.barWidth}" height="2" rx="1" fill="#ffffff" fill-opacity=".07"/>`,
    `<rect x="${x}" y="${cy - 1}" width="${w}" height="2" rx="1" fill="url(#${row.id}-fill)">`,
    `<animate attributeName="width" from="${w0}" to="${w}" ${ease}/></rect>`,
    dot,
  ].join('')
}

function texts(row: Row, cy: number): string {
  const at = `y="${cy}" dominant-baseline="central"`
  const figure = row.figure.of100
    ? `<tspan fill="${row.figure.color}" font-weight="500">${esc(row.figure.text)}</tspan><tspan fill="${INK.of100}" font-size="11" dx="2">/100%</tspan>`
    : `<tspan fill="${row.figure.color}" font-weight="500">${esc(row.figure.text)}</tspan>`
  // The separator dot stands 8px off each neighbour, as the design's mx-2.
  const detail = row.detail
    .map((run, i) => {
      const dx = i > 0 && row.detail[i - 1]?.color === null ? ' dx="8"' : ''
      return run.color === null
        ? `<tspan fill="${INK.sep}" dx="8">·</tspan>`
        : `<tspan fill="${run.color}"${dx}>${esc(run.text)}</tspan>`
    })
    .join('')
  return [
    `<text x="${CARD.label}" ${at} fill="${INK.label}">${esc(row.label)}</text>`,
    `<text x="${CARD.pct}" ${at}>${figure}</text>`,
    `<text x="${CARD.detail}" ${at}>${detail}</text>`,
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
  const isHot = (pct ?? 0) >= 85
  const reset = reading.fiveHourResetsAt === null ? Number.NaN : Date.parse(reading.fiveHourResetsAt)
  const left = reset - at
  const detail: Row['detail'] =
    pct === null
      ? [{ text: 'aguardando a primeira resposta', color: INK.detail }]
      : Number.isNaN(reset) || at === 0
        ? []
        : left <= 0
          ? [{ text: 'já renovou', color: INK.detail }]
          : [
              { text: `renova às ${resetLabel(reset, at)}`, color: INK.detail },
              { text: '·', color: null },
              { text: `faltam ${timeLeft(left)}`, color: INK.detail },
            ]
  return {
    id: 'window',
    label: 'Janela 5h',
    pct,
    figure: { text: pct === null ? '–' : `${pct}%`, color: INK.figure, of100: pct !== null },
    detail,
    fill: isHot ? ['rgba(211,98,65,0.65)', '#ef4444'] : ['rgba(211,98,65,0.45)', '#e07a5f'],
    dot: isHot ? '#ef4444' : '#e07a5f',
    isPulsing: false,
  }
}

function contextRow(reading: UsageReading, isPulsing: boolean): Row {
  const pct = reading.contextPct
  const used = reading.contextTokens
  const max = reading.contextWindow
  const detail: Row['detail'] =
    used === null || max === null
      ? [{ text: 'aguardando a primeira resposta', color: INK.detail }]
      : [
          { text: `${formatTokens(used)} de ${formatTokens(max)}`, color: INK.detail },
          { text: '·', color: null },
          { text: 'faltam ', color: INK.faded },
          { text: formatTokens(Math.max(0, max - used)), color: INK.remaining },
        ]
  return {
    id: 'context',
    label: 'Contexto',
    pct,
    figure: { text: pct === null ? '–' : `${pct}%`, color: INK.lime, of100: false },
    detail,
    fill: ['rgba(83,184,106,0.45)', INK.lime],
    dot: INK.lime,
    isPulsing,
  }
}

// The 5-hour window stays neutral until it gets tight.
function windowColor(pct: number | null): string {
  if (pct === null || pct < 80) return 'text'
  return pct < 95 ? 'warning' : 'error'
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function resetLabel(reset: number, at: number): string {
  const when = new Date(reset)
  const hour = `${pad(when.getHours())}:${pad(when.getMinutes())}`
  const isToday = when.toDateString() === new Date(at).toDateString()
  return isToday ? hour : `${pad(when.getDate())}/${pad(when.getMonth() + 1)} ${hour}`
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
  return `${timeLeft(left)} · ${resetLabel(reset, at)}`
}

function short(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : `${Math.round(n / 1000)}k`
}

function contextLine(reading: UsageReading): string {
  if (reading.contextTokens === null || reading.contextWindow === null) return 'aguardando a primeira resposta'
  return `${short(reading.contextTokens)} / ${short(reading.contextWindow)}`
}

function jobLine(job: HandoffState): string {
  if (job.kind === 'working') return 'gerando handoff…'
  if (job.kind === 'failed') return `handoff falhou: ${job.reason}`
  if (job.kind === 'ready') return 'handoff pronto no painel'
  return ''
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

async function makeHandoff($: EngineInterface, surface: RenderSurface) {
  const set = (value: HandoffState) => update($, handoff, () => value)
  await set({ kind: 'working' })
  const reply = await $.model.fork({ prompt: HANDOFF_PROMPT })
  if (!reply.isAnswered) {
    const reason = REASON_TEXT[reply.reason] ?? reply.reason
    await set({ kind: 'failed', reason })
    return
  }
  const text = reply.text
  await set({ kind: 'ready', text })
  await $.ui.open({ id: PANE, title: 'Handoff' })
  const { isCopied } = await $.ui.copy({ text, surface })
  $.ui.toast(isCopied ? 'Handoff copiado. Cole na próxima sessão.' : 'Handoff pronto no painel: copie de lá.')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await Promise.all([seed($), stamp($)])
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const elements = $.ui.resolve(e)
    const { Box, Button, Code, Text } = elements
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
    const at = await read($, nowAt)
    const reading = await read($, usage)
    const job = await read($, handoff)

    const five = reading.fiveHourPct
    const context = reading.contextPct
    const isWarning = context !== null && context >= WARN_AT
    const isWorking = job.kind === 'working'
    const status = jobLine(job)

    const handoffButton = (
      <Button
        key="Gerar handoff"
        label={isWorking ? 'Gerando...' : 'Gerar handoff'}
        variant="secondary"
        dimColor={Svg ? undefined : isWarning ? undefined : true}
        plain={Svg ? undefined : true}
        onPress={press => {
          if (!isWorking) void makeHandoff($, press.surface)
        }}
      />
    )

    // Surfaces that draw SVG get the card: its two rows in one SVG, the button beside them.
    if (Svg) {
      const rows = [windowRow(reading, at), contextRow(reading, isWarning || isWorking)] as const
      const alt = `Janela 5h ${five ?? '–'}%, contexto ${context ?? '–'}%`
      return (
        <Box flexDirection="column" gap={1}>
          <Box
            flexDirection="row"
            alignItems="flex-end"
            justifyContent="space-between"
            backgroundColor={CARD_BG}
            borderStyle="round"
            borderColor={CARD_BORDER}
            paddingX={1}
          >
            <Svg source={svgCard(rows)} alt={alt} width={CARD.width} height={CARD.height} isInteractive />
            <Box flexGrow={1} flexShrink={0} marginLeft={1} flexDirection="row" justifyContent="flex-end">
              {handoffButton}
            </Box>
          </Box>
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
                <Text color={INK.lime}>Handoff pronto · copiado para a área de transferência</Text>
                <Box flexDirection="row" gap={1}>
                  <Button
                    label="Copiar"
                    variant="secondary"
                    onPress={press => {
                      void $.ui.copy({ text: job.text, surface: press.surface }).then(({ isCopied }) => {
                        $.ui.toast(isCopied ? 'Handoff copiado.' : 'Não deu pra copiar: copie do painel.')
                      })
                    }}
                  />
                  <Button label="Abrir" variant="primary" onPress={() => void $.ui.open({ id: PANE, title: 'Handoff' })} />
                  <Button label="Fechar" role="dismiss" onPress={() => void update($, handoff, () => ({ kind: 'idle' }))} />
                </Box>
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

    // The terminal: one metric per row, in fixed columns: label · line · percent · detail.
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
        {row('Janela 5h', five, windowColor(five), fiveHourLine(reading, at))}
        {row(
          'Contexto',
          context,
          context === null ? 'subtle' : heat(context),
          status !== '' ? status : contextLine(reading),
          <Box flexShrink={0} marginLeft={2}>
            {handoffButton}
          </Box>,
        )}
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
        <Button
          label="Copiar handoff"
          variant="primary"
          onPress={press => $.ui.copy({ text, surface: press.surface })}
        />
        <Markdown text={text} />
      </Box>
    )
  })
}
