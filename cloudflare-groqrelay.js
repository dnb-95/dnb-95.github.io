const ALLOWED_ORIGIN = "https://dnb95.github.io";

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      if (origin && origin !== ALLOWED_ORIGIN) {
        return new Response(JSON.stringify({ error: "Origine non autorisée." }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...getCorsHeaders() },
        });
      }
      return new Response(null, { status: 204, headers: getCorsHeaders() });
    }

    if (origin !== ALLOWED_ORIGIN) {
      return new Response(JSON.stringify({ error: "Accès refusé : Origine non autorisée." }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...getCorsHeaders() },
      });
    }

    if (request.method !== "POST") {
      return new Response("Méthode non autorisée", { status: 405, headers: getCorsHeaders() });
    }

    try {
      const body = await request.json();
      const groqResponse = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );
      const data = await groqResponse.json();
      return new Response(JSON.stringify(data), {
        status: groqResponse.status,
        headers: { "Content-Type": "application/json", ...getCorsHeaders() },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue." }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders() },
      });
    }
  },
};
