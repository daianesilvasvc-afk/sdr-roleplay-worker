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

function modeloPara(task, env) {
  return task === "avaliacao"
    ? (env.GEMINI_MODEL_AVALIACAO || "gemini-2.5-pro")
    : (env.GEMINI_MODEL_PERSONA || "gemini-2.5-flash");
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
  // A avaliacao tem contrato de JSON estrito — pedir JSON nativo evita
  // depender do remendo de fechar chaves no front.
  if (task === "avaliacao") payload.generationConfig.responseMimeType = "application/json";

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

async function handleSave(request, env) {
  const body = await request.json();
  const {
    sdr_name, persona_name, persona_shop, persona_city,
    level, resumo_lider, veredicto, transcript,
    rubrica_versao, media_criterios, script_pct, bant_score, avaliacao,
  } = body;

  if (!sdr_name || typeof sdr_name !== "string" || !sdr_name.trim()) {
    return json({ error: { message: "sdr_name é obrigatório" } }, 400);
  }

  const num = (v) => (Number.isFinite(v) ? v : null);
  const pct = num(script_pct);

  await env.DB.prepare(
    `INSERT INTO simulations (sdr_name, persona_name, persona_shop, persona_city, level,
       rubrica_versao, media_criterios, script_pct, bant_score, score,
       criterios_json, resumo_lider, veredicto, transcript)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    sdr_name.trim(),
    persona_name || null,
    persona_shop || null,
    persona_city || null,
    level || null,
    rubrica_versao || null,
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
       rubrica_versao, media_criterios, script_pct, bant_score, score,
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
