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

async function handleProxy(request, env) {
  const body = await request.json();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return json(data, response.status);
}

async function handleSave(request, env) {
  const body = await request.json();
  const {
    sdr_name, persona_name, persona_shop, persona_city,
    level, score, criterios, resumo_lider, veredicto, transcript,
  } = body;

  if (!sdr_name || typeof sdr_name !== "string" || !sdr_name.trim()) {
    return json({ error: { message: "sdr_name é obrigatório" } }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO simulations (sdr_name, persona_name, persona_shop, persona_city, level, score, criterios_json, resumo_lider, veredicto, transcript)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    sdr_name.trim(),
    persona_name || null,
    persona_shop || null,
    persona_city || null,
    level || null,
    Number.isFinite(score) ? score : null,
    criterios ? JSON.stringify(criterios) : null,
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
    : "id, sdr_name, persona_name, persona_shop, persona_city, level, score, criterios_json, resumo_lider, veredicto, created_at";
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
