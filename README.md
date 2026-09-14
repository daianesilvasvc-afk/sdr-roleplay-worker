# sdr-roleplay-worker

Cloudflare Worker que dá suporte ao [sdr-roleplay](https://github.com/daianesilvasvc-afk/sdr-roleplay) (simulador de roleplay em áudio pra SDRs).

URL: https://withered-wildflower-db78.daiane-silvasvc.workers.dev

## Rotas

- `POST /` — proxy pra **API do Gemini** (usado pelas falas do "barbeiro" simulado e pela avaliação final). Recebe o payload no formato Anthropic (`{task, system, messages, max_tokens, temperature}`) e devolve `{content:[{text}]}` — a tradução para o formato do Gemini acontece dentro do worker, então trocar de provedor não exige mexer no `index.html`.
  - `task: "persona"` → modelo rápido (`GEMINI_MODEL_PERSONA`, default `gemini-2.5-flash`)
  - `task: "avaliacao"` → modelo de qualidade (`GEMINI_MODEL_AVALIACAO`, default `gemini-2.5-pro`), com `responseMimeType: application/json` para o JSON da nota vir bem-formado
  - A chave `GEMINI_API_KEY` fica como **secret** na Cloudflare, nunca no código nem no front (o site é estático e público).
- `POST /save` — grava o resultado de uma simulação no D1: `sdr_name`, persona, nível, `rubrica_versao`, `media_criterios` (0–5), `script_pct` (0–100), `bant_score` (0–4), `avaliacao` (JSON completo), `resumo_lider`, `veredicto` (síntese do líder) e `transcript`.
- `GET /models` — lista os modelos que a chave configurada enxerga, e quais estão em uso. Existe para que ninguém precise da chave para diagnosticar disponibilidade de modelo — sem ela, a troca de chave trava sem pista.
- `GET /history?sdr_name=&limit=` — lista simulações salvas, mais recentes primeiro. Usado pelo `historico.html` do site. **Não** devolve as transcrições por padrão (só pesariam o payload); use `?include_transcript=1` para trazê-las.

## Banco

D1 `sdr_roleplay_db`, tabela `simulations` — schema em [`schema.sql`](schema.sql).

A régua de avaliação é a **v4.1 (NEPQ + BANT)**: cada simulação gera **dois números em escalas diferentes** — média dos 4 critérios (0–5) e % de script seguido (0–100). A coluna `score` é legado e apenas espelha `script_pct`; não some as duas escalas.

## Configuração

### A chave do Gemini entra pelo dashboard, e só por lá

**Nunca cole a chave num terminal, num chat, num arquivo ou numa mensagem.** A primeira chave deste worker foi desativada pelo Google por exposição, e o vazamento não foi por código: ela nunca esteve em commit nenhum nem no site publicado. Saiu por ter sido colada numa conversa com assistente de IA, que é um serviço de terceiros — para o Google, isso basta para considerar a chave comprometida.

O caminho sem exposição é navegador → navegador:

1. Gere a chave no [Google AI Studio](https://aistudio.google.com/apikey)
2. Copie
3. Dashboard da Cloudflare → Workers → `withered-wildflower-db78` → **Settings → Variables and Secrets**
4. Edite `GEMINI_API_KEY`, cole, salve

A chave não toca em disco, em histórico de shell nem em conversa.

> `npx wrangler secret put GEMINI_API_KEY` também funciona e não ecoa o valor, mas ele passa pelo terminal. Use só se o dashboard estiver indisponível — e nunca com a chave como argumento na linha de comando, que grava no histórico.

**Trave o estrago possível** na chave nova, no Google Cloud Console:
- **Restrição de API** — limite à *Generative Language API*. Chave irrestrita dá acesso a tudo habilitado no projeto.
- **Alerta de cota/orçamento** — o simulador já ficou fora do ar uma vez por saldo estourado (na época, com a chave da Anthropic). Com alerta, você descobre antes do SDR.

### Ninguém precisa da chave para trabalhar neste projeto

Este worker existe justamente para isso: ele guarda o secret e todo o resto fala com ele. Testar persona, avaliação, variância ou o painel só exige chamar `POST /`. Se o worker responder `API key not valid`, esse já é o diagnóstico completo — sem ninguém ver o valor.

Se alguém (pessoa ou assistente) pedir a chave para "testar", a resposta é não: peça para testar pelo worker.

### Modelos

| Tarefa | Default | Var para sobrescrever |
|---|---|---|
| Persona (barbeiro) | `gemini-3.8-flash` | `GEMINI_MODEL_PERSONA` |
| Avaliação (nota) | `gemini-3.1-pro-preview` | `GEMINI_MODEL_AVALIACAO` |

Os modelos **2.5 continuam no catálogo mas o Google os bloqueou para chaves novas** — trocar a chave derrubou o simulador com `no longer available to new users`. Use `GET /models` para ver o que a chave atual enxerga.

Defaults são sempre **nome exato, nunca alias** (`gemini-pro-latest` e afins): a nota precisa ser reproduzível, e alias muda debaixo do projeto sem aviso.

**Thinking:** na família 3.x o controle é `thinkingConfig.thinkingLevel`, não `thinkingBudget` — o campo antigo é aceito e silenciosamente ignorado, e o raciocínio consome o orçamento de saída. A persona roda em `"low"` (o mínimo; o enum rejeita `"none"`) porque o modelo chegou a vazar o próprio raciocínio dentro da fala do barbeiro. A avaliação fica no default, que raciocina — ela depende disso para varrer a transcrição antes de pontuar.

## Deploy

```bash
npx wrangler login   # conta daiane.silvasvc@gmail.com
npx wrangler deploy
```

### Migrações

`schema.sql` só cria a tabela do zero — `CREATE TABLE IF NOT EXISTS` **não** adiciona coluna em tabela que já existe. Mudança de schema em produção vai como arquivo em `migrations/`, e precisa rodar **antes** do `wrangler deploy` correspondente. Rode um arquivo por vez, e só os que ainda não foram aplicados — SQLite não tem `ADD COLUMN IF NOT EXISTS`, então uma coluna repetida aborta o arquivo inteiro:

```bash
npx wrangler d1 execute sdr_roleplay_db --remote --yes --file migrations/002_regua_v41.sql
```
