CREATE TABLE IF NOT EXISTS simulations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sdr_name TEXT NOT NULL,
  persona_name TEXT,
  persona_shop TEXT,
  persona_city TEXT,
  level TEXT,
  score INTEGER,
  criterios_json TEXT,
  resumo_lider TEXT,
  veredicto TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_simulations_sdr ON simulations (sdr_name);
CREATE INDEX IF NOT EXISTS idx_simulations_created ON simulations (created_at);
