const ALLOWED_ORIGIN = "https://dnb95.github.io";
const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

function responseHeaders(origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };

  if (origin === ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Accept";
    headers["Access-Control-Max-Age"] = "86400";
  }

  return headers;
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders(origin),
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    // Endpoint de santé : ouvrir l'adresse du Worker dans le navigateur doit
    // afficher du JSON et confirmer si le secret Groq est configuré.
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      if (origin && origin !== ALLOWED_ORIGIN) {
        return jsonResponse({ success: false, error: "Origine non autorisée." }, 403, origin);
      }

      return jsonResponse({
        success: true,
        service: "dnb-groq-relay",
        status: "ok",
        groqKeyConfigured: Boolean(env?.GROQ_API_KEY),
        endpoint: "/",
      }, 200, origin);
    }

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) {
        return jsonResponse({ success: false, error: "Origine non autorisée." }, 403, origin);
      }
      return new Response(null, { status: 204, headers: responseHeaders(origin) });
    }

    if (origin !== ALLOWED_ORIGIN) {
      return jsonResponse({ success: false, error: "Accès refusé : origine non autorisée." }, 403, origin);
    }

    if (url.pathname !== "/" && url.pathname !== "/v1/chat/completions") {
      return jsonResponse({ success: false, error: "Route inconnue sur le relais Groq." }, 404, origin);
    }

    if (request.method !== "POST") {
      return jsonResponse({ success: false, error: "Méthode non autorisée. Utilisez POST." }, 405, origin);
    }

    if (!env?.GROQ_API_KEY) {
      return jsonResponse({
        success: false,
        error: "Le secret GROQ_API_KEY est absent de la configuration du Worker Cloudflare.",
      }, 500, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ success: false, error: "Le corps de la requête doit être un JSON valide." }, 400, origin);
    }

    if (!payload || typeof payload !== "object" || !Array.isArray(payload.messages) || !payload.model) {
      return jsonResponse({ success: false, error: "Requête Groq incomplète : model et messages sont requis." }, 400, origin);
    }

    try {
      const groqResponse = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const upstreamText = await groqResponse.text();
      let upstreamData;
      try {
        upstreamData = upstreamText ? JSON.parse(upstreamText) : {};
      } catch {
        return jsonResponse({
          success: false,
          error: "Le fournisseur IA a renvoyé une réponse non JSON.",
          upstreamStatus: groqResponse.status,
        }, 502, origin);
      }

      return jsonResponse(upstreamData, groqResponse.status, origin);
    } catch (error) {
      return jsonResponse({
        success: false,
        error: error instanceof Error ? error.message : "Erreur de connexion au fournisseur IA.",
      }, 502, origin);
    }
  },
};
