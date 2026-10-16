import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-hud',
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
}

test('the band draws the 5-hour gauge, the context gauge and the handoff button', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Text', text: /^Janela 5h$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^Contexto$/ })).toBeDefined()
    } else {
      expect(await ui.find({ type: 'Svg' })).toBeDefined()
    }
    expect(await ui.find({ type: 'Button', key: 'Gerar handoff' })).toBeDefined()

    await ui.unmount()
  }
})

test('the band yields to a survey', async ($, on) => {
  // Beneath the plugin stands the engine's own band; this stand-in is what it draws.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'survey band' })
  })

  const ui = await $.ui.mount({
    ...BAND,
    surface: 'terminal',
    props: { ...BAND.props, hasSurvey: true },
  })

  expect(await ui.find({ type: 'Text', text: /^Janela 5h$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /survey band/ })).toBeDefined()

  await ui.unmount()
})

test('the desktop draws the bars as animated SVG and the terminal as text', async $ => {
  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Svg' })).toBeDefined()
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  await terminal.unmount()
})

// The source of the first SVG on the desktop: the Rei Clawd, drawn left of the card.
async function clawdSource($: Engine): Promise<string> {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return String((svg?.props as { source?: string } | undefined)?.source ?? '')
}

test('the Rei Clawd stands beside the card on the desktop and as a status line in the terminal', async $ => {
  expect(await clawdSource($)).toContain('<title>Rei Clawd: parado</title>')

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: /Rei Clawd · parado/ })).toBeDefined()
  await terminal.unmount()
})

test('each main-loop tool puts the Rei Clawd in the pose of its kind', async ($, on) => {
  mock.clock(on)
  // Beneath the plugin, a stand-in answers every tool.
  on('tool.call', () => ({ result: 'ok' }) as never)

  const poses: [string, Record<string, unknown>, string][] = [
    ['Read', { file_path: 'a.txt' }, 'lendo arquivos'],
    ['Edit', { file_path: 'a.txt', old_string: 'a', new_string: 'b' }, 'editando'],
    ['Bash', { command: 'ls' }, 'no terminal'],
    ['WebSearch', { query: 'x' }, 'na web'],
  ]
  for (const [tool, input, label] of poses) {
    await $.tool.call({ tool, ...input } as never)
    expect(await clawdSource($)).toContain(`<title>Rei Clawd: ${label}</title>`)
  }
})

test('the bars keep their own color up to 75% and heat to red at 100%', async ($, on) => {
  on('session.measure', () => ({ changed: [] }) as never)
  const cardAt = async (pct: number) => {
    await $.session.measure({
      context: { tokens: pct * 10_000, window: 1_000_000, percent: pct },
      rateLimits: [{ kind: 'five_hour', percentUsed: pct }],
    } as never)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const svgs = await ui.findAll({ type: 'Svg' })
    await ui.unmount()
    // The second SVG is the card; the first is the Rei Clawd, whose crown gem is red.
    return JSON.stringify(svgs[1] ?? '')
  }
  const cool = await cardAt(50)
  expect(cool).toContain('#d97757')
  expect(cool).toContain('#2a78d6')
  expect(cool).not.toContain('#e5484d')
  const hot = await cardAt(100)
  expect(hot).toContain('#e5484d')
})

test('the handoff hint shows once the context reaches 50%, until it is dismissed', async ($, on) => {
  on('session.measure', () => ({ changed: [] }) as never)
  const HINT = /bom momento para um handoff/
  const mountAt = async (pct: number) => {
    await $.session.measure({
      context: { tokens: pct * 10_000, window: 1_000_000, percent: pct },
      rateLimits: [{ kind: 'five_hour', percentUsed: 10 }],
    } as never)
    return $.ui.mount({ ...BAND, surface: 'desktop' })
  }

  const below = await mountAt(49)
  expect(await below.find({ type: 'Text', text: HINT })).toBeUndefined()
  await below.unmount()

  const half = await mountAt(50)
  expect(await half.find({ type: 'Text', text: HINT })).toBeDefined()
  await half.press({ key: 'Agora não' })
  expect(await half.find({ type: 'Text', text: HINT })).toBeUndefined()
  await half.unmount()

  // Dismissed once, it stays hidden for the rest of the session.
  const later = await mountAt(60)
  expect(await later.find({ type: 'Text', text: HINT })).toBeUndefined()
  await later.unmount()
})
