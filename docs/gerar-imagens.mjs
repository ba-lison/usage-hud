// Gera as imagens do README a partir do próprio código do mod (hooks/clawd.ts),
// para o README mostrar exatamente o Rei Clawd e as barras que aparecem no app.
// Rodar na raiz do repositório: node docs/gerar-imagens.mjs  (Node 22.18+)
import fs from 'node:fs'

import {
  CLAUDE_ORANGE,
  CLAWD_LABEL,
  CONTEXT_BLUE,
  baseColor,
  clawdSvg,
  miniClawd,
  rampColor,
} from '../hooks/clawd.ts'

const SANS = "Inter, -apple-system, 'Segoe UI', system-ui, sans-serif"
const MONO = "'JetBrains Mono','Cascadia Code',Consolas,Menlo,monospace"
const INK = { label: '#7c7c82', of100: '#525257', detail: '#85858b', sep: '#3f3f44', faded: '#6e6e73', remaining: '#a1a1a6', lime: '#a3e635', text: '#f2f2f5' }

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The Rei Clawd as the mod draws it, placed at (x, y) with width w.
function clawd(kind, x, y, w = 48) {
  const h = (w * 46) / 48
  return clawdSvg(kind).replace(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="48" height="46"/, `<svg x="${x}" y="${y}" width="${w}" height="${h}"`)
}

function frame(width, height, inner, { title = '', defs = '' } = {}) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${SANS}" style="font-variant-numeric:tabular-nums">`,
    title ? `<title>${esc(title)}</title>` : '',
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121214"/><stop offset="1" stop-color="#0a0a0b"/></linearGradient>${defs}</defs>`,
    `<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="16" fill="url(#bg)" stroke="#232326"/>`,
    inner,
    '</svg>',
  ].join('\n')
}

// One gauge row, as hooks/register.tsx draws it: label, bar with the walking mini Clawd, figure, detail.
function gaugeRow(id, x, cy, { label, base, pct, of100, lead, tail }, barWidth = 180) {
  const tip = rampColor(base, pct)
  const w = (pct / 100) * barWidth
  const bx = x + 88
  const at = `y="${cy}" dominant-baseline="central"`
  const tailRuns = (tail ?? []).map(r => `<tspan fill="${r.color}">${esc(r.text)}</tspan>`).join('')
  return [
    `<linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${baseColor(base, 0.45)}"/><stop offset="1" stop-color="${tip}"/></linearGradient>`,
    `<text x="${x}" ${at} font-size="13" fill="${INK.label}">${esc(label)}</text>`,
    `<rect x="${bx}" y="${cy - 1}" width="${barWidth}" height="2" rx="1" fill="#fff" fill-opacity=".07"/>`,
    `<rect x="${bx}" y="${cy - 1}" width="${w}" height="2" rx="1" fill="url(#${id})"/>`,
    `<g transform="translate(${bx + w} ${cy - 1})">${miniClawd(tip, false)}</g>`,
    `<text x="${x + 288}" ${at} font-size="13"><tspan fill="${tip}" font-weight="600">${pct}%</tspan>${of100 ? `<tspan fill="${INK.of100}" font-size="11" dx="2">/100%</tspan>` : ''}</text>`,
    lead ? `<text x="${x + 352}" ${at} font-size="13" fill="${INK.detail}">${esc(lead)}</text>` : '',
    tailRuns ? `<text x="${x + 452}" ${at} font-size="13" fill="${INK.sep}">·</text><text x="${x + 466}" ${at} font-size="13">${tailRuns}</text>` : '',
  ].join('')
}

function button(x, y, label, { primary = false, w } = {}) {
  const width = w ?? 16 + label.length * 7.2
  return [
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${width}" height="26" rx="6" fill="${primary ? '#d97757' : '#2a2a2d'}"/>`,
    `<text x="${x + width / 2}" y="${y + 13.5}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="500" fill="${primary ? '#fff' : INK.text}">${esc(label)}</text>`,
  ].join('')
}

const WINDOW = { label: 'Janela 5h', base: CLAUDE_ORANGE, of100: true, lead: 'renova às 13:10', tail: [{ text: 'faltam 2h 55min', color: INK.detail }] }
const CONTEXT = { label: 'Contexto', base: CONTEXT_BLUE, of100: false, lead: '265k de 1.0M', tail: [{ text: 'faltam ', color: INK.faded }, { text: '735k', color: INK.remaining }] }

/* ---------------- preview: the HUD, with the king cycling through real poses ---------------- */

function preview() {
  const cycle = ['lendo', 'editando', 'terminal', 'pensando', 'orquestrando', 'concluido']
  const step = 2.4
  const total = cycle.length * step
  const share = 100 / cycle.length
  const css = `<style>.cyc{opacity:0;animation:cyc ${total}s infinite}@keyframes cyc{0%,${(share - 0.01).toFixed(2)}%{opacity:1}${share.toFixed(2)}%,100%{opacity:0}}</style>`
  const poses = cycle
    .map((kind, i) => `<g class="cyc" style="animation-delay:${i * step}s">${clawd(kind, 44, 92, 64)}<text x="76" y="176" text-anchor="middle" font-size="11" fill="${INK.detail}">${esc(CLAWD_LABEL[kind])}</text></g>`)
    .join('')
  const card = [
    `<rect x="130.5" y="88.5" width="719" height="76" rx="10" fill="#151517" stroke="#2a2a2d"/>`,
    gaugeRow('pw', 150, 114, { ...WINDOW, pct: 42 }),
    gaugeRow('pc', 150, 140, { ...CONTEXT, pct: 61, lead: '610k de 1.0M', tail: [{ text: 'faltam ', color: INK.faded }, { text: '390k', color: INK.remaining }] }),
    button(732, 125, 'Gerar handoff', { w: 104 }),
  ].join('')
  const chrome = [
    `<circle cx="26" cy="24" r="5.5" fill="#ff5f57"/><circle cx="44" cy="24" r="5.5" fill="#febc2e"/><circle cx="62" cy="24" r="5.5" fill="#28c840"/>`,
    `<text x="440" y="28" text-anchor="middle" font-size="12" fill="#4d4d52">Claude Code</text>`,
    `<rect x="30.5" y="190.5" width="819" height="44" rx="12" fill="#151517" stroke="#2a2a2d"/>`,
    `<text x="52" y="213" dominant-baseline="central" font-size="13" fill="#4d4d52">Responda ao Claude…</text>`,
  ].join('')
  return frame(880, 260, css + chrome + poses + card, { title: 'usage-hud: o Rei Clawd ao lado das barras da Janela 5h e do Contexto' })
}

/* ---------------- poses: the 14 poses and the event behind each ---------------- */

// Short names for the grid cells; the full ones are in CLAWD_LABEL.
const SHORT = { lendo: 'lendo', orquestrando: 'orquestrando', esperando: 'esperando você', aguardando: 'aguardando', terminal: 'no terminal' }

function poses() {
  const list = [
    ['parado', 'sessão aberta'],
    ['pensando', 'turn.step'],
    ['lendo', 'Read · Grep · Glob'],
    ['editando', 'Edit · Write'],
    ['terminal', 'Bash · PowerShell'],
    ['web', 'WebSearch · WebFetch'],
    ['orquestrando', 'Agent (subagents)'],
    ['trabalhando', 'outra ferramenta'],
    ['esperando', 'AskUserQuestion'],
    ['aguardando', 'segundo plano'],
    ['compactando', 'session.compact'],
    ['concluido', "reason 'answer'"],
    ['interrompido', "reason 'aborted'"],
    ['erro', "'error' · 'refusal'"],
  ]
  const cols = 7
  const cw = 120
  const ch = 150
  const cells = list
    .map(([kind, ev], i) => {
      const cx = 20 + (i % cols) * cw
      const cy = 20 + Math.floor(i / cols) * ch
      return [
        `<rect x="${cx + 4.5}" y="${cy + 4.5}" width="${cw - 9}" height="${ch - 9}" rx="10" fill="#1a1a1d" stroke="#2a2a2d"/>`,
        clawd(kind, cx + 26, cy + 22, 68),
        `<text x="${cx + cw / 2}" y="${cy + 108}" text-anchor="middle" font-size="12" font-weight="600" fill="${INK.text}">${esc(SHORT[kind] ?? CLAWD_LABEL[kind])}</text>`,
        `<text x="${cx + cw / 2}" y="${cy + 126}" text-anchor="middle" font-size="9.5" font-family="${MONO}" fill="${INK.lime}">${esc(ev)}</text>`,
      ].join('')
    })
    .join('')
  return frame(880, 340, cells, { title: 'As 14 poses do Rei Clawd e o evento do Claude Code que liga cada uma' })
}

/* ---------------- bars: each keeps its color up to 75%, then heats to red ---------------- */

function bars() {
  const levels = [30, 75, 90, 100]
  const rows = [
    ['Janela 5h', CLAUDE_ORANGE, 'janela'],
    ['Contexto', CONTEXT_BLUE, 'contexto'],
  ]
  const inner = rows
    .map(([label, base, id], r) => {
      const cy = 62 + r * 58
      const cells = levels
        .map((pct, i) => {
          const x = 140 + i * 180
          const tip = rampColor(base, pct)
          const w = (pct / 100) * 120
          return [
            `<linearGradient id="${id}${i}" x1="0" x2="1"><stop offset="0" stop-color="${baseColor(base, 0.45)}"/><stop offset="1" stop-color="${tip}"/></linearGradient>`,
            `<rect x="${x}" y="${cy - 1}" width="120" height="2" rx="1" fill="#fff" fill-opacity=".07"/>`,
            `<rect x="${x}" y="${cy - 1}" width="${w}" height="2" rx="1" fill="url(#${id}${i})"/>`,
            `<g transform="translate(${x + w} ${cy - 1})">${miniClawd(tip, pct >= 90)}</g>`,
            `<text x="${x + 128}" y="${cy}" dominant-baseline="central" font-size="12.5" font-weight="600" fill="${tip}">${pct}%</text>`,
          ].join('')
        })
        .join('')
      return `<text x="32" y="${cy}" dominant-baseline="central" font-size="13" fill="${INK.label}">${label}</text>${cells}`
    })
    .join('')
  const note = `<text x="440" y="160" text-anchor="middle" font-size="12" fill="${INK.detail}">cada barra mantém a sua cor até 75% e esquenta até o vermelho em 100%</text>`
  return frame(880, 184, inner + note, { title: 'Barras da Janela 5h (laranja do Claude) e do Contexto (azul) em 30, 75, 90 e 100%' })
}

/* ---------------- handoff: the ready card and the resume offer ---------------- */

function handoff() {
  const lines = [
    ['## Objetivo', '#f2f2f5'],
    ['Colocar o Rei Clawd no usage-hud, sem depender do mod tripulação.', INK.detail],
    ['## Estado', '#f2f2f5'],
    ['status: em andamento · branch rei-clawd · último commit 631d249', INK.detail],
    ['## Próximo passo', '#f2f2f5'],
    ['Testar numa sessão nova e publicar no GitHub.', INK.detail],
  ]
  const code = lines
    .map(([t, c], i) => `<text x="62" y="${148 + i * 19}" font-family="${MONO}" font-size="12" fill="${c}">${esc(t)}</text>`)
    .join('')
  const ready = [
    `<rect x="30.5" y="30.5" width="819" height="246" rx="12" fill="#151517" stroke="#2a2a2d"/>`,
    `<circle cx="56" cy="58" r="4" fill="${INK.lime}"><animate attributeName="opacity" values="1;.35;1" dur="2s" repeatCount="indefinite"/></circle>`,
    `<text x="70" y="58" dominant-baseline="central" font-size="13" fill="${INK.lime}">Handoff pronto · salvo em .claude/handoff/latest.md · copiado</text>`,
    `<text x="70" y="80" dominant-baseline="central" font-size="11.5" fill="${INK.detail}">custou 4k novos + 612k do cache · 540 de saída</text>`,
    button(452, 100, 'Copiar', { w: 64 }),
    button(522, 100, 'Abrir', { w: 56 }),
    button(584, 100, 'Continuar em sessão nova', { primary: true, w: 182 }),
    button(772, 100, 'Fechar', { w: 60 }),
    `<rect x="48.5" y="132.5" width="783" height="128" rx="8" fill="#0f0f11" stroke="#232326"/>`,
    code,
  ].join('')
  const resume = [
    `<rect x="30.5" y="294.5" width="819" height="46" rx="12" fill="#151517" stroke="#2a2a2d"/>`,
    `<text x="52" y="318" dominant-baseline="central" font-size="13" fill="${INK.lime}">Handoff de 14:32 disponível</text>`,
    `<text x="248" y="318" dominant-baseline="central" font-size="11.5" fill="${INK.faded}">numa sessão nova</text>`,
    button(670, 305, 'Retomar', { primary: true, w: 74 }),
    button(752, 305, 'Dispensar', { w: 80 }),
  ].join('')
  return frame(880, 362, ready + resume, { title: 'O handoff pronto, salvo em arquivo, e a oferta de Retomar numa sessão nova' })
}

/* ---------------- terminal: the same HUD in text ---------------- */

function terminal() {
  const row = (y, label, pct, base, detail) => {
    const color = rampColor(base, pct)
    const n = Math.max(1, Math.round((pct / 100) * 24))
    return [
      `<text x="32" y="${y}" fill="#8a8a90">${label}</text>`,
      `<text x="130" y="${y}"><tspan fill="${color}">${'━'.repeat(n)}</tspan><tspan fill="#3a3a3f">${'─'.repeat(24 - n)}</tspan></text>`,
      `<text x="392" y="${y}" text-anchor="end" fill="${color}">${pct}%</text>`,
      `<text x="410" y="${y}" fill="#8a8a90">${esc(detail)}</text>`,
    ].join('')
  }
  const inner = [
    `<circle cx="24" cy="22" r="5" fill="#3a3a3f"/><circle cx="40" cy="22" r="5" fill="#3a3a3f"/><circle cx="56" cy="22" r="5" fill="#3a3a3f"/>`,
    `<text x="440" y="26" text-anchor="middle" font-size="11.5" fill="#4d4d52">terminal</text>`,
    `<text x="32" y="64" fill="#d97757">♛ Rei Clawd · editando</text>`,
    row(92, 'Janela 5h', 42, CLAUDE_ORANGE, 'renova às 19:40 · faltam 2h 15min'),
    row(118, 'Contexto', 61, CONTEXT_BLUE, '610k de 1.0M · faltam 390k'),
    `<text x="740" y="118" fill="#e6e6ea">Gerar handoff</text>`,
    `<text x="32" y="148" fill="#4d4d52">&gt;</text>`,
    `<rect x="48" y="136" width="8" height="15" fill="${INK.lime}"><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.5;.5;1" dur="1.1s" repeatCount="indefinite"/></rect>`,
  ].join('')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="170" viewBox="0 0 880 170" font-family="${MONO}" font-size="14">`,
    '<title>O usage-hud no terminal: o status do Rei Clawd e as duas barras em texto</title>',
    `<rect x=".5" y=".5" width="879" height="169" rx="14" fill="#0c0c0d" stroke="#232326"/>`,
    inner,
    '</svg>',
  ].join('\n')
}

const out = { 'assets/preview.svg': preview(), 'assets/poses.svg': poses(), 'assets/barras.svg': bars(), 'assets/handoff.svg': handoff(), 'assets/terminal.svg': terminal() }
for (const [path, svg] of Object.entries(out)) {
  fs.writeFileSync(path, svg + '\n')
  console.log(`${path}  ${(svg.length / 1024).toFixed(1)} KB`)
}
