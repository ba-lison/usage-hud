# Rei Clawd no usage-hud: decisões do protótipo

Protótipo aprovado em 2026-10-16. Abra `clawd-prototype.html` no navegador.
O HTML é gerado por `gen13.mjs` (`node gen13.mjs`); edite o gerador, não o HTML.

## Layout
- HUD igual ao atual (Janela 5h, Contexto, horários de reset, tokens, botão "Gerar handoff").
- Rei Clawd pequeno (~48px) do lado esquerdo, fora do card.
- Os "faltam" das duas linhas alinhados na mesma coluna.
- Não depende do mod tripulação: o pixel art foi copiado de `docs/rei.svg` dele.

## Barras
- Janela 5h: laranja do Claude `#d97757` fixo até 75%, depois esquenta até `#e5484d` em 100%.
- Contexto: azul `#2a78d6` fixo até 75%, depois esquenta até `#e5484d` em 100%.
- No lugar da bolinha da ponta, um mini Clawd andando, com a cor daquele ponto da barra.

## Os 13 estados e o evento que liga cada um
| Estado | Evento |
|---|---|
| Parado | `session.start`, ou fim do turno sem nada rodando |
| Pensando | `turn.step` |
| Lendo | `tool.call`: Read, Grep, Glob |
| Editando | `tool.call`: Edit, Write, NotebookEdit |
| No terminal | `tool.call`: Bash, PowerShell |
| Na web | `tool.call`: WebSearch, WebFetch, navegador |
| Orquestrando | `tool.call`: Agent / `agent.spawn` (durante o turno) |
| Esperando você | `tool.call`: AskUserQuestion, ExitPlanMode |
| Aguardando | `turn.complete` com tarefas ainda `running` em `$.agent.list()` |
| Compactando | `session.compact` |
| Concluído | `turn.complete` com `reason: 'answer'` |
| Interrompido | `turn.complete` com `reason: 'aborted'` |
| Erro | `turn.complete` com `reason: 'error'` ou `'refusal'` |

Ferramenta fora da lista cai em "trabalhando" genérico. Concluído, Interrompido e Erro
duram alguns segundos e voltam para Parado (ou Aguardando).

## Próximos passos
1. Revisar o handoff (às vezes trava e não consegue abrir nova janela de contexto).
2. Implementar no mod, testar localmente, e só depois publicar no GitHub.
