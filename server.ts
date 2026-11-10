import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Shared Gemini client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY n'est pas configurée dans les variables d'environnement.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// API: Generate Exercise
app.post('/api/gemini/generate-exercise', async (req, res) => {
  try {
    const {
      subject,
      topic,
      level,
      details,
      linkedContext,
      durationMinutes,
      mode,
      pdfFiles
    } = req.body;

    if (!subject || !topic) {
      return res.status(400).json({ error: "La matière et le thème sont obligatoires." });
    }

    const ai = getGeminiClient();

    const parts: any[] = [];

    // Add PDFs if any
    if (Array.isArray(pdfFiles) && pdfFiles.length > 0) {
      for (const pdf of pdfFiles) {
        if (pdf.base64) {
          parts.push({
            inlineData: {
              mimeType: pdf.mimeType || 'application/pdf',
              data: pdf.base64.replace(/^data:[^;]+;base64,/, ''),
            },
          });
        }
      }
    }

    const promptText = `Tu es un professeur spécialisé expérimenté de l'Éducation Nationale.
Crée un sujet d'exercice complet, authentique et rigoureux adapté aux paramètres suivants :
- Matière : ${subject}
- Chapitre / Thème : ${topic}
- Niveau du contrôle : ${level || 'Standard (type contrôle noté)'}
- Durée impartie : ${durationMinutes ? `${durationMinutes} minutes` : 'Non chronométré'}
- Mode de réponse prévu pour l'élève : ${mode === 'papier' ? 'Sur copie papier manuscrite avec téléversement de photos' : 'Sur clavier numérique'}
- Détails et consignes supplémentaires de l'élève : ${details || 'Aucune consigne supplémentaire'}
${linkedContext ? `- Documents ou cours liés likés par l'élève :\n${linkedContext}\n` : ''}
${parts.length > 0 ? `Un ou plusieurs documents de cours / PDF authentiques sont fournis en pièce jointe ci-dessus. Inspire-toi directement des notions, méthodes et exercices réels de ces documents pour créer des exercices concrets.` : ''}

Consignes impératives :
1. Crée entre 3 et 6 questions progressives et variées (calculs, raisonnement, définitions précises, analyse de texte ou de document selon la matière).
2. Le barème total de l'exercice DOIT être strictement sur 20 points (la somme des points de chaque question doit faire exactement 20).
3. Rédige des questions stimulantes, sans ambiguïté.
4. Pour chaque question, fournis des consignes claires, le nombre de points attribués, et un barème / critères d'évaluation précis pour la future correction.

Réponds STRICTEMENT au format JSON avec cette structure :
{
  "title": "Titre du contrôle / devoir",
  "subject": "${subject}",
  "topic": "${topic}",
  "level": "${level || 'Standard'}",
  "durationMinutes": ${Number(durationMinutes) || 60},
  "mode": "${mode || 'clavier'}",
  "instructions": "Consignes générales pour l'élève (temps, calculatrice autorisée ou non, rédaction)",
  "totalPoints": 20,
  "questions": [
    {
      "id": 1,
      "questionNumber": 1,
      "title": "Sous-titre ou thème de la question",
      "text": "Énoncé complet et détaillé de la question",
      "points": 4,
      "hint": "Indice méthodologique facultatif",
      "rubric": "Critères d'évaluation précis et répartition des points pour le professeur",
      "expectedAnswerSnippet": "Synthèse de la solution attendue"
    }
  ]
}`;

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts },
      config: {
        systemInstruction: "Tu es un professeur spécialisé rigoureux et bienveillant de l'Éducation Nationale française. Génère exclusivement un JSON valide correspondant au schéma demandé, sans balises markdown superflues.",
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text || '{}';
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        data = JSON.parse(match[0]);
      } else {
        throw new Error("Impossible d'extraire le format JSON généré.");
      }
    }

    return res.json(data);
  } catch (error: any) {
    console.error("Erreur generate-exercise:", error);
    return res.status(500).json({ error: error.message || "Erreur lors de la génération de l'exercice." });
  }
});

// API: Grade Exercise (Strict Professor)
app.post('/api/gemini/grade-exercise', async (req, res) => {
  try {
    const {
      exercise,
      mode,
      textAnswers,
      paperPhotos,
      selfAssessment,
    } = req.body;

    if (!exercise || !exercise.questions) {
      return res.status(400).json({ error: "Sujet d'exercice manquant pour la correction." });
    }

    const ai = getGeminiClient();
    const parts: any[] = [];

    // Add paper photos if any
    if (Array.isArray(paperPhotos) && paperPhotos.length > 0) {
      for (const photo of paperPhotos) {
        if (photo.base64) {
          parts.push({
            inlineData: {
              mimeType: photo.mimeType || 'image/jpeg',
              data: photo.base64.replace(/^data:[^;]+;base64,/, ''),
            },
          });
        }
      }
    }

    const promptText = `Tu es un professeur spécialisé réputé pour sa neutralité, son impartialité et sa sévérité mesurée mais constructive (style jury d'examen officiel français).
Tu dois corriger la copie de l'élève ci-dessous avec une grande minutie. Ne donne AUCUN cadeau : pénalise le manque de rigueur, le défaut de justification, le vocabulaire approximatif ou les erreurs de calcul, tout en récompensant fidèlement les bonnes démarches.

=== SUJET D'ORIGINE DE L'EXERCICE ===
Matière : ${exercise.subject}
Thème : ${exercise.topic}
Niveau : ${exercise.level}
Consignes initiales : ${exercise.instructions || 'Standard'}
Barème total : 20 points
Questions de l'exercice :
${JSON.stringify(exercise.questions, null, 2)}

=== AUTO-ÉVALUATION DE L'ÉLÈVE (AVANT CORRECTION) ===
Note que l'élève estime mériter : ${selfAssessment?.estimatedScore ?? 'Non spécifiée'}/20
Niveau de confiance ressenti : ${selfAssessment?.confidenceStars ?? '3'}/5
Ressenti / Commentaires de l'élève sur son travail : "${selfAssessment?.reflections || 'Aucun commentaire'}"

=== COPIE DE L'ÉLÈVE ===
Mode de réponse : ${mode === 'papier' ? 'Copie papier manuscrite (les photos de la copie manuscrite sont fournies en pièce jointe ci-dessus - déchiffre l\'écriture manuscrite avec soin)' : 'Réponses saisies directement au clavier'}
${mode === 'clavier' ? `Réponses écrites de l'élève :
${JSON.stringify(textAnswers || [], null, 2)}` : 'Vérifie chaque photo de copie fournie et attribue les points pour chaque question identifiée sur la feuille.'}

=== DIRECTIVES DE NOTATION DU PROFESSEUR ===
1. Analyse chaque question séparément.
2. Pour chaque question, attribue une note sur le barème de la question (ex: 3.5 / 5).
3. Rédige un commentaire précis : ce qui est bon, les erreurs exactes, ce qui manquait pour avoir le maximum.
4. Donne la correction idéale (méthode attendue, étapes complètes).
5. Calcule la note finale STRICTEMENT égale à la somme des points attribués (total sur 20).
6. Compare la note réelle obtenue avec l'auto-évaluation de l'élève : analyse s'il a été trop optimiste, trop modeste ou lucide.
7. Rédige une appréciation globale digne d'un professeur spécialisé exigeant mais formateur.

Réponds STRICTEMENT au format JSON avec cette structure :
{
  "totalScore": 13.5,
  "maxScore": 20,
  "mention": "Assez bien",
  "generalAppreciation": "Appréciation globale du professeur avec analyse du sérieux, de la méthode et de la gestion de l'épreuve.",
  "selfAssessmentCritique": "Commentaire spécifique sur l'auto-évaluation de l'élève par rapport à sa note réelle.",
  "strengths": ["Point fort 1", "Point fort 2"],
  "improvements": ["Axe de progrès 1", "Axe de progrès 2"],
  "questionEvaluations": [
    {
      "questionId": 1,
      "pointsAwarded": 3,
      "maxPoints": 4,
      "status": "partial",
      "feedback": "Commentaire détaillé sur la réponse fournie...",
      "idealSolution": "La rédaction complète et la solution parfaite attendue..."
    }
  ]
}`;

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts },
      config: {
        systemInstruction: "Tu es un professeur correcteur officiel spécialisé, neutre et exigeant. Analyse rigoureusement les réponses et renvoie un JSON valide sans texte superflu.",
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text || '{}';
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        data = JSON.parse(match[0]);
      } else {
        throw new Error("Impossible d'extraire la correction JSON générée.");
      }
    }

    return res.json(data);
  } catch (error: any) {
    console.error("Erreur grade-exercise:", error);
    return res.status(500).json({ error: error.message || "Erreur lors de la correction de l'exercice." });
  }
});

// Download routes for modified project ZIPs
app.get('/download/zip', (_req, res) => {
  const filePath = path.resolve(__dirname, 'public', 'dnb-reviz-complet.zip');
  res.download(filePath, 'dnb-reviz-complet.zip');
});

app.get('/download/modified', (_req, res) => {
  const filePath = path.resolve(__dirname, 'public', 'dnb-reviz-fichiers-modifies.zip');
  res.download(filePath, 'dnb-reviz-fichiers-modifies.zip');
});

app.use(express.static(path.resolve(__dirname, 'public')));

// Setup Vite or static serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur DnB Reviz démarré sur http://0.0.0.0:${PORT}`);
  });
}

startServer();
