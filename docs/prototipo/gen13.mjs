// Gera clawd-prototype.html estático (sem JS) com os 13 estados reais do Claude.
import fs from 'node:fs'

const C = {
  y: '#ffd34d', Y: '#d9a521', r: '#e5484d', d: '#d97757', s: '#98533d', e: '#e49d86', k: '#141416',
  w: '#f2f2f5', g: '#a1a1a6', c: '#c9c9cf', l: '#a3e635', p: '#e49d86', n: '#2a2a2d',
}
const BODY = [
  '   y yy y   ', '   yyrryy   ', '   YYYYYY   ', '  dddddddd  ', '  dkddddkd  ', '  dkddddkd  ',
  'eddddddddddd', 'sdddddddddds', '  dddddddd  ', '  ssssssss  ', '  s s  s s  ', '  s s  s s  ',
]
const EYES = {
  open: ['  dkddddkd  ', '  dkddddkd  '],
  up: ['  ddkdddkd  ', '  dddddddd  '],
  down: ['  dddddddd  ', '  ddkdddkd  '],
  half: ['  dddddddd  ', '  kkkddkkk  '],
  happy: ['  ddkddkdd  ', '  dkdkkdkd  '],
  angry: ['  kdkddkdk  ', '  dkddddkd  '],
  dizzy: ['  dddddddd  ', '  kdkddkdk  '],
  squint: ['  dkddddkd  ', '  ddkddkdd  '],
}
const px = (rows, dx = 0, dy = 0, sz = 1) =>
  rows.map((l, y) => [...l].map((ch, x) => (ch === ' ' ? '' :
    `<rect x="${+(dx + x * sz).toFixed(2)}" y="${+(dy + y * sz).toFixed(2)}" width="${sz}" height="${sz}" fill="${C[ch]}"/>`)).join('')).join('')
const body = eyes => { const b = [...BODY]; b[4] = EYES[eyes][0]; b[5] = EYES[eyes][1]; return px(b) }
const blink = '<rect class="blink" x="2" y="4" width="8" height="2" fill="#d97757"/>'
const page = `<rect x="13" y="1.5" width="5" height="7" rx=".3" fill="#f2f2f5"/>`
const svg = inner => `<svg viewBox="-1 -6 20 19" class="clawd">${inner}</svg>`

const STATES = [
  { key: 'parado', label: 'Parado', ev: 'session.start · fim do turno sem nada rodando', desc: 'Sessão aberta, esperando você escrever',
    art: svg(`<g class="bob-slow">${body('open')}${blink}</g>`) },
  { key: 'pensando', label: 'Pensando', ev: 'turn.step', desc: 'O modelo está gerando a resposta',
    art: svg(`<g class="tilt">${body('up')}</g>
      <rect x="10.5" y="-5.4" width="7" height="3.6" rx="1.2" fill="#2a2a2d"/><path d="M11.4 -1.9 L10.8 -.5 L12.8 -1.9 Z" fill="#2a2a2d"/>
      <circle class="tdot" cx="12.3" cy="-3.6" r=".55" fill="#c9c9cf"/><circle class="tdot d2" cx="14" cy="-3.6" r=".55" fill="#c9c9cf"/><circle class="tdot d3" cx="15.7" cy="-3.6" r=".55" fill="#c9c9cf"/>`) },
  { key: 'lendo', label: 'Lendo', ev: 'tool.call · Read, Grep, Glob', desc: 'Lendo ou procurando arquivos',
    art: svg(`<g class="bob-slow">${body('down')}${blink}</g>${page}
      <rect x="13.7" y="2.6" width="3.4" height=".45" fill="#a1a1a6"/><rect x="13.7" y="3.9" width="2.6" height=".45" fill="#a1a1a6"/>
      <rect x="13.7" y="5.2" width="3.4" height=".45" fill="#a1a1a6"/><rect x="13.7" y="6.5" width="2" height=".45" fill="#a1a1a6"/>
      <g class="scan"><circle cx="14.4" cy="3.4" r="1.25" fill="rgba(96,165,250,.25)" stroke="#c9c9cf" stroke-width=".45"/>
      <path d="M15.3 4.3 L16.8 5.8" stroke="#98533d" stroke-width=".7" stroke-linecap="round"/></g>`) },
  { key: 'editando', label: 'Editando', ev: 'tool.call · Edit, Write, NotebookEdit', desc: 'Mexendo em código ou arquivos',
    art: svg(`<g class="bob-slow">${body('down')}</g>${page}
      <rect class="write" x="13.7" y="2.8" width="3.4" height=".45" fill="#a3e635"/>
      <rect class="write w2" x="13.7" y="4.3" width="2.8" height=".45" fill="#a3e635"/>
      <rect x="13.7" y="5.8" width="3" height=".45" fill="#a1a1a6"/>
      <g class="pen">${px(['    p', '   y ', '  y  ', ' Y   ', 'k    '], 13.4, -1.3, .8)}</g>`) },
  { key: 'terminal', label: 'No terminal', ev: 'tool.call · Bash, PowerShell', desc: 'Rodando comandos',
    art: svg(`<g class="bob-fast">${body('open')}</g>
      <rect x="12" y="1" width="7" height="6.2" rx=".5" fill="#2a2a2d"/>
      <circle cx="12.6" cy="1.5" r=".2" fill="#e5484d"/><circle cx="13.2" cy="1.5" r=".2" fill="#ffd34d"/><circle cx="13.8" cy="1.5" r=".2" fill="#a3e635"/>
      <rect x="12.4" y="2" width="6.2" height="4.8" fill="#141416"/>
      ${px(['l ', ' l', 'l '], 12.8, 2.5, .4)}
      <rect class="type" x="14" y="2.8" width="3.6" height=".45" fill="#a3e635"/>
      <rect x="12.8" y="4.2" width="4.2" height=".45" fill="#85858b"/>
      <rect class="key-on" x="12.8" y="5.5" width=".6" height=".8" fill="#a3e635"/>`) },
  { key: 'web', label: 'Na web', ev: 'tool.call · WebSearch, WebFetch, navegador', desc: 'Pesquisando ou abrindo páginas',
    art: svg(`<g class="bob-slow">${body('up')}${blink}</g>
      <circle cx="15.5" cy="3.5" r="3" fill="#1d4ed8" stroke="#93c5fd" stroke-width=".35"/>
      <ellipse class="spin" cx="15.5" cy="3.5" rx="1.4" ry="3" fill="none" stroke="#93c5fd" stroke-width=".3"/>
      <path d="M12.5 3.5 H18.5 M13 2 H18 M13 5 H18" stroke="#93c5fd" stroke-width=".25"/>`) },
  { key: 'orquestrando', label: 'Orquestrando', ev: 'tool.call · Agent / agent.spawn', desc: 'Lançou subagents e coordena dentro da resposta',
    art: svg(`<g class="bob-slow">${body('up')}</g>
      <path class="link" d="M15.5 1.6 L12.9 -2.6 M15.5 1.6 L15.5 -2.6 M15.5 1.6 L18.1 -2.6" stroke="#525257" stroke-width=".3" fill="none"/>
      <rect class="agent" x="12.2" y="-4.2" width="1.4" height="1.4" fill="#d97757"/>
      <rect class="agent a2" x="14.8" y="-4.2" width="1.4" height="1.4" fill="#d97757"/>
      <rect class="agent a3" x="17.4" y="-4.2" width="1.4" height="1.4" fill="#d97757"/>
      <rect x="12" y="1.6" width="7" height="5" rx=".4" fill="#2a2a2d"/><rect x="12.6" y="2.2" width="5.8" height="3.6" fill="#141416"/>
      <rect class="screen-line" x="13.1" y="2.7" width="3.4" height=".5" fill="#a3e635"/>
      <rect class="screen-line l2" x="13.1" y="3.8" width="4.4" height=".5" fill="#a3e635"/>
      <rect class="screen-line" x="13.1" y="4.9" width="2.4" height=".5" fill="#a3e635"/>
      <rect x="15" y="6.6" width="1" height=".9" fill="#2a2a2d"/><rect x="13.8" y="7.5" width="3.4" height=".5" rx=".2" fill="#2a2a2d"/>`) },
  { key: 'esperando', label: 'Esperando você', ev: 'tool.call · AskUserQuestion, ExitPlanMode', desc: 'Fez uma pergunta ou mostrou um plano',
    art: svg(`<g class="bob-slow">${body('open')}${blink}</g>
      <g class="pop"><rect x="11" y="-5.6" width="6" height="5" rx="1.2" fill="#2a2a2d"/><path d="M12 -.8 L11.4 .6 L13.6 -.8 Z" fill="#2a2a2d"/>
      ${px(['yyy', '  y', ' yy', '   ', ' y '], 12.75, -5.1, .85)}</g>`) },
  { key: 'aguardando', label: 'Aguardando', ev: 'fim do turno com tarefa em segundo plano', desc: 'Já respondeu, mas algo ainda roda em segundo plano',
    art: svg(`<g class="bob-slow">${body('half')}</g>
      <g class="hourglass">${px(['ggggg', ' yyy ', '  y  ', ' y y ', 'ggggg'], 13, 1.5, .8)}</g>`) },
  { key: 'compactando', label: 'Compactando', ev: 'session.compact', desc: 'Resumindo a conversa porque o contexto encheu',
    art: svg(`<g class="squeeze">${body('squint')}</g>
      <path class="arrow" d="M14.2 -3.4 L15.5 -2 L16.8 -3.4 Z" fill="#a3e635"/>
      <rect x="12.6" y="-1.4" width="5.8" height=".8" rx=".2" fill="#a1a1a6"/>
      <g class="squish"><rect x="13" y="0" width="5" height="1.6" fill="#f2f2f5"/><rect x="13" y="2" width="5" height="1.6" fill="#c9c9cf"/>
      <rect x="13" y="4" width="5" height="1.6" fill="#f2f2f5"/><rect x="13" y="6" width="5" height="1.6" fill="#c9c9cf"/></g>`) },
  { key: 'concluido', label: 'Concluído', ev: "turn.complete · reason 'answer'", desc: 'Terminou a resposta',
    art: svg(`<g class="bounce">${body('happy')}</g>
      <g class="pop">${px(['    l', '   l ', 'l l  ', ' l   '], 13, -3.6, .9)}</g>
      <path class="spark" d="M-.6 0 L0 .8 L.6 0 L0 -.8 Z" fill="#ffd34d"/>
      <path class="spark s2" d="M12 5 L12.4 5.6 L12.8 5 L12.4 4.4 Z" fill="#ffd34d"/>`) },
  { key: 'interrompido', label: 'Interrompido', ev: "turn.complete · reason 'aborted'", desc: 'Você apertou Esc ou parou',
    art: svg(`<g class="shake">${body('angry')}</g>
      <path class="drop" d="M13.5 1 Q14.3 2.1 14.3 2.6 A.8 .8 0 0 1 12.7 2.6 Q12.7 2.1 13.5 1 Z" fill="#7dd3fc"/>`) },
  { key: 'erro', label: 'Erro', ev: "turn.complete · reason 'error' / 'refusal'", desc: 'Erro da API ou recusa',
    art: svg(`<g transform="translate(0 .5)">${body('dizzy')}</g>
      <g class="alarm">${px(['r', 'r', 'r', ' ', 'r'], 13.5, -4.5, .9)}</g>`) },
]

const tiles = STATES.map(st => `
    <div class="tile">
      <div class="art">${st.art}</div>
      <div class="name">${st.label}</div>
      <div class="desc">${st.desc}</div>
      <code class="ev">${st.ev}</code>
    </div>`).join('')
const radios = STATES.map((st, i) => `<input type="radio" name="st" id="st-${st.key}"${i === 0 ? ' checked' : ''}>`).join('')
const poses = STATES.map(st => `<div class="pose pose-${st.key}">${st.art}</div>`).join('')
const labels = STATES.map(st => `<label for="st-${st.key}" class="btn btn-${st.key}">${st.label}</label>`).join('')
const pick = STATES.map(st => `#st-${st.key}:checked ~ .hud .pose-${st.key}{display:flex}#st-${st.key}:checked ~ .picker .btn-${st.key}{border-color:#d97757;color:#d97757}`).join('\n')

// Rampas: cada barra esquenta até o vermelho, em famílias de cor diferentes.
const RAMPS = {
  janela: [[0, [217, 119, 87]], [0.75, [217, 119, 87]], [1, [229, 72, 77]]], // laranja do Claude, esquenta a partir de 75%
  contexto: [[0, [42, 120, 214]], [0.75, [42, 120, 214]], [1, [229, 72, 77]]], // azul #2a78d6, esquenta a partir de 75%
}
const hex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
function rampAt(name, pct) {
  const stops = RAMPS[name], t = Math.min(Math.max(pct, 0), 100) / 100
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i], [t0, c0] = stops[i - 1]
    if (t <= t1) { const k = (t - t0) / (t1 - t0); return hex(c0.map((v, j) => v + (c1[j] - v) * k)) }
  }
  return hex(stops.at(-1)[1])
}
// Mini Clawd que anda na ponta da barra, pintado com a cor daquele ponto.
function mini(color) {
  const cell = (x, y, f, cls = '') => `<rect${cls} x="${x}" y="${y}" width="1" height="1" fill="${f}"/>`
  const rows = [' cccccc ', ' ckcckc ', 'cccccccc', ' cccccc ']
  let r = ''
  rows.forEach((l, y) => [...l].forEach((ch, x) => { if (ch !== ' ') r += cell(x, y, ch === 'k' ? '#141416' : color) }))
  const legsA = [1, 3, 5, 7].map(x => cell(x, 4, color)).join('')
  const legsB = [0, 2, 4, 6].map(x => cell(x, 4, color)).join('')
  return `<svg class="mini" viewBox="0 0 8 5" shape-rendering="crispEdges"><g class="walk">${r}<g class="la">${legsA}</g><g class="lb2">${legsB}</g></g></svg>`
}
const barHtml = (ramp, pct) => {
  const tip = rampAt(ramp, pct)
  return `<span class="bar"><span class="bf" style="width:${pct}%;background:linear-gradient(90deg,${rampAt(ramp, 0)},${tip})"></span><span class="mw" style="left:${pct}%">${mini(tip)}</span></span>`
}
const row = (label, ramp, pct, of100, detail) => `
      <div class="r">
        <span class="lb">${label}</span>
        ${barHtml(ramp, pct)}
        <span class="fig"><b style="color:${rampAt(ramp, pct)}">${pct}%</b>${of100 ? '<small>/100%</small>' : ''}</span>
        <span class="dt">${detail}</span>
      </div>`
const levels = [30, 75, 90, 100]
const rampDemo = ['janela', 'contexto'].map(ramp => `
    <div class="lvl"><span class="lb">${ramp === 'janela' ? 'Janela 5h' : 'Contexto'}</span>${levels.map(p => `<span class="lv">${barHtml(ramp, p)}<b style="color:${rampAt(ramp, p)}">${p}%</b></span>`).join('')}</div>`).join('')

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Protótipo Rei Clawd</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; background: #151517; color: #f2f2f5; font-family: Inter, "Segoe UI", system-ui, sans-serif; font-size: 13px; }
  h1 { font-size: 16px; font-weight: 600; margin: 4px 0; }
  h2 { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #85858b; margin: 22px 0 10px; }
  p.note { color: #85858b; margin: 0 0 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .tile { background: #1f1f22; border: 1px solid #2a2a2d; border-radius: 10px; padding: 14px 10px 10px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .tile .art svg { width: 110px; height: auto; overflow: visible; }
  .tile .name { font-weight: 600; }
  .tile .desc { color: #85858b; font-size: 11px; text-align: center; }
  .tile .ev { color: #a3e635; font-size: 10px; text-align: center; background: #151517; border-radius: 4px; padding: 2px 6px; }

  /* HUD igual ao usage-hud atual, com o Clawd do lado esquerdo */
  input[name=st] { position: absolute; opacity: 0; pointer-events: none; }
  .hud { display: flex; align-items: center; gap: 14px; width: 800px; max-width: 100%; padding: 12px 16px 12px 12px; background: #1f1f22; border-radius: 12px; }
  .hud-side { width: 48px; flex-shrink: 0; display: flex; justify-content: center; }
  .pose { display: none; }
  .pose svg { width: 48px; height: auto; overflow: visible; }
  .card { position: relative; flex: 1; min-width: 0; background: #151517; border: 1px solid #2a2a2d; border-radius: 10px; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
  .r { display: flex; align-items: center; font-size: 12px; white-space: nowrap; }
  .lb { width: 80px; color: #7c7c82; flex-shrink: 0; }
  .bar { position: relative; width: 180px; height: 2px; background: rgba(255,255,255,.07); border-radius: 1px; flex-shrink: 0; margin-right: 16px; }
  .bf { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 1px; }
  .mw { position: absolute; bottom: 1px; transform: translateX(-50%); line-height: 0; }
  .mini { width: 18px; height: auto; display: block; overflow: visible; }
  .walk { animation: hop .5s steps(1) infinite; } .la { animation: keyOn .5s steps(1) infinite; } .lb2 { animation: keyOff .5s steps(1) infinite; opacity: 0; }
  @keyframes keyOff { 0% { opacity: 0; } 50% { opacity: 1; } }
  @keyframes hop { 0% { transform: translateY(0); } 50% { transform: translateY(-.5px); } }
  .card { padding-top: 16px; gap: 14px; }
  .levels { display: flex; flex-direction: column; gap: 18px; background: #151517; border: 1px solid #2a2a2d; border-radius: 10px; padding: 20px 16px 14px; max-width: 800px; }
  .lvl { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; }
  .lv { display: flex; align-items: center; gap: 8px; } .lv .bar { width: 110px; margin-right: 0; } .lv b { width: 36px; font-weight: 600; }
  .fig { width: 60px; flex-shrink: 0; } .fig b { font-weight: 600; } .fig small { color: #525257; font-size: 10px; margin-left: 2px; }
  .dt { color: #85858b; overflow: hidden; text-overflow: ellipsis; }
  .dt .c1 { display: inline-block; width: 100px; }
  .dt i { color: #3f3f44; font-style: normal; margin: 0 8px; } .dt em { font-style: normal; color: #6e6e73; } .dt u { text-decoration: none; color: #a1a1a6; }
  .ho { position: absolute; right: 10px; bottom: 8px; background: #2a2a2d; font-size: 12px; padding: 3px 8px; border-radius: 5px; }
  .picker { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; max-width: 800px; }
  .btn { background: #1f1f22; border: 1px solid #2a2a2d; border-radius: 999px; padding: 6px 12px; cursor: pointer; }
  ${pick}
  @media (max-width: 640px) { .bar { width: 70px; } .dt { display: none; } }

  /* animações */
  svg * { transform-box: fill-box; }
  .bob-slow { animation: bob 2.6s ease-in-out infinite; }
  .bob-fast { animation: bobFast .32s steps(1) infinite; }
  .bounce { animation: bounce .6s ease-in-out infinite; }
  .shake { animation: shake .24s steps(2) infinite; }
  .tilt { transform-origin: 50% 100%; animation: tilt 3s ease-in-out infinite; }
  .squeeze { transform-origin: 50% 100%; animation: squeeze 1.6s ease-in-out infinite; }
  .blink { animation: blink 4.2s linear infinite; opacity: 0; }
  .key-on { animation: keyOn .9s steps(1) infinite; }
  .tdot { animation: tdot 1.2s ease-in-out infinite; opacity: .3; } .tdot.d2 { animation-delay: .2s; } .tdot.d3 { animation-delay: .4s; }
  .scan { animation: scan 2.4s ease-in-out infinite; }
  .write { transform-origin: 0 50%; animation: write 2.4s steps(6) infinite; } .write.w2 { animation-delay: 1.2s; }
  .pen { animation: pen 2.4s linear infinite; }
  .type { transform-origin: 0 50%; animation: write 1.2s steps(5) infinite; }
  .spin { transform-origin: 50% 50%; animation: spin 1.6s linear infinite; }
  .agent { animation: agent 1.8s steps(1) infinite; } .agent.a2 { animation-delay: .6s; } .agent.a3 { animation-delay: 1.2s; }
  .screen-line { animation: flick .5s steps(1) infinite; } .screen-line.l2 { animation-delay: .25s; }
  .link { stroke-dasharray: .6 .6; animation: dash .8s linear infinite; }
  .pop { transform-origin: 30% 100%; animation: pop 1.6s ease-in-out infinite; }
  .hourglass { transform-origin: 50% 50%; animation: flip 2.4s ease-in-out infinite; }
  .squish { transform-origin: 50% 100%; animation: squish 1.6s ease-in-out infinite; }
  .arrow { animation: keyOn .8s steps(1) infinite; }
  .spark { transform-origin: 50% 50%; animation: twinkle 1.4s ease-in-out infinite; opacity: 0; } .spark.s2 { animation-delay: .5s; }
  .drop { animation: drop 1.6s ease-in infinite; opacity: 0; }
  .alarm { animation: keyOn .8s steps(1) infinite; }

  @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-.8px); } }
  @keyframes bobFast { 0% { transform: translateY(0); } 50% { transform: translateY(-.5px); } }
  @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
  @keyframes shake { 0% { transform: translateX(-.4px); } 50% { transform: translateX(.4px); } }
  @keyframes tilt { 0%,100% { transform: rotate(0); } 30%,60% { transform: rotate(-5deg); } }
  @keyframes squeeze { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(.92); } }
  @keyframes blink { 0%,93% { opacity: 0; } 95%,97% { opacity: 1; } 99%,100% { opacity: 0; } }
  @keyframes keyOn { 0% { opacity: 1; } 50% { opacity: 0; } }
  @keyframes tdot { 0%,60%,100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-.4px); } }
  @keyframes scan { 0%,100% { transform: translate(0,0); } 25% { transform: translate(1.6px,0); } 50% { transform: translate(1.6px,2.6px); } 75% { transform: translate(0,2.6px); } }
  @keyframes write { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
  @keyframes pen { 0% { transform: translate(0,0); } 45% { transform: translate(3px,0); } 50% { transform: translate(0,1.5px); } 95% { transform: translate(2.6px,1.5px); } 100% { transform: translate(0,0); } }
  @keyframes spin { 0% { transform: scaleX(1); } 50% { transform: scaleX(.1); } 100% { transform: scaleX(1); } }
  @keyframes agent { 0% { opacity: .25; } 33% { opacity: 1; } 66%,100% { opacity: .25; } }
  @keyframes flick { 0% { opacity: 1; } 50% { opacity: .2; } }
  @keyframes dash { to { stroke-dashoffset: -1.2; } }
  @keyframes pop { 0%,100% { transform: scale(1); } 10% { transform: scale(1.15); } 20% { transform: scale(1); } }
  @keyframes flip { 0%,70% { transform: rotate(0); } 85%,100% { transform: rotate(180deg); } }
  @keyframes squish { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(.45); } }
  @keyframes twinkle { 0%,100% { opacity: 0; transform: scale(.6); } 50% { opacity: 1; transform: scale(1); } }
  @keyframes drop { 0% { opacity: 0; transform: translateY(0); } 20% { opacity: 1; } 100% { opacity: 0; transform: translateY(5px); } }
  @media (prefers-reduced-motion: reduce) { * { animation-play-state: paused !important; } }
</style>
</head>
<body>
<h1>Protótipo: Rei Clawd</h1>
<p class="note">13 estados, cada um ligado a um evento real do Claude Code (em verde, embaixo de cada um). Só visual, ainda não está no usage-hud.</p>

<h2>Dentro do usage-hud</h2>
${radios}
<div class="hud">
  <div class="hud-side">${poses}</div>
  <div class="card">${row('Janela 5h', 'janela', 11, true, '<span class="c1">renova às 13:10</span><i>·</i>faltam 2h 55min')}${row('Contexto', 'contexto', 27, false, '<span class="c1">265k de 1.0M</span><i>·</i><em>faltam</em> <u>735k</u>')}
    <span class="ho">Gerar handoff</span>
  </div>
</div>
<div class="picker">${labels}</div>

<h2>Barras em vários níveis</h2>
<div class="levels">${rampDemo}
</div>

<h2>Estados</h2>
<div class="grid">${tiles}
</div>
</body>
</html>
`
fs.writeFileSync('clawd-prototype.html', html)
console.log('ok', STATES.length, 'estados,', html.length, 'bytes')
