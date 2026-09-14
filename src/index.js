const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// O front manda um payload no formato Anthropic ({system, messages, max_tokens})
// e espera de volta {content:[{text}]}. Traduzimos os dois lados aqui para que
// trocar de provedor nao exija mexer no index.html.
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Os modelos 2.5 continuam no catalogo mas o Google os bloqueou para chaves
// novas ("no longer available to new users"), o que quebrou o simulador na troca
// da chave. Defaults fixados em nome exato, nunca em alias tipo `gemini-pro-latest`:
// a avaliacao precisa ser reproduzivel, e alias muda debaixo da gente.
// Use GET /models para ver o que a chave atual enxerga.
function modeloPara(task, env) {
  return task === "avaliacao"
    ? (env.GEMINI_MODEL_AVALIACAO || "gemini-3.1-pro-preview")
    : (env.GEMINI_MODEL_PERSONA || "gemini-3.8-flash");
}

async function handleProxy(request, env) {
  if (!env.GEMINI_API_KEY) {
    return json({ error: { message: "GEMINI_API_KEY nao configurada no worker" } }, 500);
  }
  const body = await request.json();
  const task = body.task === "avaliacao" ? "avaliacao" : "persona";

  const payload = {
    contents: (body.messages || []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      maxOutputTokens: body.max_tokens || 8000,
    },
  };
  if (body.system) payload.systemInstruction = { parts: [{ text: body.system }] };
  if (typeof body.temperature === "number") payload.generationConfig.temperature = body.temperature;
  // A avaliacao tem contrato de JSON estrito — pedir JSON nativo evita
  // depender do remendo de fechar chaves no front.
  if (task === "avaliacao") payload.generationConfig.responseMimeType = "application/json";

  // A persona nao pode raciocinar em voz alta: o modelo vazou o proprio
  // chain-of-thought no meio da fala do barbeiro ("**Thinking Process:** The SDR
  // just presented..."), citando as instrucoes do personagem e chegando a escrever
  // a fala do SDR com um preco inventado. Um barbeiro ao telefone nao precisa
  // deliberar, precisa responder.
  //
  // Na familia 3.x o controle e `thinkingLevel`, nao `thinkingBudget` — o campo
  // antigo e aceito e ignorado, e o raciocinio comia o orcamento de saida
  // (resposta cortada em 14 caracteres com 120 tokens disponiveis). "low" e o
  // minimo: o enum rejeita "none". A avaliacao fica no default, que raciocina —
  // ela depende disso para varrer a transcricao antes de pontuar.
  if (task === "persona") {
    payload.generationConfig.thinkingConfig = { thinkingLevel: "low" };
  }

  const modelo = modeloPara(task, env);
  const response = await fetch(`${GEMINI_BASE}/${modelo}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify(payload),
  });
  const data = await response.json();

  if (!response.ok || data.error) {
    const msg = (data.error && data.error.message) || `Gemini HTTP ${response.status}`;
    return json({ error: { message: msg } }, response.status || 500);
  }

  const cand = (data.candidates || [])[0];
  const texto = ((cand && cand.content && cand.content.parts) || [])
    .map((p) => p.text || "")
    .join("");
  if (!texto) {
    // Sem texto util: bloqueio de safety, corte por limite de tokens, resposta vazia.
    const motivo = (cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || "resposta vazia";
    return json({ error: { message: `Gemini nao retornou texto (${motivo})` } }, 502);
  }

  return json({
    content: [{ type: "text", text: texto }],
    stop_reason: cand.finishReason === "MAX_TOKENS" ? "max_tokens" : "end_turn",
    model: modelo,
  });
}

// Diagnostico: lista os modelos que a chave configurada enxerga.
// Existe para que ninguem precise da chave para descobrir isso — foi exatamente
// o que travou a troca da chave, quando os modelos 2.5 sairam do ar para chaves
// novas e nao havia como listar os disponiveis sem o valor em mao.
async function handleModels(request, env) {
  if (!env.GEMINI_API_KEY) {
    return json({ error: { message: "GEMINI_API_KEY nao configurada no worker" } }, 500);
  }
  const response = await fetch(GEMINI_BASE, {
    headers: { "x-goog-api-key": env.GEMINI_API_KEY },
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    const msg = (data.error && data.error.message) || `Gemini HTTP ${response.status}`;
    return json({ error: { message: msg } }, response.status || 500);
  }
  // So o que interessa para escolher modelo — nada de eco da chave.
  const models = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => ({ id: m.name.replace("models/", ""), input: m.inputTokenLimit, output: m.outputTokenLimit }));
  return json({ configurado: { persona: modeloPara("persona", env), avaliacao: modeloPara("avaliacao", env) }, models });
}

async function handleSave(request, env) {
  const body = await request.json();
  const {
    sdr_name, persona_name, persona_shop, persona_city,
    level, resumo_lider, veredicto, transcript,
    rubrica_versao, media_criterios, script_pct, bant_score, avaliacao, modelo_avaliador,
  } = body;

  if (!sdr_name || typeof sdr_name !== "string" || !sdr_name.trim()) {
    return json({ error: { message: "sdr_name é obrigatório" } }, 400);
  }

  const num = (v) => (Number.isFinite(v) ? v : null);
  const pct = num(script_pct);

  await env.DB.prepare(
    `INSERT INTO simulations (sdr_name, persona_name, persona_shop, persona_city, level,
       rubrica_versao, modelo_avaliador, media_criterios, script_pct, bant_score, score,
       criterios_json, resumo_lider, veredicto, transcript)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    sdr_name.trim(),
    persona_name || null,
    persona_shop || null,
    persona_city || null,
    level || null,
    rubrica_versao || null,
    modelo_avaliador || null,
    num(media_criterios),
    pct,
    num(bant_score),
    pct,                 // coluna legada `score` espelha o % de script
    avaliacao ? JSON.stringify(avaliacao) : null,
    resumo_lider || null,
    veredicto || null,
    transcript || null
  ).run();

  return json({ ok: true });
}

async function handleHistory(request, env) {
  const url = new URL(request.url);
  const sdrFilter = url.searchParams.get("sdr_name");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);
  const withTranscript = url.searchParams.get("include_transcript") === "1";

  // A lista do gestor nao precisa das transcricoes — so pesa o payload.
  const cols = withTranscript
    ? "*"
    : `id, sdr_name, persona_name, persona_shop, persona_city, level,
       rubrica_versao, modelo_avaliador, media_criterios, script_pct, bant_score, score,
       criterios_json, resumo_lider, veredicto, created_at`;
  let query = "SELECT " + cols + " FROM simulations";
  const binds = [];
  if (sdrFilter) {
    query += " WHERE sdr_name = ?";
    binds.push(sdrFilter);
  }
  query += " ORDER BY created_at DESC LIMIT ?";
  binds.push(limit);

  const stmt = env.DB.prepare(query).bind(...binds);
  const { results } = await stmt.all();

  const parsed = results.map((r) => ({
    ...r,
    criterios: r.criterios_json ? JSON.parse(r.criterios_json) : null,
  }));

  return json({ results: parsed });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/save" && request.method === "POST") {
        return await handleSave(request, env);
      }
      if (url.pathname === "/models" && request.method === "GET") {
        return await handleModels(request, env);
      }
      if (url.pathname === "/history" && request.method === "GET") {
        return await handleHistory(request, env);
      }
      if (request.method === "POST") {
        return await handleProxy(request, env);
      }
      return json({ error: { message: "Not found" } }, 404);
    } catch (err) {
      return json({ error: { message: err.message } }, 500);
    }
  },
};
