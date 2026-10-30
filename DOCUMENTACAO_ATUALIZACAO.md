# Documentação da Atualização

**Projeto:** Day of the Undead (clone web de Project Zomboid)
**Stack:** React 19 + TypeScript + Vite 7 + Tailwind 4 + Canvas 2D · servidor Node.js + `ws`

---

## 1. Resumo do que foi implementado

| Recurso | Onde | Observações |
|---|---|---|
| Remoção do código de acesso do admin | `src/game/security.ts`, `src/components/AdminPanel.tsx` | Não existe mais senha nem código no bundle |
| Autorização server-side por identificador de conta | `server/adminConfig.mjs`, `server/ws-server.mjs` | O nome exibido **não** é prova de identidade |
| Painel especial inicialmente oculto | `src/components/SpecialPanel.tsx` | Abre apenas pela frase exata **e** com permissão do servidor |
| Ativação por voz com permissão de microfone | `src/game/panelAccess.ts` | Web Speech API, sem gravação, indicador visível, botão de parar |
| Chat de invocação com alvo selecionável | `src/components/SpecialPanel.tsx`, `src/game/panelService.ts` | Comandos estruturados; nada de `eval` |
| Spawn autoritativo no servidor | `server/panelSpawn.mjs`, `server/worldProbe.mjs` | Alvo, recurso, terreno, colisão e limites validados no servidor |
| Cooldowns e limites anti-spam | `server/sessionStore.mjs`, `server/adminConfig.mjs` | Cooldown, teto por janela, teto por sala e por alvo |
| Câmera em primeira pessoa | `src/game/firstPerson.ts`, `src/game/renderer.ts`, `src/game/engine.ts` | Preferência por jogador, persistida; não altera regras |
| Acessibilidade e segurança | `src/game/accessibility.ts` | Volume, legendas, reduzir flashes/movimento, desativar eventos |
| Auditoria mínima | `server/auditLog.mjs` | Só evento, resultado, horário e id da conta — sem áudio |
| Testes automatizados | `tests/` | 103 testes cobrindo autorização, frase, microfone, limites, spawn e FP |

---

## 2. Como configurar a conta legítima no servidor

A permissão **não** pode ser definida no cliente. O servidor precisa saber qual
identificador estável de conta corresponde à conta legítima.

### 2.1 Descobrir o identificador da conta

O identificador é o campo `id` do registro da conta:

* **Contas locais (modo offline do jogo):** `usr_XXXXXXXX`, gerado por
  `src/game/auth.ts` (`generateId()`). Ele aparece no `localStorage` do
  navegador, na chave `knox-users`, e no próprio servidor quando o cliente
  faz o handshake `admin-auth`.
* **Contas Firebase:** use o `uid` do usuário Firebase Auth. É o mesmo
  identificador estável, com a mesma semântica.

> O servidor imprime o `accountId` no log de auditoria
> (`[audit] ... account=<id>`) a cada tentativa. Isso ajuda a identificar o
> id correto sem precisar abrir o `localStorage`.

### 2.2 Vincular a conta à permissão

```bash
# Opção A — variável de ambiente (recomendado)
export ADMIN_ACCOUNT_IDS="usr_abc123,usr_def456"

# Opção B — arquivo (útil em contêineres)
export ADMIN_ACCOUNTS_FILE=./admin-accounts.json
# admin-accounts.json:  { "accountIds": ["usr_abc123"] }
```

### 2.3 Vincular o nome de exibição (opcional, recomendado)

```bash
export ADMIN_ACCOUNT_NAMES='{"RimuOfc":"usr_abc123","Guisdfas":"usr_def456"}'
```

Quando `ADMIN_ACCOUNT_NAMES` está configurado, o servidor exige que:

1. o `accountId` esteja em `ADMIN_ACCOUNT_IDS` **e**
2. o nome de exibição seja **exatamente** a chave que aponta para esse
   mesmo `accountId`.

Resultado: `RimuOfc123`, `rimuofc`, `" RimuOfc"` e um id autorizado com um
nome diferente são **todos rejeitados**.

### 2.4 Regras

* Nunca coloque senha, token ou chave secreta no repositório ou no cliente.
* Os ids acima são **identificadores**, não credenciais — só valem quando
  combinados com uma sessão autenticada real.
* Para revogar o acesso: remova o id de `ADMIN_ACCOUNT_IDS` e reinicie o
  servidor. Todas as sessões emitidas para aquela conta deixam de valer
  imediatamente (o token é conferido contra a allowlist a cada comando).
* Sem `ADMIN_ACCOUNT_IDS` configurado, **o painel administrativo e o painel
  especial ficam fechados para todas as contas**. Não existe caminho
  alternativo no cliente.

---

## 3. Lista permitida de entidades/efeitos

Definida em `server/adminConfig.mjs` → `SPAWNABLE_EFFECTS`. O cliente
recebe a lista do servidor (`spawnable` na resposta de `/admin/permission`) e
**nunca** pode inventar um id novo.

| id | Rótulo | Tipo | Qtd. | Distância mín./máx. |
|---|---|---|---|---|
| `zombie_scavenger` | Vagante | zumbi | 1 | 6 / 12 tiles |
| `zombie_brute` | Bruto | zumbi | 1 | 8 / 14 tiles |
| `zombie_swarm` | Enxame | zumbi | 5 | 8 / 16 tiles |
| `hunter` | Caçador | zumbi | 1 | 10 / 18 tiles |
| `pet` | Companheiro | zumbi | 1 | 3 / 6 tiles |

Para adicionar um efeito, edite `SPAWNABLE_EFFECTS` **e** o `switch` em
`GameEngine.applyServerSpawn` (`src/game/engine.ts`). Os dois lados precisam
conhecer o id.

---

## 4. Limites e configurações

Todos configuráveis por variável de ambiente no servidor
(`server/adminConfig.mjs` → `LIMITS`):

| Variável | Padrão | Significado |
|---|---|---|
| `PANEL_COMMAND_COOLDOWN_MS` | `3000` | Intervalo mínimo entre dois comandos privilegiados |
| `PANEL_ACTIVATION_COOLDOWN_MS` | `5000` | Intervalo mínimo entre duas aberturas do painel |
| `PANEL_MAX_COMMANDS_PER_WINDOW` | `10` | Máximo de comandos numa janela deslizante |
| `PANEL_COMMAND_WINDOW_MS` | `60000` | Tamanho da janela deslizante |
| `PANEL_MAX_ACTIVE_EFFECTS_PER_ROOM` | `30` | Máximo de efeitos vivos por sala |
| `PANEL_MAX_ACTIVE_EFFECTS_PER_TARGET` | `6` | Máximo de efeitos vivos por jogador-alvo |
| `ADMIN_SESSION_TTL_MS` | `1800000` | Validade da sessão administrativa |
| `PORT` | `8080` | Porta do servidor |

Observações:

* O slot de cooldown é consumido pela **tentativa**, não só pelo comando
  aceito — assim requisições rejeitadas também não podem ser usadas para spam.
* Efeitos do painel expiram sozinhos após 120 s (marcadores de posição).
* O teto de entidades do motor (`MAX_ACTIVE_ZOMBIES = 80`) continua valendo
  como segunda barreira.

---

## 5. Endpoints do servidor

| Método | Rota | Descrição | Autorização |
|---|---|---|---|
| `GET` | `/health` | Estado do servidor | nenhuma |
| `POST` | `/admin/permission` | Troca identidade de conta por token administrativo | id na allowlist |
| `GET` | `/admin/session` | Introspecção da sessão | `Bearer <token>` |
| `DELETE` | `/admin/session` | Revoga a sessão | `Bearer <token>` |
| `POST` | `/panel/activate` | Registro anti-replay de ativação | `Bearer <token>` |
| `POST` | `/panel/spawn` | Invocação de efeito | `Bearer <token>` |
| `GET` | `/panel/players?room=` | Lista de jogadores para o seletor de alvo | `Bearer <token>` |
| `GET` | `/admin/audit` | Feed de auditoria (eventos técnicos) | `Bearer <token>` |
| `WS` | `/` | Multijogador (`admin-auth`, `panel-spawn`) | — |

Erros devolvidos são códigos neutros (`sem-permissao`, `cooldown`,
`recurso-invalido`, `alvo-desconectado`, `limite-sala`, `limite-alvo`,
`sem-ponto-seguro`). Nenhum stack trace, id interno ou detalhe de
infraestrutura é exposto.

---

### 5.0 Isolamento por sala

O cliente envia a sala atual (`knox-room`, a mesma chave usada pelo painel de
servidores) nas mensagens `join` / `state` / `heartbeat` do WebSocket, e o
painel especial consulta `GET /panel/players?room=<sala>`. O servidor só
devolve jogadores daquela sala e o spawn é replicado apenas nela. O nome da
sala é apenas um escopo operacional — **não** é identidade e não concede
permissão nenhuma.

## 6. Formato do comando do painel

```
/spawn <recurso_permitido> --alvo <id_de_sessão>
/spawn <recurso_permitido> --target <id_de_sessão>
```

* As palavras-chave são case-insensitive; os **ids são exatos**.
* O parser aceita **apenas** 4 tokens. Texto extra é rejeitado.
* O id do recurso precisa casar `/^[a-z][a-z0-9_]{1,47}$/`.
* O id de sessão precisa casar `/^[A-Za-z0-9_-]{1,64}$/`.
* Nada é interpretado como código, script, URL ou comando de sistema.
  Não há `eval` nem execução dinâmica em nenhum ponto.
* A resposta confirma o nome do alvo e do recurso invocado.
* Se o alvo sair antes da execução, o servidor responde
  `alvo-desconectado` — **nunca** redireciona para outro jogador.

---

## 7. Ativação por voz — requisitos e limitações

* **API usada:** Web Speech API (`SpeechRecognition` /
  `webkitSpeechRecognition`), com `lang = "pt-BR"`.
* **Frase exata:** `ativar painel`. A normalização aceita
  maiúsculas/minúsculas, espaços repetidos e pontuação final
  (`ativar painel.`, `ATIVAR  PAINEL!`). Frases parecidas, palavras
  parciais ou frases com palavras adicionais são **rejeitadas**.
* **A frase não autentica.** O servidor valida a identidade e a permissão
  antes de liberar o painel; a frase apenas dispara o gatilho local.
* **Processamento do áudio:** o navegador **pode enviar o áudio** ao serviço
  de reconhecimento do fornecedor. O jogo nunca afirma processamento
  exclusivamente local. O painel explica isso **antes** de pedir a
  permissão do microfone.
* **Sem gravação:** o módulo não armazena áudio nem transcrição. O
  `localStorage` do cliente nunca recebe o conteúdo falado.
* **Escuta limitada ao contexto:** o reconhecedor só existe enquanto o
  painel está sendo armado; é destruído ao fechar o painel, cancelar,
  desconectar, revogar a permissão ou perder a autorização.
* **Indicador visível** enquanto escuta + botão **■ Parar escuta**.
* **Suporte de plataforma:**
  * Chrome / Edge (desktop e Android): funciona em HTTPS ou `localhost`.
  * Safari iOS/macOS: funciona, com permissões próprias do sistema.
  * **Firefox: não implementa a Web Speech API** → a ativação por voz fica
    indisponível e o painel permanece fechado.
  * Navegadores móveis sem `navigator.mediaDevices` → indisponível.
  * Sem HTTPS (fora de `localhost`) → o navegador bloqueia; a UI explica.
* **Alternativa acessível:** quando a voz não está disponível, o painel
  permanece fechado para contas não autorizadas — a autorização real é
  sempre a do servidor, e a ativação por voz é apenas uma das formas de
  abrir a interface depois que a permissão já foi concedida.

---

## 8. Câmera em primeira pessoa

* **Ativação:** configurações → *Câmera em primeira pessoa* (liga/desliga).
* **Persistência:** por jogador, em `localStorage` (`knox-fpv-<userId>`) e
  também espelhada no save da conta (`PlayerSave.firstPerson`).
* **Controles preservados:** a direção da câmera **é** o ângulo de mira já
  existente; sensibilidade, FOV, mira, interação e movimento continuam iguais.
* **Multiplayer:** a câmera é local. O avatar do jogador continua sendo
  desenhado normalmente para os outros clientes; apenas o modelo local é
  omitido na visão em primeira pessoa.
* **Colisão:** a câmera é posicionada na altura do personagem e recua
  automaticamente quando o teste à frente encontraria uma parede, evitando
  clipping.
* **Transição:** suavizada por blend; a posição do personagem **nunca** muda
  e a partida não é interrompida.
* **Sem vantagem de gameplay:** hitboxes, alcance, velocidade, precisão e
  regras de jogo são idênticos nos dois modos.
* **Acessibilidade:** *Reduzir movimento* atenua a oscilação da câmera;
  FOV e sensibilidade são ajustáveis.

---

## 9. Acessibilidade e segurança (opções do jogador)

Em *Configurações*:

| Opção | Efeito |
|---|---|
| Volume | Controla o volume mestre dos efeitos do jogo |
| Legendas | Ativa legendas para os sons do jogo |
| Reduzir flashes | Atenua flashes de tela em ~75% |
| Reduzir movimento | Atenua tremor de câmera e oscilação |
| Desativar eventos de suspense | Impede que eventos aleatórios sejam disparados |

O texto das configurações informa, de forma neutra, que o jogo pode conter
eventos de suspense e que os efeitos podem ser reduzidos ou desativados.
Nenhuma dessas opções altera regras de jogo.

---

## 10. Testes executados

Comando: `npm test` (Vitest) — **111 testes, 8 arquivos, todos passando.**

| Arquivo | Testes | Cobre |
|---|---|---|
| `tests/panelAccess.test.ts` | 15 | Frase exata (positiva/negativa, maiúsculas, pontuação, frases parecidas, parciais); ausência de allowlist no cliente; ausência de senha/chave no código; servidor ausente, inacessível e respondendo 403; convidados e anônimos |
| `tests/voiceActivation.test.ts` | 13 | Detecção de suporte; permissão concedida (com liberação do dispositivo), negada, microfone ausente, sem `mediaDevices`; estado da permissão; recognizer iniciar/parar; transcrições finais vs. intermediárias; permissão revogada durante a escuta |
| `tests/panelCommand.test.ts` | 14 | Sintaxe documentada; aliases;recurso inválido; alvo ausente; payloads de código/URL/SQL; ids malformados; tokens extras; sugestão de alternativas válidas |
| `tests/firstPerson.test.ts` | 7 | Persistência por jogador; survives reload; default desligado; toggle; clamp de FOV/sensibilidade; espelhamento no save sem tocar em stats de gameplay |
| `tests/firstPersonRenderer.test.ts` | 9 | Render top-down vs. primeira pessoa; o personagem **não** se move na troca nem durante a transição; avatar local oculto enquanto os outros jogadores continuam a ser desenhados; view model e crosshair; `reduceMotion`; FOV fora de faixa sem lançar erro; render com e sem zumbis |
| `tests/serverAuthorization.test.mjs` | 29 | Allowlist de ids; rejeição de nomes parecidos; sessão emitida/ revogada / revogada em massa; cooldown por comando, por janela e de ativação; allowlist de efeitos; recurso inválido; alvo desconectado/desconhecido; limites por sala e por alvo; ausência de ponto seguro;sonda de mundo determinística e paridade com o mundo do cliente |
| `tests/serverIntegration.test.mjs` | 16 | HTTP real contra `ws-server.mjs`: permissão concedida/negada; nome parecido; id autorizado com nome estrangeiro; spawn sem token; token forjado; recurso inválido; alvo desconectado; cooldown (inclusive consumindo o slot em tentativa rejeitada); corpo inválido; feed de auditoria e lista de jogadores sem token; rota inexistente |
| `tests/serverWebsocket.test.mjs` | 8 | WebSocket real contra `ws-server.mjs`: `assignId`; concessão de admin via `admin-auth`; negação de id não autorizado; negação de nome ligado a outro id; spawn de `panel-spawn` sem token (`sem-permissao`); spawn bem-sucedido perto de um alvo conectado, com replicação na sala e verificação de distância por posição; alvo desconectado (`alvo-desconectado`); **isolamento por sala** na lista de alvos |

Verificações adicionais executadas:

* `npx tsc --noEmit` — sem erros de tipos.
* `npm run build` — bundle gerado com sucesso (969 kB, 280 kB gzip).
* Varredura do bundle final (`dist/index.html`): **0 ocorrências** de
  `e4dd9d674` (código de acesso removido), **0 ocorrências** de
  `e8c1f4a20b937d5ae6f0c4137d92bb58` (chave de assinatura removida) e
  **0 ocorrências** de `RimuOfc` / `Guisdfas` (allowlist só no servidor).
* `node --check` em todos os arquivos `.mjs` do servidor.

**Não foi executado:** teste manual em navegador (sem navegador disponível
no ambiente — o download do Chromium é bloqueado pela rede do sandbox). A
validação da interface foi feita por testes automatizados com contexto 2D
simulado, e não por inspeção visual.

---

## 11. Arquivos alterados

### Novos
| Arquivo | Função |
|---|---|
| `server/adminConfig.mjs` | Allowlist de contas, lista de efeitos, limites — fonte da verdade do servidor |
| `server/sessionStore.mjs` | Sessões administrativas opacas e limitação de taxa |
| `server/panelSpawn.mjs` | Resolução autoritativa do spawn (alvo, recurso, terreno, limites) |
| `server/auditLog.mjs` | Auditoria técnica mínima (sem áudio, sem transcrição) |
| `server/worldProbe.mjs` | Espelho determinístico e somente-leitura do mundo do cliente |
| `src/game/panelAccess.ts` | Detecção de suporte, frase exata, permissão de microfone, recognizer |
| `src/game/panelService.ts` | Ponte cliente ⇄ servidor do painel |
| `src/game/firstPerson.ts` | Preferência de primeira pessoa (persistência por jogador) |
| `src/game/accessibility.ts` | Preferências de acessibilidade e segurança |
| `src/components/SpecialPanel.tsx` | Painel especial + ativador por voz + chat de invocação |
| `tests/*` (8 arquivos) | Suíte de testes (111 casos) |
| `vitest.config.ts` | Configuração do Vitest |
| `DOCUMENTACAO_ATUALIZACAO.md` | Este documento |

### Modificados
| Arquivo | Mudança |
|---|---|
| `server/ws-server.mjs` | Rotas de autorização e painel, auditoria, salas, validação de efeito e alvo, cooldown, spawn autoritativo |
| `src/game/security.ts` | **Removidos** a senha do admin e a chave de assinatura; sessões agora usam token do servidor; assinatura de códigos de resgate passou a usar chave aleatória por dispositivo |
| `src/game/adminAccess.ts` | Autorização baseada em token do servidor; **removida** a allowlist de nomes do cliente; `subscribeToPermission` para atualizar a lista de recursos em tempo real |
| `src/game/net.ts` | O adaptador WebSocket envia a sala atual (`room`) em `join`/`state`/`heartbeat`, permitindo escopo de sala no servidor |
| `src/game/types.ts` | Campo opcional `room` na mensagem de rede |
| `src/game/renderer.ts` | Projeção em primeira pessoa, view model, crosshair, colisão de câmera |
| `src/game/engine.ts` | Configuração de primeira pessoa, `applyServerSpawn`, opções de acessibilidade |
| `src/game/audio.ts` | Controle de volume mestre |
| `src/components/AdminPanel.tsx` | Tela de acesso sem código; solicita permissão ao servidor |
| `src/App.tsx` | Ativador do painel especial, chave de API do servidor, ajustes de primeira pessoa e acessibilidade |
| `vite.config.ts` | `allowedHosts` para o preview de desenvolvimento |
| `server/README.md` | Endpoints, tabela de variáveis de ambiente e notas de segurança |
| `.gitignore` | Ignora `node_modules`, `dist`, `.env*` e caches |
| `package.json` | Scripts `test` / `test:watch` e dependências de desenvolvimento |

---

## 12. Credencial encontrada e removida do repositório

Ao preparar a entrega, o GitHub **push protection** bloqueou o push porque
`server/paddleConfig.mjs` trazia uma **chave secreta do Paddle
(`pdl_live_apikey_…`) como valor padrão** do `process.env`.

Isso era uma credencial real e give-full-control da conta Paddle. Ela foi
removida do repositório:

* `server/paddleConfig.mjs` agora lê **apenas** do ambiente
  (`PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_CLIENT_TOKEN`).
  Sem chave configurada o servidor sobe em modo degradado, reporta
  `secretKeyConfigured: false` em `/health` e responde
  `503 paddle_not_configured` nas chamadas à API — **sem** fazer requisição
  externa alguma.
* `src/game/paddle.ts` aceita `VITE_PADDLE_CLIENT_TOKEN` (o token do cliente
  é público por design e pode ficar no bundle).
* `server/README-paddle.md` documenta a mudança.

> **Ação recomendada para o administrador:** a chave antiga pode ter sido
> publicada em algum repositório público antes. Revogue-a no painel da
> Paddle e emita outra. Chaves vazadas não podem ser des-publicadas — só
> trocadas.

---

## 13. Pendências e limitações honestas

1. **Identidade confiável.** O backend de autenticação do jogo é local
   (`localStorage`) e usa um hash de senha fraco. O identificador `usr_…`
   é estável *para aquele navegador*, mas quem controla o `localStorage`
   controla o id. Para uma garantia real fora do modo local, o `accountId`
   deve vir do **Firebase Auth** (o `uid`), e a allowlist do servidor deve
   conter esse `uid`. A arquitetura já está pronta para isso — só o valor
   que chega ao servidor muda.
2. **A conta legítima precisa ser vinculada.** Sem `ADMIN_ACCOUNT_IDS`
   configurado, o painel administrativo e o painel especial **não abrem
   para ninguém**. Isso é intencional: preferimos um painel fechado a um
   painel que abre com base apenas no nome.
3. **O painel especial depende do WebSocket/HTTP do servidor.** Sem backend
   acessível, não há caminho paraprivileged.
4. **Assinatura dos códigos de resgate** passou a usar uma chave aleatória
   **por dispositivo**. Isso detecta adulteração casual no mesmo navegador,
   mas não substitui validação no servidor para um fluxo de pagamento real
   (o fluxo atual é manual, via WhatsApp).
5. **O comando `/spawn` do painel** valida recurso, alvo, terreno, colisão e
   limites no servidor; a execução local repete a checagem de colisão como
   defesa, mas o posicionamento vem do servidor.
6. **Sem teste manual em navegador** — ambiente sem navegador disponível.
