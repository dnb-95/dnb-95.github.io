import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

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

function extractJsonObject(rawText: string): any {
  const trimmed = (rawText || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // continue to brace match
      }
    }
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("Impossible d'extraire le format JSON généré.");
  }
}

function getExerciseTypeInstructions(exerciseType: string, mode: string): string {
  const isPaper = mode === 'papier';
  switch (exerciseType) {
    case 'matching':
      return `FORMAT DEMANDÉ : Exercice centré sur le RELIAGE / ASSOCIATION DE NOTIONS + questions d'application.
- Inclus au moins 2 questions de type "matching" (reliage entre 4 ou 5 notions à gauche et leurs définitions/résultats/formules mélangés à droite) et 1 à 2 questions de type "open" pour justifier ou appliquer.${isPaper ? ' (L\'élève répondra sur feuille papier en recopiant les paires, donc garde les items clairs et numérotés.)' : ''}`;
    case 'graph':
      return `FORMAT DEMANDÉ : Exercice centré sur l'ANALYSE DE GRAPHIQUES ET SCHÉMAS SVG INTERACTIFS.
- Inclus au moins 2 questions de type "graph" contenant chacune un champ "svgDiagram" avec un vrai graphique/schéma SVG lisible, précis, propre (viewBox="0 0 600 340") et des "keyPoints" (points clés avec coordonnées exactes x, y dans le viewBox 0..600 x 0..340, label et explication).
- Complète par 1 à 2 questions "open" d'interprétation ou de calcul liées au schéma.`;
    case 'qcm_open':
      return `FORMAT DEMANDÉ : QCM raisonnés et questions ouvertes.
- Inclus 2 à 3 questions de type "qcm" (avec 4 choix pertinents et requiresJustification: true pour demander une brève justification) et 1 à 2 questions "open" de synthèse.`;
    case 'questions':
      return `FORMAT DEMANDÉ : Questions classiques rédigées et progressives.
- Utilise exclusivement le type "open" (calculs, démonstrations, définitions, analyse de documents ou rédaction selon la matière).`;
    case 'mix':
    default:
      return `FORMAT DEMANDÉ : MIX PÉDAGOGIQUE VARIÉ (4 à 5 questions combinant plusieurs formats).
- Inclus OBLIGATOIREMENT un mélange équilibré selon la matière :
  * Au moins 1 question de type "open" (question rédigée, calcul ou analyse),
  * Au moins 1 question de type "matching" (reliage / association de 4 paires notion <-> définition/formule/date/exemple),
  * Au moins 1 question de type "graph" avec un vrai schéma ou graphique SVG ("svgDiagram" viewBox="0 0 600 340" + "keyPoints" cliquables) pertinent pour la matière (courbe mathématique/physique, frise chronologique en histoire, schéma cellulaire/géologique en SVT, diagramme économique en SES, automate/arbre en NSI, schéma narratif/structure en français, etc.),
  * Et éventuellement 1 question de type "qcm" (4 options).`;
  }
}

function getGradingToneInstructions(gradingTone: string): { label: string; directive: string } {
  switch (gradingTone) {
    case 'strict':
      return {
        label: 'Sévère & Impitoyable',
        directive: `POSTURE DE CORRECTION : SÉVÈRE (aucun cadeau).
- Applique le barème de manière stricte et exigeante.
- Pénalise systématiquement tout oubli d'unité, toute notation mathématique/scientifique imprécise, toute affirmation non justifiée, toute faute de méthode ou d'orthographe technique.
- Un résultat juste sans démonstration lorsque celle-ci est attendue ne vaut au maximum que la moitié des points.`
      };
    case 'kind':
      return {
        label: 'Bienveillant (sans excès)',
        directive: `POSTURE DE CORRECTION : BIENVEILLANT ET CONSTRUCTIF (gentiment mais sans plus).
- Reste honnête sur la note (ne donne JAMAIS de points pour une réponse fausse ou hors-sujet), mais valorise pleinement les bonnes intuitions et la logique de raisonnement même si la formulation est maladroite.
- Tolère les petites maladresses rédactionnelles mineures tant que l'idée juste est clairement exprimée.
- Adopte un ton chaleureux, encourageant et rassurant dans les retours.`
      };
    case 'bac':
    default:
      return {
        label: 'Comme au Bac / Brevet (Officiel)',
        directive: `POSTURE DE CORRECTION : JURY D'EXAMEN OFFICIEL (BAC / BREVET).
- Sois parfaitement impartial, équilibré et fidèle aux consignes officielles de l'Éducation Nationale.
- Valorise la démarche et les étapes intermédiaires cohérentes (même si une erreur de calcul survient en cours de route, n'applique la pénalité qu'une fois).
- Exige la rigueur attendue à l'examen officiel.`
      };
  }
}

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
      exerciseType,
      gradingTone,
      pdfFiles,
      pdfExtractedText,
      pdfImages,
    } = req.body;

    if (!subject || !topic) {
      return res.status(400).json({ error: "La matière et le thème sont obligatoires." });
    }

    const ai = getGeminiClient();
    const parts: any[] = [];

    // Attach optional raw PDF files (small uploads)
    if (Array.isArray(pdfFiles) && pdfFiles.length > 0) {
      for (const pdf of pdfFiles) {
        if (pdf?.base64) {
          parts.push({
            inlineData: {
              mimeType: pdf.mimeType || 'application/pdf',
              data: String(pdf.base64).replace(/^data:[^;]+;base64,/, ''),
            },
          });
        }
      }
    }

    // Attach rendered PDF page images if extracted client-side
    if (Array.isArray(pdfImages) && pdfImages.length > 0) {
      for (const img of pdfImages.slice(0, 4)) {
        if (img?.base64) {
          parts.push({
            inlineData: {
              mimeType: img.mimeType || 'image/jpeg',
              data: String(img.base64).replace(/^data:[^;]+;base64,/, ''),
            },
          });
        }
      }
    }

    const typeInstruction = getExerciseTypeInstructions(exerciseType || 'mix', mode || 'clavier');

    const promptText = `Tu es un professeur spécialisé expérimenté de l'Éducation Nationale française.
Crée un sujet d'exercice complet, authentique et rigoureux adapté aux paramètres suivants :
- Matière : ${subject}
- Chapitre / Thème : ${topic}
- Niveau du contrôle : ${level || 'Standard (type contrôle noté)'}
- Durée impartie : ${durationMinutes ? `${durationMinutes} minutes` : 'Non chronométré'}
- Mode de réponse prévu pour l'élève : ${mode === 'papier' ? 'Sur copie papier manuscrite avec téléversement de photos' : 'Sur clavier numérique / interface interactive'}
- Niveau de correction prévu : ${getGradingToneInstructions(gradingTone || 'bac').label}
- Détails et consignes supplémentaires de l'élève : ${details || 'Aucune consigne supplémentaire'}
${linkedContext ? `- Documents ou cours liés likés par l'élève :\n${linkedContext}\n` : ''}
${pdfExtractedText ? `- EXTRAITS DES DOCUMENTS DE COURS FOURNIS :\n${String(pdfExtractedText).slice(0, 26000)}\n` : ''}

${typeInstruction}

CONSIGNES IMPÉRATIVES DE QUALITÉ :
1. Crée entre 3 et 6 questions progressives.
2. Le barème total de l'exercice DOIT être strictement égal à 20 points (la somme numérique exacte de questions[].points = 20).
3. RENDU MATHÉMATIQUE / SCIENTIFIQUE (LaTeX) :
   - Formate TOUTES les expressions mathématiques, fractions, puissances, racines, vecteurs, formules chimiques ou équations en LaTeX avec $...$ (inline) ou $$...$$ (bloc). Exemple : $\\frac{x^2 + 1}{2}$, $\\Delta = b^2 - 4ac$, $v = \\frac{d}{t}$.
4. SCHÉMAS ET GRAPHIQUES SVG (pour toute question de type "graph") :
   - Génère un <svg viewBox="0 0 600 340" xmlns="http://www.w3.org/2000/svg"> complet, lisible, sans aucun script ni gestionnaire d'événement.
   - Dessine une grille légère (#e2e8f0), des axes gradués clairs avec flèches et labels lisibles (#334155), des courbes/formes contrastées (#4f46e5, #0ea5e9, #f59e0b, #10b981) et des textes bien placés sans chevauchement.
   - Fournis aussi "keyPoints": 3 à 5 points clés avec leurs coordonnées exactes (x entre 30 et 570, y entre 25 et 315 dans le repère viewBox 600x340), un label court (ex: "S(2 ; 5)") et un détail pédagogique ("detail") que l'élève verra au survol ! IMPORTANT : ne dévoile pas la réponse finale de la question dans "detail", donne uniquement la lecture factuelle du point sur le graphique (coordonnées ou légende).
5. RELIAGE (pour toute question de type "matching") :
   - Fournis 4 paires dans "leftItems" ([{ "id": "L1", "text": "..." }, ...]), "rightItems" ([{ "id": "R1", "text": "..." }, ...] dans un ordre MÉLANGÉ) et "correctPairs" ({ "L1": "R3", ... }).
6. QCM (pour toute question de type "qcm") :
   - Fournis "options" (tableau de 4 chaînes), "correctOptionIndex" (0 à 3) et "requiresJustification" (boolean).
7. Ne mets jamais la réponse attendue dans "text".

Réponds STRICTEMENT avec un objet JSON valide respectant ce schéma :
{
  "title": "Titre du devoir / entraînement",
  "subject": "${subject}",
  "topic": "${topic}",
  "level": "${level || 'Standard'}",
  "durationMinutes": ${Number(durationMinutes) || 0},
  "mode": "${mode || 'clavier'}",
  "exerciseType": "${exerciseType || 'mix'}",
  "gradingTone": "${gradingTone || 'bac'}",
  "instructions": "Consignes générales pour l'élève (temps, calculatrice autorisée ou non, rédaction)",
  "totalPoints": 20,
  "questions": [
    {
      "id": 1,
      "questionNumber": 1,
      "type": "open | qcm | matching | graph",
      "title": "Sous-titre de la question",
      "text": "Énoncé complet avec formules LaTeX $...$ si pertinent",
      "points": 4,
      "hint": "Indice méthodologique facultatif",
      "rubric": "Critères précis d'attribution des points (ex: 2 pts méthode, 2 pts calcul)",
      "expectedAnswerSnippet": "Synthèse de la réponse attendue",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctOptionIndex": 0,
      "requiresJustification": true,
      "leftItems": [{ "id": "L1", "text": "Élément 1" }],
      "rightItems": [{ "id": "R1", "text": "Correspondance A" }],
      "correctPairs": { "L1": "R1" },
      "svgDiagram": {
        "title": "Titre du graphique ou schéma",
        "xAxisLabel": "Axe X",
        "yAxisLabel": "Axe Y",
        "viewBox": "0 0 600 340",
        "svgMarkup": "<svg viewBox=\"0 0 600 340\" xmlns=\"http://www.w3.org/2000/svg\">...</svg>",
        "keyPoints": [
          { "id": "P1", "x": 180, "y": 140, "label": "Point A (2 ; 4)", "detail": "Ordonnée lue sur l'axe vertical : 4" }
        ]
      }
    }
  ]
}
(N'inclus les propriétés options/correctOptionIndex que pour type="qcm", leftItems/rightItems/correctPairs que pour type="matching", et svgDiagram que pour type="graph".)`;

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction: "Tu es un professeur spécialisé rigoureux de l'Éducation Nationale française. Génère exclusivement un JSON valide sans balises markdown superflues.",
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      },
    });

    let data = extractJsonObject(response.text || '{}');

    // Normalize & validate total points == 20
    if (Array.isArray(data.questions) && data.questions.length >= 1) {
      data.questions = data.questions.slice(0, 6).map((q: any, idx: number) => ({
        ...q,
        id: idx + 1,
        questionNumber: idx + 1,
        type: ['open', 'qcm', 'matching', 'graph'].includes(q.type) ? q.type : 'open',
        points: Math.max(0.5, Number(q.points) || 2),
      }));

      const sum = Number(data.questions.reduce((acc: number, q: any) => acc + q.points, 0).toFixed(2));
      if (Math.abs(sum - 20) > 0.01 && sum > 0) {
        // Scale proportionally so sum equals strictly 20.00
        let running = 0;
        data.questions = data.questions.map((q: any, idx: number) => {
          if (idx === data.questions.length - 1) {
            return { ...q, points: Number((20 - running).toFixed(2)) };
          }
          const scaled = Math.max(0.5, Math.round((q.points / sum) * 20 * 2) / 2);
          running += scaled;
          return { ...q, points: Number(scaled.toFixed(2)) };
        });
      }
      data.totalPoints = 20;
    }

    return res.json(data);
  } catch (error: any) {
    console.error("Erreur generate-exercise:", error);
    return res.status(500).json({ error: error.message || "Erreur lors de la génération de l'exercice." });
  }
});

// API: Grade Exercise (Strict / Bac / Kind Professor + Copie d'examen annotations)
app.post('/api/gemini/grade-exercise', async (req, res) => {
  try {
    const {
      exercise,
      mode,
      textAnswers,
      structuredAnswers,
      paperPhotos,
      selfAssessment,
      gradingTone,
    } = req.body;

    if (!exercise || !exercise.questions) {
      return res.status(400).json({ error: "Sujet d'exercice manquant pour la correction." });
    }

    const ai = getGeminiClient();
    const parts: any[] = [];

    if (Array.isArray(paperPhotos) && paperPhotos.length > 0) {
      for (const photo of paperPhotos.slice(0, 4)) {
        if (photo?.base64) {
          parts.push({
            inlineData: {
              mimeType: photo.mimeType || 'image/jpeg',
              data: String(photo.base64).replace(/^data:[^;]+;base64,/, ''),
            },
          });
        }
      }
    }

    const toneInfo = getGradingToneInstructions(gradingTone || exercise.gradingTone || 'bac');

    const promptText = `Tu es un professeur français chargé de corriger la copie d'un élève façon "stylo rouge sur copie d'examen".

${toneInfo.directive}

=== SUJET D'ORIGINE ===
Matière : ${exercise.subject}
Thème : ${exercise.topic}
Niveau : ${exercise.level}
Consignes : ${exercise.instructions || 'Standard'}
Barème total : 20 points
Questions :
${JSON.stringify(exercise.questions, null, 2)}

=== AUTO-ÉVALUATION DE L'ÉLÈVE ===
Note estimée par l'élève : ${selfAssessment?.estimatedScore ?? 'Non spécifiée'}/20
Confiance : ${selfAssessment?.confidenceStars ?? '3'}/5
Commentaire : "${selfAssessment?.reflections || 'Aucun commentaire'}"

=== COPIE DE L'ÉLÈVE ===
Mode de réponse : ${mode === 'papier' ? 'Copie papier manuscrite photographiée (déchiffre attentivement les images ci-dessus)' : 'Réponses saisies au clavier et interactions'}
Réponses textuelles saisies :
${JSON.stringify(textAnswers || [], null, 2)}
Réponses interactives (QCM / Reliage) :
${JSON.stringify(structuredAnswers || {}, null, 2)}

=== DIRECTIVES DE CORRECTION & ANNOTATIONS STYLO ROUGE ===
1. Évalue chaque question séparément en respectant son barème exact (maxPoints = question.points).
2. Pour chaque question :
   - Décompose la note obtenue par critère dans "criteriaBreakdown" (ex: [{"label": "Méthode & justification", "awarded": 1.5, "max": 2}, {"label": "Résultat & unités", "awarded": 1, "max": 1}]). La somme des "awarded" doit égaler "pointsAwarded", et la somme des "max" doit égaler "maxPoints".
   - Fournis "annotations": un tableau de segments découpant la réponse de l'élève (ou ce qui a été lu sur sa copie papier) afin d'afficher une correction visuelle sur feuille :
     * status: "correct" (passage juste à surligner en vert),
     * status: "error" (erreur factuelle/calcul à souligner en rouge avec "comment" court),
     * status: "imprecise" (formulation vague/unité manquante à souligner en orange avec "comment" court),
     * status: "neutral" (texte de liaison).
     Si l'élève n'a rien répondu, renvoie un seul segment { "text": "(Aucune réponse rédigée)", "status": "error", "comment": "Question non traitée" }.
   - Rédige "feedback" (commentaire stylo rouge constructif) et "idealSolution" (rédaction modèle complète, avec formules LaTeX $...$ si pertinent).
3. Calcule "totalScore" STRICTEMENT égal à la somme des "pointsAwarded" sur 20.
4. Compare avec l'auto-évaluation de l'élève dans "selfAssessmentCritique".
5. Rédige "bulletinComment": une appréciation courte (2 phrases max) façon conseil de classe / bulletin scolaire officiel, et "generalAppreciation" plus détaillée.

Réponds STRICTEMENT au format JSON avec cette structure :
{
  "totalScore": 14.5,
  "maxScore": 20,
  "mention": "Bien",
  "gradingToneUsed": "${gradingTone || exercise.gradingTone || 'bac'}",
  "bulletinComment": "Travail sérieux et méthodique, des bases solides à consolider sur la rédaction finale.",
  "generalAppreciation": "Appréciation globale détaillée du professeur...",
  "selfAssessmentCritique": "Analyse de l'écart entre ta note estimée et ta note réelle...",
  "strengths": ["Point fort 1", "Point fort 2"],
  "improvements": ["Axe de progrès 1", "Axe de progrès 2"],
  "questionEvaluations": [
    {
      "questionId": 1,
      "pointsAwarded": 3.5,
      "maxPoints": 4,
      "status": "partial",
      "criteriaBreakdown": [
        { "label": "Démarche / Raisonnement", "awarded": 2, "max": 2 },
        { "label": "Calcul & Unités", "awarded": 1.5, "max": 2 }
      ],
      "annotations": [
        { "text": "On applique le théorème de Pythagore dans le triangle ABC rectangle en A.", "status": "correct", "comment": "Hypothèse bien posée" },
        { "text": " Donc BC = 12.", "status": "imprecise", "comment": "Unité (cm) oubliée" }
      ],
      "feedback": "Bon raisonnement d'ensemble, pense à toujours indiquer l'unité.",
      "idealSolution": "Rédaction modèle complète avec LaTeX $...$"
    }
  ]
}`;

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction: "Tu es un professeur correcteur officiel français. Analyse avec minutie et renvoie uniquement le JSON demandé.",
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      },
    });

    const data = extractJsonObject(response.text || '{}');
    return res.json(data);
  } catch (error: any) {
    console.error("Erreur grade-exercise:", error);
    return res.status(500).json({ error: error.message || "Erreur lors de la correction de l'exercice." });
  }
});

// Hidden project archive route (uncompressed STORE ZIP, not linked anywhere on the UI)
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function computeCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosTimeDate(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

const ARCHIVE_EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', '.aistudio', '.next', '.cache', 'aistudio']);
const ARCHIVE_EXCLUDED_FILES = new Set(['.env', '.DS_Store', 'Thumbs.db', 'dnb95-reviz-modifie.zip']);

async function collectProjectFiles(rootDir: string, currentDir = rootDir): Promise<{ relPath: string; absPath: string; mtime: Date }[]> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const results: { relPath: string; absPath: string; mtime: Date }[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ARCHIVE_EXCLUDED_DIRS.has(entry.name)) continue;
      const sub = await collectProjectFiles(rootDir, path.join(currentDir, entry.name));
      results.push(...sub);
    } else if (entry.isFile()) {
      if (ARCHIVE_EXCLUDED_FILES.has(entry.name) || entry.name.endsWith('.log')) continue;
      const absPath = path.join(currentDir, entry.name);
      const stat = await fs.stat(absPath);
      const relPath = path.relative(rootDir, absPath).split(path.sep).join('/');
      results.push({ relPath, absPath, mtime: stat.mtime });
    }
  }
  return results;
}

function buildUncompressedZip(entries: { name: string; data: Buffer; mtime: Date }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = computeCrc32(entry.data);
    const size = entry.data.length;
    const { dosTime, dosDate } = toDosTimeDate(entry.mtime);

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);         // version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // UTF-8 filename flag
    localHeader.writeUInt16LE(0, 8);          // compression method: 0 = STORE (uncompressed)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);      // compressed size
    localHeader.writeUInt32LE(size, 22);      // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);         // extra field length

    localParts.push(localHeader, nameBuf, entry.data);

    // Central Directory File Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4);         // version made by
    centralHeader.writeUInt16LE(20, 6);         // version needed
    centralHeader.writeUInt16LE(0x0800, 8);     // UTF-8 filename flag
    centralHeader.writeUInt16LE(0, 10);         // compression method: 0 = STORE (uncompressed)
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);         // extra length
    centralHeader.writeUInt16LE(0, 32);         // comment length
    centralHeader.writeUInt16LE(0, 34);         // disk number start
    centralHeader.writeUInt16LE(0, 36);         // internal attributes
    centralHeader.writeUInt32LE(0, 38);         // external attributes
    centralHeader.writeUInt32LE(offset, 42);    // relative offset of local header

    centralParts.push(centralHeader, nameBuf);
    offset += 30 + nameBuf.length + size;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);              // EOCD signature
  eocd.writeUInt16LE(0, 4);                       // disk number
  eocd.writeUInt16LE(0, 6);                       // start disk
  eocd.writeUInt16LE(entries.length, 8);          // entries on disk
  eocd.writeUInt16LE(entries.length, 10);         // total entries
  eocd.writeUInt32LE(centralDirBuf.length, 12);   // size of central dir
  eocd.writeUInt32LE(offset, 16);                 // offset of start of central dir
  eocd.writeUInt16LE(0, 20);                      // comment length

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

app.get('/api/archive/dnb-reviz-projet.zip', async (_req, res) => {
  try {
    const fileMetaList = (await collectProjectFiles(__dirname)).sort((a, b) => a.relPath.localeCompare(b.relPath));
    const entries = await Promise.all(
      fileMetaList.map(async (f) => ({
        name: `dnb-reviz/${f.relPath}`,
        data: await fs.readFile(f.absPath),
        mtime: f.mtime,
      }))
    );
    const zipBuffer = buildUncompressedZip(entries);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="dnb-reviz-projet.zip"');
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.setHeader('Cache-Control', 'no-store');
    return res.send(zipBuffer);
  } catch (error: any) {
    console.error('Erreur génération ZIP :', error);
    return res.status(500).json({ error: error.message || "Erreur lors de la création de l'archive." });
  }
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
