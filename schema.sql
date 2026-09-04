CREATE TABLE IF NOT EXISTS simulations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sdr_name TEXT NOT NULL,
  persona_name TEXT,
  persona_shop TEXT,
  persona_city TEXT,
  level TEXT,
  -- Regua v4.1 (NEPQ + BANT): dois numeros por simulacao, em escalas diferentes.
  rubrica_versao TEXT,
  media_criterios REAL,     -- media dos 4 criterios, 0 a 5 (NA fica de fora da media)
  script_pct INTEGER,       -- quanto do script foi seguido, 0 a 100
  bant_score INTEGER,       -- pilares BANT confirmados, 0 a 4
  score INTEGER,            -- legado: espelha script_pct para nao quebrar leitor antigo
  criterios_json TEXT,      -- avaliacao completa como veio do modelo
  resumo_lider TEXT,
  veredicto TEXT,           -- frase de sintese do lider
  transcript TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_simulations_sdr ON simulations (sdr_name);
CREATE INDEX IF NOT EXISTS idx_simulations_created ON simulations (created_at);
