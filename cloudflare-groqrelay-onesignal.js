const ALLOWED_ORIGIN = "https://dnb95.github.io";

const ONE_SIGNAL_APP_ID = "d0900059-082b-458f-9bb1-8798546b8010";
const ONE_SIGNAL_API_URL = "https://api.onesignal.com/notifications?c=push";

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(),
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (origin && origin !== ALLOWED_ORIGIN) {
        return jsonResponse({ success: false, error: "Origine non autorisée." }, 403);
      }

      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(),
      });
    }

    if (url.pathname === "/onesignal") {
      if (origin !== ALLOWED_ORIGIN) {
        return jsonResponse(
          { success: false, error: "Origine non autorisée." },
          403
        );
      }

      if (request.method !== "POST") {
        return jsonResponse(
          { success: false, error: "Méthode non autorisée. Utilisez POST." },
          405
        );
      }

      if (!env.ONE_SIGNAL_APP_API_KEY) {
        return jsonResponse(
          {
            success: false,
            error: "Le secret ONE_SIGNAL_APP_API_KEY est introuvable dans Cloudflare.",
          },
          500
        );
      }

      try {
        const body = await request.json();

        const appId = String(body?.app_id || ONE_SIGNAL_APP_ID);
        const title = String(body?.title || "Nouvelle notification").trim();
        const message = String(body?.body || "").trim();
        const notificationUrl = String(
          body?.url || "https://dnb95.github.io/home/"
        ).trim();

        if (appId !== ONE_SIGNAL_APP_ID) {
          return jsonResponse(
            { success: false, error: "OneSignal App ID invalide." },
            403
          );
        }

        if (!message) {
          return jsonResponse(
            { success: false, error: "Le message de notification est obligatoire." },
            400
          );
        }


        const oneSignalPayload = {
          app_id: ONE_SIGNAL_APP_ID,
          included_segments: ["Subscribed Users"],
          target_channel: "push",
          headings: {
            fr: title,
            en: title,
          },
          contents: {
            fr: message,
            en: message,
          },
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
          responseData = JSON.parse(responseText);
        } catch {
          responseData = { raw: responseText };
        }

        if (!oneSignalResponse.ok) {
          return jsonResponse(
            {
              success: false,
              error:
                responseData?.errors ||
                responseData?.message ||
                "Erreur lors de l'envoi via OneSignal.",
            },
            502
          );
        }

        return jsonResponse({
          success: true,
          sent: 1,
          targeted: "Subscribed Users",
          oneSignalId: responseData?.id || null,
        });
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error: error instanceof Error ? error.message : "Erreur inconnue.",
          },
          500
        );
      }
    }

    if (origin !== ALLOWED_ORIGIN) {
      return new Response(
        JSON.stringify({ error: "Accès refusé : Origine non autorisée." }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(),
          },
        }
      );
    }

    if (request.method !== "POST") {
      return new Response("Méthode non autorisée", {
        status: 405,
        headers: getCorsHeaders(),
      });
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
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(),
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : "Erreur inconnue.",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(),
          },
        }
      );
    }
  },
};
