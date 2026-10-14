<div align="center">

# usage-hud

### Saiba quanto ainda cabe na sua sessão do Claude Code, sem sair do que você está fazendo.

<p>
  <img alt="Claude Code" src="https://img.shields.io/badge/Claude%20Code-mod-d97757?style=for-the-badge&labelColor=151517">
  <img alt="Versão" src="https://img.shields.io/badge/vers%C3%A3o-0.1.0-a3e635?style=for-the-badge&labelColor=151517">
  <img alt="Idioma" src="https://img.shields.io/badge/idioma-PT--BR-e07a5f?style=for-the-badge&labelColor=151517">
  <img alt="Licença MIT" src="https://img.shields.io/badge/licen%C3%A7a-MIT-a1a1a6?style=for-the-badge&labelColor=151517">
</p>

<img src="assets/preview.svg" alt="O usage-hud acima do campo de mensagem: Janela 5h em 42%, Contexto em 61% e o botão Gerar handoff" width="880">

<br>

**Uso da janela de 5h · Contexto da sessão · Handoff em um clique**

</div>

<br>

## Por que usar

Você está no meio de uma tarefa longa e, de repente, o contexto acaba ou o limite de uso chega. O que estava na cabeça do Claude se perde, e você precisa explicar tudo de novo.

O **usage-hud** deixa esses números sempre à vista, logo acima de onde você digita, e te dá um jeito rápido de levar a sessão inteira para uma conversa nova antes que seja tarde.

<br>

## O que você ganha

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>⏱️ Janela de 5h</h3>
      Quanto do seu limite de 5 horas já foi usado, a hora exata em que ele renova e quanto tempo falta.
    </td>
    <td width="33%" valign="top">
      <h3>🧠 Contexto</h3>
      Quanto da memória da sessão está ocupado, em porcentagem e em tokens. A cor muda de verde para vermelho conforme chega perto de 75%.
    </td>
    <td width="33%" valign="top">
      <h3>📋 Handoff</h3>
      Um clique gera um resumo completo da sessão, abre num painel e já copia para você colar na próxima conversa.
    </td>
  </tr>
</table>

<br>

## Handoff em um clique

Quando o contexto passa de 73%, o botão **Gerar handoff** ganha destaque. Ele escreve um documento com tudo que a próxima sessão precisa saber:

- **Objetivo** e **estado atual**
- **Próximos passos**, na ordem certa
- **Decisões tomadas** e por quê
- **Arquivos e comandos** relevantes
- **Erros e pendências**
- Um **prompt pronto** para colar na sessão nova

<div align="center">
  <img src="assets/handoff.svg" alt="Cartão de handoff pronto, com os botões Copiar, Abrir e Fechar e uma prévia do documento" width="880">
</div>

<br>

## Funciona no app e no terminal

No **app desktop** (aba Code), o HUD aparece como um cartão com barras animadas. No **terminal**, ele se adapta em duas linhas de texto, com as mesmas informações e o mesmo botão.

<div align="center">
  <img src="assets/terminal.svg" alt="O usage-hud no terminal, em duas linhas de texto" width="880">
</div>

<br>

## Instalação

Leva menos de um minuto. Abra o Claude Code **no terminal** (`claude`) e digite:

```
/plugin install usage-hud --marketplace ba-lison/usage-hud
```

1. Responda **`y`** para adicionar o marketplace.
2. Dê **Enter** no escopo **user**, para valer em todas as sessões.

Pronto: o HUD aparece na hora e carrega sozinho daqui em diante, inclusive na aba Code do app desktop.

> [!NOTE]
> O comando `/plugin install` só funciona no terminal. Na aba Code do app ele não está disponível, mas o HUD instalado pelo terminal aparece lá normalmente.

<br>

## Atualizar

```
/plugin marketplace update balison-mods
```

<br>

## Perguntas frequentes

<details>
<summary><b>Por que a Janela 5h mostra "aguardando a primeira resposta"?</b></summary>
<br>
O uso da janela só é informado depois que o Claude responde pela primeira vez na sessão. Mande qualquer mensagem e o número aparece.
</details>

<details>
<summary><b>O handoff pode ser em outro idioma?</b></summary>
<br>
Sim. O pedido do handoff fica em <code>HANDOFF_PROMPT</code>, no arquivo <code>hooks/register.tsx</code>. Troque o texto pelo idioma e pelas seções que preferir.
</details>

<details>
<summary><b>O HUD atrapalha alguma coisa?</b></summary>
<br>
Não. Ele só desenha a faixa acima do campo de mensagem e sai da frente quando o Claude Code precisa desse espaço para outra coisa, como uma pesquisa de satisfação.
</details>

<br>

## Licença

[MIT](LICENSE) © Alison Cruz

<br>

<div align="center">
<sub>Feito por <a href="https://github.com/ba-lison">Alison Cruz</a></sub>
</div>
