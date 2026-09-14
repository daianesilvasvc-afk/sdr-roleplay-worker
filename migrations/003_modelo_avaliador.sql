-- Qual modelo pontuou cada simulação — 2026-09-14
-- A nota NÃO é comparável entre modelos: medido na mesma transcrição, o
-- gemini-3.1-pro-preview deu +1,2 de aderência e +20 pontos de script sobre o
-- gemini-2.5-pro. Sem esta coluna o painel mostra um degrau que parece evolução
-- do time e é só troca de modelo.
-- Rodar com:
--   npx wrangler d1 execute sdr_roleplay_db --remote --yes --file migrations/003_modelo_avaliador.sql

ALTER TABLE simulations ADD COLUMN modelo_avaliador TEXT;

-- As 20 linhas existentes foram pontuadas pelo modelo antigo.
UPDATE simulations SET modelo_avaliador = 'gemini-2.5-pro' WHERE modelo_avaliador IS NULL;
