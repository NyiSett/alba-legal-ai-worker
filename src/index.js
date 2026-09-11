export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "alba-legal-ai-worker" }, 200, corsHeaders);
    }

    if (url.pathname !== "/chat" || request.method !== "POST") {
      return json(
        { error: "Not found", endpoints: ["GET /health", "POST /chat"] },
        404,
        corsHeaders,
      );
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: "OPENAI_API_KEY secret is not configured." }, 500, corsHeaders);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Request body must be valid JSON." }, 400, corsHeaders);
    }

    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) {
      return json({ error: "message is required." }, 400, corsHeaders);
    }

    const context =
      body?.context && typeof body.context === "object" ? body.context : {};

    const systemPrompt = [
      "You are AlbA Legal AI, a buyer-side commercial trade dispute assistant.",
      "Reason from the case context provided by the user.",
      "Separate facts from assumptions.",
      "Identify evidence gaps, contradictions, contract or rule issues, risks, and practical next steps.",
      "Do not invent documents, facts, or legal authorities.",
      "This is an MVP API; keep responses structured and concise.",
    ].join(" ");

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({ message, context }),
              },
            ],
          },
        ],
      }),
    });

    const responseText = await openaiResponse.text();

    if (!openaiResponse.ok) {
      return json(
        {
          error: "OpenAI API request failed.",
          upstream_status: openaiResponse.status,
          details: responseText,
        },
        502,
        corsHeaders,
      );
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return json({ ok: true, raw: responseText }, 200, corsHeaders);
    }

    return json({ ok: true, response: data }, 200, corsHeaders);
  },
};

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}
