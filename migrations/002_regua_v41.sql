-- Regua v4.1 (NEPQ + BANT) — 2026-09-03
-- Precisa rodar ANTES do deploy do worker que grava estes campos.
-- SQLite nao tem ADD COLUMN IF NOT EXISTS: se qualquer ALTER daqui ja tiver
-- sido aplicado, o arquivo inteiro aborta com "duplicate column name".
-- Rodar com:
--   npx wrangler d1 execute sdr_roleplay_db --remote --yes --file migrations/002_regua_v41.sql

ALTER TABLE simulations ADD COLUMN rubrica_versao TEXT;
ALTER TABLE simulations ADD COLUMN media_criterios REAL;
ALTER TABLE simulations ADD COLUMN script_pct INTEGER;
ALTER TABLE simulations ADD COLUMN bant_score INTEGER;

-- Unica linha do banco, na regua antiga (media 0-10 x 10) que nao existe mais.
-- A transcricao dela nunca foi salva, entao nao ha como reavaliar. Decisao da Daiane: apagar.
DELETE FROM simulations WHERE rubrica_versao IS NULL;
