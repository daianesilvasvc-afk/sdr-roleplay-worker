# sdr-roleplay-worker

Cloudflare Worker que dá suporte ao [sdr-roleplay](https://github.com/daianesilvasvc-afk/sdr-roleplay) (simulador de roleplay em áudio pra SDRs).

URL: https://withered-wildflower-db78.daiane-silvasvc.workers.dev

## Rotas

- `POST /` — proxy pra Claude API (usado pelas falas do "barbeiro" simulado e pela avaliação final). A chave `ANTHROPIC_API_KEY` fica como secret na Cloudflare, não no código.
- `POST /save` — grava o resultado de uma simulação (`sdr_name`, persona, nível, score, critérios, resumo, veredicto) no D1.
- `GET /history?sdr_name=&limit=` — lista simulações salvas, mais recentes primeiro. Usado pelo `historico.html` do site.

## Banco

D1 `sdr_roleplay_db`, tabela `simulations` — schema em [`schema.sql`](schema.sql).

## Deploy

```bash
npx wrangler login   # conta daiane.silvasvc@gmail.com
npx wrangler deploy
```

Pra aplicar mudança de schema no banco remoto:

```bash
npx wrangler d1 execute sdr_roleplay_db --remote --file=schema.sql
```
