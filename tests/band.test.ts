import { expect, test } from 'claude-code/testing'

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
