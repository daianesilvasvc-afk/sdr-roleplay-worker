-- Unifica as grafias do nome do SDR — 18/11/2026
-- O campo é digitado à mão: 12 pessoas estavam gravadas sob 17 nomes, e o painel
-- tratava 'Bryan' e 'bryan' como dois SDRs com médias separadas.
-- Confirmado pela Daiane que Bryan/bryan são a mesma pessoa.
-- Rodar com:
--   npx wrangler d1 execute sdr_roleplay_db --remote --yes --file migrations/004_nomes_sdr.sql

UPDATE simulations SET sdr_name = 'Bryan' WHERE sdr_name IN ('bryan', 'Bryan');
UPDATE simulations SET sdr_name = 'Daiane' WHERE sdr_name IN ('daiane', 'Daiane');
UPDATE simulations SET sdr_name = 'Emanuel' WHERE sdr_name IN ('Emanuel', 'emanuel');
UPDATE simulations SET sdr_name = 'Jhow' WHERE sdr_name IN ('jhow');
UPDATE simulations SET sdr_name = 'Lelis' WHERE sdr_name IN ('lelis', 'Lelis');
UPDATE simulations SET sdr_name = 'Matheos' WHERE sdr_name IN ('matheos');
UPDATE simulations SET sdr_name = 'Vinícius' WHERE sdr_name IN ('Vinicius', 'Vinícius');
