# sdr-roleplay-worker

Cloudflare Worker que dá suporte ao [sdr-roleplay](https://github.com/daianesilvasvc-afk/sdr-roleplay) (simulador de roleplay em áudio pra SDRs).

URL: https://withered-wildflower-db78.daiane-silvasvc.workers.dev

## Rotas

- `POST /` — proxy pra **API do Gemini** (usado pelas falas do "barbeiro" simulado e pela avaliação final). Recebe o payload no formato Anthropic (`{task, system, messages, max_tokens, temperature}`) e devolve `{content:[{text}]}` — a tradução para o formato do Gemini acontece dentro do worker, então trocar de provedor não exige mexer no `index.html`.
  - `task: "persona"` → modelo rápido (`GEMINI_MODEL_PERSONA`, default `gemini-2.5-flash`)
  - `task: "avaliacao"` → modelo de qualidade (`GEMINI_MODEL_AVALIACAO`, default `gemini-2.5-pro`), com `responseMimeType: application/json` para o JSON da nota vir bem-formado
  - A chave `GEMINI_API_KEY` fica como **secret** na Cloudflare, nunca no código nem no front (o site é estático e público).
- `POST /save` — grava o resultado de uma simulação no D1: `sdr_name`, persona, nível, `rubrica_versao`, `media_criterios` (0–5), `script_pct` (0–100), `bant_score` (0–4), `avaliacao` (JSON completo), `resumo_lider`, `veredicto` (síntese do líder) e `transcript`.
- `GET /history?sdr_name=&limit=` — lista simulações salvas, mais recentes primeiro. Usado pelo `historico.html` do site. **Não** devolve as transcrições por padrão (só pesariam o payload); use `?include_transcript=1` para trazê-las.

## Banco

D1 `sdr_roleplay_db`, tabela `simulations` — schema em [`schema.sql`](schema.sql).

A régua de avaliação é a **v4.1 (NEPQ + BANT)**: cada simulação gera **dois números em escalas diferentes** — média dos 4 critérios (0–5) e % de script seguido (0–100). A coluna `score` é legado e apenas espelha `script_pct`; não some as duas escalas.

## Configuração

A chave do Gemini vai como secret — o comando pede o valor num prompt interativo, então ela não passa por arquivo nem por histórico de shell:

```bash
npx wrangler secret put GEMINI_API_KEY
```

Para trocar de modelo sem mexer no código, defina as vars opcionais `GEMINI_MODEL_PERSONA` e `GEMINI_MODEL_AVALIACAO` (em `wrangler.toml` ou no dashboard).

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
