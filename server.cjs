const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const distRoot = path.join(root, "dist");
const progressFile = path.join(root, "progress.local.json");
loadEnv(path.join(root, ".env.local"));

const port = Number(process.env.PORT || 8787);
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const fallbackModels = (process.env.GEMINI_FALLBACK_MODELS || "gemini-3-flash-preview,gemini-2.5-flash,gemini-flash-latest")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const apiKey = process.env.GEMINI_API_KEY || "";

const axes = {
  epistemologia: { label: "Epistemología", guide: "conocimiento", short: "Conocimiento" },
  ontologia: { label: "Ontología", guide: "realidad / ser", short: "Ser" },
  antropologia: { label: "Antropología", guide: "ser humano", short: "Humano" },
  "etica-politica": { label: "Ética-política", guide: "vida buena / sociedad", short: "Sociedad" },
};

const unitDefs = [
  {
    id: "u1",
    day: "Día 1",
    title: "Platón + Aristóteles",
    hook: "Ideas contra sustancias. Si esto cae, tienes media comparación hecha.",
    authorIds: ["platon", "aristoteles"],
    comparisonIds: ["platon_aristoteles"],
    accent: "#1f9d63",
  },
  {
    id: "u2",
    day: "Día 1",
    title: "Aquino + Descartes",
    hook: "Fe y razón frente a certeza absoluta. Dos formas de buscar fundamento.",
    authorIds: ["aquino", "descartes"],
    comparisonIds: ["aristoteles_aquino"],
    accent: "#2b7be4",
  },
  {
    id: "u3",
    day: "Día 1",
    title: "Hume + Kant",
    hook: "Experiencia, hábito y el sujeto que ordena lo que conoce.",
    authorIds: ["hume", "kant"],
    comparisonIds: ["descartes_hume"],
    accent: "#0d8b93",
  },
  {
    id: "u4",
    day: "Día 1",
    title: "Marx + Nietzsche + Ortega",
    hook: "Crítica social, creación de valores y vida situada.",
    authorIds: ["marx", "nietzsche", "ortega"],
    comparisonIds: ["marx_platon", "nietzsche_ortega"],
    accent: "#7d54c7",
  },
  {
    id: "u5",
    day: "Día 2",
    title: "Conceptos mezclados",
    hook: "Evita reconocer por orden: ahora salen todos intercalados.",
    authorIds: ["platon", "aristoteles", "aquino", "descartes", "hume", "kant", "marx", "nietzsche", "ortega"],
    comparisonIds: [],
    accent: "#f2b71b",
  },
  {
    id: "u6",
    day: "Día 2",
    title: "Comparaciones por ejes",
    hook: "Epistemología, ontología, antropología y ética-política sin mezclar conceptos.",
    authorIds: ["platon", "aristoteles", "aquino", "descartes", "hume", "kant", "marx", "nietzsche", "ortega"],
    comparisonIds: ["platon_aristoteles", "aristoteles_aquino", "descartes_hume", "marx_platon", "nietzsche_ortega"],
    accent: "#2584d8",
  },
  {
    id: "u7",
    day: "Día 2",
    title: "Errores inteligentes",
    hook: "Lo fallado vuelve pronto para cortar olvidos antes del examen.",
    authorIds: ["platon", "aristoteles", "aquino", "descartes", "hume", "kant", "marx", "nietzsche", "ortega"],
    comparisonIds: ["platon_aristoteles", "aristoteles_aquino", "descartes_hume", "marx_platon", "nietzsche_ortega"],
    accent: "#fb6f5f",
    review: true,
  },
  {
    id: "u8",
    day: "Día 2",
    title: "Final Boss PAU",
    hook: "Simulacro corto: concepto, comparación y mini-redacción corregida por IA.",
    authorIds: ["platon", "aristoteles", "aquino", "descartes", "hume", "kant", "marx", "nietzsche", "ortega"],
    comparisonIds: ["platon_aristoteles", "aristoteles_aquino", "descartes_hume", "marx_platon", "nietzsche_ortega"],
    accent: "#101d2c",
    final: true,
  },
];

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/status") {
      return json(res, 200, { ai: Boolean(apiKey), model, fallbackModels });
    }
    if (req.method === "GET" && url.pathname === "/api/content") {
      const data = loadPauData();
      return json(res, 200, { ...data, axes, lessonPlan: buildLessonPlan(data), source: "pau_data.json" });
    }
    if (req.method === "GET" && url.pathname === "/api/progress") {
      return json(res, 200, loadProgress());
    }
    if (req.method === "POST" && url.pathname === "/api/progress") {
      const body = await readJson(req);
      saveProgress(body);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/evaluate") {
      const body = await readJson(req);
      if (!apiKey) return json(res, 200, fallbackEvaluate(body));
      try {
        return json(res, 200, await evaluateWithGemini(body));
      } catch (error) {
        const fallback = fallbackEvaluate(body);
        return json(res, 200, { ...fallback, ai: false, error: String(error.message || error).slice(0, 260) });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/generate") {
      const body = await readJson(req);
      if (!apiKey) return json(res, 200, { ai: false, items: localGenerate(body) });
      try {
        return json(res, 200, await generateWithGemini(body));
      } catch (error) {
        return json(res, 200, { ai: false, items: localGenerate(body), error: String(error.message || error).slice(0, 260) });
      }
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    return json(res, 500, { error: error.message || String(error), ai: false });
  }
});

const host = process.env.HOST || "127.0.0.1";

server.listen(port, host, () => {
  console.log(`FiloPAU Quest: http://${host}:${port}`);
  console.log(apiKey ? `Gemini proxy activo (${model})` : "Gemini sin configurar: usando fallback local");
});

function serveStatic(urlPath, res) {
  const safePath = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  if (safePath.includes("..") || path.basename(safePath).startsWith(".env")) return text(res, 403, "Forbidden");

  const candidates = [
    path.normalize(path.join(distRoot, safePath)),
    path.normalize(path.join(root, safePath)),
  ];

  for (const file of candidates) {
    const base = file.startsWith(distRoot) ? distRoot : root;
    if (!file.startsWith(base)) continue;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return sendFile(file, res);
  }

  const indexFile = path.join(distRoot, "index.html");
  if (fs.existsSync(indexFile)) return sendFile(indexFile, res);
  return sendFile(path.join(root, "index.html"), res);
}

function sendFile(file, res) {
  fs.readFile(file, (err, data) => {
    if (err) return text(res, 404, "Not found");
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": file.includes(`${path.sep}dist${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-store",
    });
    res.end(data);
  });
}

function loadPauData() {
  const jsonFile = path.join(root, "pau_data.json");
  const fallbackFile = path.join(root, "data.js");
  if (fs.existsSync(jsonFile)) return cleanObject(JSON.parse(fs.readFileSync(jsonFile, "utf8")));
  const raw = fs.readFileSync(fallbackFile, "utf8").replace(/^window\.PAU_DATA\s*=\s*/, "").replace(/;\s*$/, "");
  return cleanObject(JSON.parse(raw));
}

function loadProgress() {
  if (!fs.existsSync(progressFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(progressFile, "utf8"));
  } catch {
    return {};
  }
}

function saveProgress(progress) {
  fs.writeFileSync(progressFile, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
}

function buildLessonPlan(data) {
  const concepts = getConceptRows(data);
  const comparisons = data.comparisons || [];
  return unitDefs.map((unit, index) => {
    const unitAuthors = (data.authors || []).filter((author) => unit.authorIds.includes(author.id));
    const unitConcepts = concepts.filter((item) => unit.authorIds.includes(item.authorId));
    const unitComparisons = comparisons.filter((item) => unit.comparisonIds.includes(item.id));
    const mixedConcepts = unit.id === "u5" || unit.id === "u7" || unit.id === "u8" ? concepts : unitConcepts;
    const comparisonPool = unit.id === "u6" || unit.id === "u7" || unit.id === "u8" ? comparisons : unitComparisons;
    const lessons = [
      makeLearnLesson(unit, unitAuthors, mixedConcepts, index),
      makeLesson(unit, "mapa", "Calentamiento", "flash", mixedConcepts, comparisonPool, 0),
      makeLesson(unit, "conceptos", "Conceptos clave", "quiz", mixedConcepts, comparisonPool, 1),
      makeLesson(unit, "memoria", "Memoria activa", "cloze", mixedConcepts, comparisonPool, 2),
      comparisonPool.length
        ? makeLesson(unit, "ejes", "Comparación por ejes", "comparison", mixedConcepts, comparisonPool, 3)
        : makeLesson(unit, "autores", "¿De quién es?", "author", mixedConcepts, comparisonPool, 3),
      makeBossLesson(unit, mixedConcepts, comparisonPool),
    ];
    return {
      ...unit,
      order: index + 1,
      lessons,
      estimate: unit.final ? "15 min" : "7 min",
      conceptCount: mixedConcepts.length,
      comparisonCount: comparisonPool.length,
    };
  });
}

function getConceptRows(data) {
  return (data.authors || []).flatMap((author) =>
    (author.concepts || []).map(([term, definition], index) => ({
      id: `${author.id}_${slug(term)}_${index}`,
      authorId: author.id,
      authorName: author.name,
      authorColor: author.color,
      term,
      definition,
      thesis: author.examThesis,
    })),
  );
}

function makeLearnLesson(unit, authors, concepts, salt) {
  return {
    id: `${unit.id}_learn`,
    unitId: unit.id,
    title: "Aprender",
    kind: "learn",
    xp: 35,
    questions: buildLearnQuestions(unit, authors, concepts, salt),
  };
}

function makeLesson(unit, suffix, title, kind, concepts, comparisons, salt) {
  return {
    id: `${unit.id}_${suffix}`,
    unitId: unit.id,
    title,
    kind,
    xp: kind === "flash" ? 30 : 50,
    questions: buildQuestions(kind, concepts, comparisons, unit, salt),
  };
}

function buildLearnQuestions(unit, authors, concepts, salt) {
  const globalReview = unit.id === "u5" || unit.id === "u7" || unit.id === "u8";
  const questions = [];
  const globalCaps = new Map();

  if (globalReview) {
    const spread = takeSpread(concepts, 12, salt + 20);
    for (const concept of spread) {
      globalCaps.set(concept.authorId, [...(globalCaps.get(concept.authorId) || []), concept]);
    }
  }

  for (const author of authors) {
    const authorConcepts = globalReview
      ? globalCaps.get(author.id) || []
      : concepts.filter((concept) => concept.authorId === author.id).slice(0, 4);
    if (!authorConcepts.length) continue;

    questions.push({
      id: `learn_intro_${unit.id}_${author.id}`,
      type: "learn",
      variant: "author",
      scored: false,
      authorName: author.name,
      school: author.school,
      color: author.color,
      prompt: author.examThesis,
      tips: author.learn || [],
      explain: "Lee la tesis y pasa a los conceptos.",
    });

    for (const chunk of chunkItems(authorConcepts, 3)) {
      chunk.forEach((concept, chunkIndex) => {
        questions.push({
          id: `learn_${concept.id}`,
          type: "learn",
          variant: "concept",
          scored: false,
          authorName: author.name,
          color: author.color,
          prompt: concept.term,
          answer: concept.definition,
          context: author.examThesis,
          tip: author.learn?.[chunkIndex % Math.max(1, author.learn.length)],
          explain: `${concept.term}: ${concept.definition}`,
          source: concept,
        });
      });

      const checkConcept = chunk[chunk.length - 1];
      questions.push(makeLearnCheck(checkConcept, concepts, questions.length + salt));
    }
  }

  return questions;
}

function makeLearnCheck(concept, pool, salt) {
  const distractors = shuffle(
    pool.filter((item) => item.id !== concept.id && item.authorId === concept.authorId).map((item) => item.term),
    salt,
  ).slice(0, 3);
  const fallbackDistractors = shuffle(
    pool.filter((item) => item.id !== concept.id && !distractors.includes(item.term)).map((item) => item.term),
    salt + 10,
  ).slice(0, 3 - distractors.length);
  return {
    id: `learn_check_${concept.id}`,
    type: "learn-check",
    prompt: `¿Qué concepto de ${concept.authorName} corresponde a esta definición?`,
    definition: concept.definition,
    answer: concept.term,
    options: shuffle([concept.term, ...distractors, ...fallbackDistractors], salt + 30),
    explain: `${concept.term}: ${concept.definition}`,
    source: concept,
  };
}

function makeBossLesson(unit, concepts, comparisons) {
  const sourceConcepts = takeSpread(concepts, unit.final ? 12 : 6, 6);
  const sourceComparison = comparisons[unit.order % Math.max(1, comparisons.length)] || comparisons[0];
  const expected = buildBossExpected(unit, sourceConcepts, sourceComparison);
  return {
    id: `${unit.id}_boss`,
    unitId: unit.id,
    title: unit.final ? "Final Boss PAU" : "Boss escrito",
    kind: "boss",
    xp: unit.final ? 120 : 80,
    questions: [
      {
        id: `${unit.id}_boss_q`,
        type: "boss",
        prompt: unit.final
          ? "Redacta una respuesta PAU corta: define un concepto clave y compara un eje entre dos autores."
          : `Explica lo esencial de ${unit.title} con vocabulario PAU.`,
        expected,
        sourcePack: { unit: unit.title, concepts: sourceConcepts, comparison: sourceComparison || null },
      },
    ],
  };
}

function buildQuestions(kind, concepts, comparisons, unit, salt) {
  if (kind === "comparison") return buildComparisonQuestions(comparisons, unit, salt);
  if (kind === "author") return buildAuthorQuestions(concepts, salt);
  if (kind === "flash") {
    return takeSpread(concepts, 5, salt).map((concept) => ({
      id: `flash_${concept.id}`,
      type: "flash",
      prompt: concept.term,
      answer: concept.definition,
      meta: concept.authorName,
      source: concept,
    }));
  }
  if (kind === "cloze") return takeSpread(concepts, 6, salt + 2).map(makeClozeQuestion);
  return takeSpread(concepts, 7, salt + 1).map((concept, index) => makeConceptQuestion(concept, concepts, index + salt));
}

function buildComparisonQuestions(comparisons, unit, salt) {
  const questions = [];
  for (const comparison of comparisons) {
    for (const axisKey of Object.keys(axes)) {
      const axis = comparison.axes && comparison.axes[axisKey];
      if (!axis) continue;
      questions.push({
        id: `cmp_${comparison.id}_${axisKey}`,
        type: "comparison",
        prompt: `En ${comparison.title}, ¿qué eje relaciona estas ideas?`,
        snippet: `${axis.first} ${axis.second}`,
        answer: axisKey,
        options: shuffle(Object.keys(axes), salt + questions.length).map((key) => ({
          value: key,
          label: `${axes[key].label} (${axes[key].guide})`,
        })),
        source: { comparison, axisKey, axis },
      });
    }
  }
  return takeSpread(questions, unit.final ? 8 : 6, salt);
}

function buildAuthorQuestions(concepts, salt) {
  const authorNames = [...new Set(concepts.map((item) => item.authorName))];
  return takeSpread(concepts, 7, salt).map((concept, index) => ({
    id: `author_${concept.id}`,
    type: "mcq",
    prompt: `¿Qué autor necesitas citar si aparece "${concept.term}"?`,
    answer: concept.authorName,
    options: shuffle([concept.authorName, ...authorNames.filter((name) => name !== concept.authorName)], index).slice(0, 4),
    explain: concept.definition,
    source: concept,
  }));
}

function makeConceptQuestion(concept, pool, salt) {
  const distractors = shuffle(
    pool.filter((item) => item.id !== concept.id).map((item) => item.definition),
    salt,
  ).slice(0, 3);
  return {
    id: `concept_${concept.id}`,
    type: "mcq",
    prompt: `¿Qué significa "${concept.term}" en ${concept.authorName}?`,
    answer: concept.definition,
    options: shuffle([concept.definition, ...distractors], salt + 8),
    explain: concept.definition,
    source: concept,
  };
}

function makeClozeQuestion(concept) {
  return {
    id: `cloze_${concept.id}`,
    type: "cloze",
    prompt: `En ${concept.authorName}, ¿qué concepto corresponde a esta definición? ${concept.definition}`,
    answer: concept.term,
    accepted: [concept.term],
    explain: `${concept.term}: ${concept.definition}`,
    source: concept,
  };
}

function buildBossExpected(unit, concepts, comparison) {
  const conceptLines = concepts.slice(0, 6).map((item) => `${item.term}: ${item.definition}`).join("\n");
  const axisLines = comparison
    ? Object.entries(comparison.axes || {})
        .map(([key, axis]) => `${axes[key] ? axes[key].label : key}: ${axis.first} ${axis.second}`)
        .join("\n")
    : "";
  return `${unit.title}\n${conceptLines}${axisLines ? `\n${comparison.title}\n${axisLines}` : ""}`;
}

async function evaluateWithGemini(body) {
  const prompt = `
Eres un corrector PAU de Filosofia para un estudiante con TDA. Corrige SOLO usando la fuente dada.
No inventes datos externos. Si falta algo, dilo de forma breve y accionable.
Evalua semanticamente: acepta sinonimos, reformulaciones correctas y explicaciones equivalentes.
No puntues por coincidencia literal de palabras clave. Puntua por comprension conceptual, precision, relaciones causales y ausencia de errores.
Se generoso si la idea central esta bien. El objetivo es aprender, no castigar.
No bajes de 70 si la respuesta expresa correctamente la idea nuclear aunque falten detalles secundarios.
No bajes de 60 si hay una intuicion reconocible y no contiene errores graves.
Tono de entrenador: directo, util y motivador.

Pregunta: ${body.prompt}
Respuesta esperada desde apuntes: ${body.expected}
Respuesta del alumno: ${body.answer}
Fuente estructurada: ${JSON.stringify(body.sourcePack)}

Devuelve JSON estricto:
{
  "score": numero 0-100,
  "verdict": "una frase corta",
  "strengths": ["max 3 aciertos concretos"],
  "missing": ["max 4 ideas para subir nota"],
  "correction": "respuesta modelo breve basada solo en los apuntes",
  "nextQuestion": "micro-pregunta siguiente para fijar memoria",
  "ai": true
}`;
  const parsed = await geminiJson(prompt, 0.12);
  return { ...parsed, ai: true };
}

async function generateWithGemini(body) {
  const prompt = `
Genera material de estudio PAU SOLO desde esta fuente. No anadas informacion externa.
Tipo: ${body.kind || "flashcards"}
Foco: ${body.focus || "general"}
Cantidad: ${Math.min(Number(body.count || 6), 12)}
Fuente: ${JSON.stringify(body.sourcePack)}

Devuelve JSON estricto:
{
  "items": [
    {"question":"...", "answer":"...", "type":"recall|comparison|cloze"}
  ],
  "ai": true
}`;
  const parsed = await geminiJson(prompt, 0.25);
  return { ...parsed, ai: true };
}

async function geminiJson(prompt, temperature) {
  const candidates = [model, ...fallbackModels.filter((item) => item !== model)];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const parsed = await callGeminiModel(candidate, prompt, temperature);
      return { ...parsed, modelUsed: candidate };
    } catch (error) {
      lastError = error;
      const message = String(error.message || error);
      const retryable = message.includes("503") || message.includes("UNAVAILABLE") || message.includes("429") || message.includes("RESOURCE_EXHAUSTED");
      if (!retryable) throw error;
    }
  }
  throw lastError || new Error("Gemini unavailable");
}

async function callGeminiModel(modelName, prompt, temperature) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: "application/json" },
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Gemini ${response.status} (${modelName}): ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const out = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "{}";
  return JSON.parse(out);
}

function fallbackEvaluate(body) {
  const expected = normalize(body.expected || "");
  const answer = normalize(body.answer || "");
  const keys = expected
    .split(/\s+/)
    .filter((word) => word.length > 5 && !["porque", "mediante", "aquello", "realidad", "humano", "fuente"].includes(word))
    .slice(0, 18);
  const hits = keys.filter((word) => answer.includes(word));
  const ratio = hits.length / Math.max(1, keys.length);
  const score = Math.max(answer.length > 40 ? 45 : 20, Math.round(ratio * 100));
  return {
    score,
    verdict: "Corrección local: útil para practicar; la IA no respondió ahora.",
    strengths: hits.slice(0, 3),
    missing: keys.filter((word) => !answer.includes(word)).slice(0, 4),
    correction: body.expected,
    nextQuestion: "Repítelo con una tesis y dos conceptos técnicos.",
    ai: false,
  };
}

function localGenerate(body) {
  const pack = body.sourcePack || {};
  return (pack.concepts || []).slice(0, Number(body.count || 6)).map((concept) => ({
    question: `Define ${concept.term}`,
    answer: concept.definition,
    type: "recall",
  }));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanObject(item)]));
  }
  return cleanText(value);
}

function cleanText(value) {
  if (typeof value !== "string") return value;
  const replacements = [
    ["Ã¡", "á"],
    ["Ã©", "é"],
    ["Ã­", "í"],
    ["Ã³", "ó"],
    ["Ãº", "ú"],
    ["Ã±", "ñ"],
    ["Â¿", "¿"],
    ["Â¡", "¡"],
  ];
  return replacements.reduce((out, [from, to]) => out.replaceAll(from, to), value);
}

function normalize(value) {
  return cleanText(String(value))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function takeSpread(items, count, salt = 0) {
  if (!items.length) return [];
  const shuffled = shuffle(items, salt);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function shuffle(items, salt = 0) {
  return [...items]
    .map((item, index) => ({ item, score: pseudoRandom(`${index}_${salt}_${JSON.stringify(item).slice(0, 40)}`) }))
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.item);
}

function pseudoRandom(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function slug(value) {
  return normalize(value).replace(/\s+/g, "-").slice(0, 36);
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function text(res, status, payload) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(payload);
}
