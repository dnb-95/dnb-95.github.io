const ALLOWED_ORIGIN = "https://dnb95.github.io";
const ONE_SIGNAL_APP_ID = "d0900059-082b-458f-9bb1-8798546b8010";
const ONE_SIGNAL_API_URL = "https://api.onesignal.com/notifications?c=push";
const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

function getCorsHeaders(origin) {
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

function jsonResponse(data, status = 200, origin = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: getCorsHeaders(origin),
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      if (origin && origin !== ALLOWED_ORIGIN) {
        return jsonResponse({ success: false, error: "Origine non autorisée." }, 403, origin);
      }
      return jsonResponse({
        success: true,
        service: "dnb-groq-relay",
        status: "ok",
        groqKeyConfigured: Boolean(env?.GROQ_API_KEY),
        oneSignalKeyConfigured: Boolean(env?.ONE_SIGNAL_APP_API_KEY),
        routes: ["/", "/health", "/onesignal"],
      }, 200, origin);
    }

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) {
        return jsonResponse({ success: false, error: "Origine non autorisée." }, 403, origin);
      }
      return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
    }

    if (url.pathname === "/onesignal") {
      if (origin !== ALLOWED_ORIGIN) {
        return jsonResponse({ success: false, error: "Origine non autorisée." }, 403, origin);
      }

      if (request.method !== "POST") {
        return jsonResponse({ success: false, error: "Méthode non autorisée. Utilisez POST." }, 405, origin);
      }

      if (!env?.ONE_SIGNAL_APP_API_KEY) {
        return jsonResponse({
          success: false,
          error: "Le secret ONE_SIGNAL_APP_API_KEY est introuvable dans Cloudflare.",
        }, 500, origin);
      }

      try {
        const body = await request.json();
        const appId = String(body?.app_id || ONE_SIGNAL_APP_ID);
        const title = String(body?.title || "Nouvelle notification").trim();
        const message = String(body?.body || "").trim();
        const notificationUrl = String(body?.url || "https://dnb95.github.io/").trim();

        if (appId !== ONE_SIGNAL_APP_ID) {
          return jsonResponse({ success: false, error: "OneSignal App ID invalide." }, 403, origin);
        }
        if (!message) {
          return jsonResponse({ success: false, error: "Le message de notification est obligatoire." }, 400, origin);
        }

        const oneSignalPayload = {
          app_id: ONE_SIGNAL_APP_ID,
          included_segments: ["Subscribed Users"],
          target_channel: "push",
          headings: { fr: title, en: title },
          contents: { fr: message, en: message },
          url: notificationUrl,
        };

        const oneSignalResponse = await fetch(ONE_SIGNAL_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Key ${env.ONE_SIGNAL_APP_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(oneSignalPayload),
        });

        const responseText = await oneSignalResponse.text();
        let responseData;
        try {
          responseData = responseText ? JSON.parse(responseText) : {};
        } catch {
          responseData = { message: "Réponse non JSON reçue de OneSignal." };
        }

        if (!oneSignalResponse.ok) {
          return jsonResponse({
            success: false,
            error: responseData?.errors || responseData?.message || "Erreur lors de l'envoi via OneSignal.",
          }, 502, origin);
        }

        return jsonResponse({
          success: true,
          sent: 1,
          targeted: "Subscribed Users",
          oneSignalId: responseData?.id || null,
        }, 200, origin);
      } catch (error) {
        return jsonResponse({
          success: false,
          error: error instanceof Error ? error.message : "Erreur inconnue.",
        }, 500, origin);
      }
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
