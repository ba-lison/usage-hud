# Handoff v2: diagnóstico e proposta

## Como funciona hoje (`hooks/register.tsx`, `makeHandoff`)
1. O botão chama `$.model.fork({ prompt: HANDOFF_PROMPT })`. O fork reenvia a conversa inteira
   da sessão, com o pedido de handoff no final, e espera a resposta.
2. Quando a resposta chega, guarda o texto no estado, abre o painel e copia para a área de transferência.
3. Para continuar, você precisa abrir uma sessão nova e colar o texto à mão.

## Por que trava ou falha
- **Sem rede de proteção.** `makeHandoff` não tem `try/catch` nem limite de tempo. Se algo lança
  erro (`$.ui.open`, `$.ui.copy`) ou o fork demora, o estado fica preso em `working` e o botão
  fica em "Gerando..." para sempre, até recarregar.
- **O fork não tem como ser cancelado nem tem timeout.** `ModelForkRequest` só aceita `prompt`.
  Numa conversa de 700k tokens, a resposta pode demorar bastante.
- **Contexto quase cheio.** O fork manda o contexto inteiro mais o pedido e ainda precisa de espaço
  para a resposta. Perto do limite, a API recusa ("a API recusou o pedido"). É aqui que ele
  "não consegue criar" o handoff.

- **O travamento sobrevive ao recarregar o mod.** O estado `handoff` fica em `$.state`, e esse valor
  continua lá depois de um reload. Um `working` preso só sai abrindo uma sessão nova.
- **Resposta vazia por tentar usar ferramenta.** No fork, toda ferramenta é negada. Se o modelo tenta
  ler um arquivo para conferir algo antes de escrever, a resposta volta como `empty-reply`
  ("a resposta veio vazia"). O prompt não diz "não use ferramentas".
- **O texto só existe na memória da sessão e no clipboard.** Se a cópia falha e a sessão fecha, o handoff se perde.

## Por que pode gastar mais tokens do que deveria
- **Dois cliques, dois forks.** A trava contra clique duplo usa o `isWorking` do último desenho.
  Dois cliques antes de a tela redesenhar disparam dois forks e pagam duas vezes.
- **Sempre no modelo principal.** O fork usa o modelo da sessão (por exemplo, Opus) e não deixa escolher outro mais barato.
- **Cache frio.** O fork só sai barato quando o cache da conversa ainda está quente. A doc da API diz
  que o prefixo é "billed afresh once the entry lapsed or after `/model`". Se você clica depois de um
  tempo parado, ou depois de trocar de modelo, paga a conversa inteira de novo, sem cache.
- **Saída sem limite.** O prompt pede 8 seções e nenhum tamanho máximo. Token de saída é o mais caro
  e o mais lento. O protocolo do ..Start recomenda cerca de 500 tokens, com limite de itens por campo.

## Proposta
1. **Não travar nunca:** `try/catch` em tudo, um limite de tempo (por exemplo 3 min) que libera o
   botão com a mensagem "demorou demais, tente de novo", e o tempo decorrido mostrado enquanto gera.
2. **Formato enxuto, no estilo do micro-handoff do ..Start:** campos fixos com limite (objetivo,
   status, até 5 decisões, até 10 arquivos com 1 linha cada, até 3 bloqueios, próximo passo único,
   commit e branch), mirando cerca de 600 tokens.
3. **Mostrar o custo:** depois de gerar, mostrar quanto custou (`reply.usage`), incluindo quanto veio do cache.
4. **Salvar em arquivo, não só copiar:** gravar em `.memory/handoff-latest.md` se o projeto usa o kit
   ..Start, ou em `.claude/handoff-latest.md` caso contrário, guardando um histórico com data. Nada se
   perde se o clipboard falhar.
5. **Continuar em um clique:** um botão "Continuar em sessão nova" que limpa a conversa (`/clear`) e
   preenche o campo de mensagem com um prompt curto que manda ler o arquivo de handoff. Assim a sessão
   nova começa pequena, sem colar o texto inteiro.
6. **Retomar ao abrir:** no `session.start`, se existe um handoff recente, o HUD mostra
   "Handoff de 14:32 disponível · Retomar".
7. **Alternativa sem sair da sessão:** um botão "Compactar com handoff" que usa
   `$.session.compact({ instructions })`, a compactação nativa guiada pelo mesmo formato.

## A conferir na implementação
- Se `$.command.run` consegue disparar o `/clear` nativo a partir de um mod. Se não conseguir, o botão
  só preenche o prompt e você roda o `/clear`.
- O tamanho de saída real do formato novo em uma sessão grande.
