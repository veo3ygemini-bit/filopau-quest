import { cloneAndClean, normalizeText } from "./text.js";

export const AXES = {
  epistemologia: {
    label: "Epistemología",
    guide: "conocimiento",
    short: "Conocimiento",
  },
  ontologia: {
    label: "Ontología",
    guide: "realidad / ser",
    short: "Ser",
  },
  antropologia: {
    label: "Antropología",
    guide: "ser humano",
    short: "Humano",
  },
  "etica-politica": {
    label: "Ética-política",
    guide: "vida buena / sociedad",
    short: "Sociedad",
  },
};

const UNIT_DEFS = [
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
    hook: "Epistemología, ontología, antropología y ética-política sin mezclar churras.",
    authorIds: ["platon", "aristoteles", "aquino", "descartes", "hume", "kant", "marx", "nietzsche", "ortega"],
    comparisonIds: ["platon_aristoteles", "aristoteles_aquino", "descartes_hume", "marx_platon", "nietzsche_ortega"],
    accent: "#2584d8",
  },
  {
    id: "u7",
    day: "Día 2",
    title: "Errores inteligentes",
    hook: "La máquina te devuelve lo fallado antes de que el examen te lo cobre.",
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

export async function loadContent() {
  if (hasBackendApi()) {
    try {
      const response = await fetch("/api/content");
      if (response.ok) return await response.json();
    } catch {
      // Local file fallback below.
    }
  }
  const data = cloneAndClean(window.PAU_DATA || { authors: [], comparisons: [] });
  return { ...data, axes: AXES, lessonPlan: buildLessonPlan(data), source: "window" };
}

export function hasBackendApi() {
  return window.location.protocol !== "file:" && !window.location.hostname.endsWith("github.io");
}

export function buildLessonPlan(rawData) {
  const data = cloneAndClean(rawData);
  const concepts = getConceptRows(data);
  const comparisons = data.comparisons || [];

  return UNIT_DEFS.map((unit, index) => {
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
    ];

    if (comparisonPool.length) {
      lessons.push(makeLesson(unit, "ejes", "Comparación por ejes", "comparison", mixedConcepts, comparisonPool, 3));
    } else {
      lessons.push(makeLesson(unit, "autores", "¿De quién es?", "author", mixedConcepts, comparisonPool, 3));
    }

    lessons.push(makeBossLesson(unit, mixedConcepts, comparisonPool));

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

export function getConceptRows(data) {
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
  const id = `${unit.id}_${suffix}`;
  const questions = buildQuestions(kind, concepts, comparisons, unit, salt);
  return {
    id,
    unitId: unit.id,
    title,
    kind,
    xp: kind === "flash" ? 30 : 50,
    questions,
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
        sourcePack: {
          unit: unit.title,
          concepts: sourceConcepts,
          comparison: sourceComparison || null,
        },
      },
    ],
  };
}

function buildQuestions(kind, concepts, comparisons, unit, salt) {
  if (kind === "comparison") return buildComparisonQuestions(comparisons, unit, salt);
  if (kind === "author") return buildAuthorQuestions(concepts, salt);
  if (kind === "flash") return takeSpread(concepts, 5, salt).map((concept) => ({
    id: `flash_${concept.id}`,
    type: "flash",
    prompt: concept.term,
    answer: concept.definition,
    meta: concept.authorName,
    source: concept,
  }));
  if (kind === "cloze") return takeSpread(concepts, 6, salt + 2).map(makeClozeQuestion);
  return takeSpread(concepts, 7, salt + 1).map((concept, index) => makeConceptQuestion(concept, concepts, index + salt));
}

function buildComparisonQuestions(comparisons, unit, salt) {
  const questions = [];
  for (const comparison of comparisons) {
    for (const axisKey of Object.keys(AXES)) {
      const axis = comparison.axes?.[axisKey];
      if (!axis) continue;
      questions.push({
        id: `cmp_${comparison.id}_${axisKey}`,
        type: "comparison",
        prompt: `En ${comparison.title}, ¿qué eje relaciona estas ideas?`,
        snippet: `${axis.first} ${axis.second}`,
        answer: axisKey,
        options: shuffle(Object.keys(AXES), salt + questions.length).map((key) => ({
          value: key,
          label: `${AXES[key].label} (${AXES[key].guide})`,
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
        .map(([key, axis]) => `${AXES[key]?.label || key}: ${axis.first} ${axis.second}`)
        .join("\n")
    : "";
  return `${unit.title}\n${conceptLines}${axisLines ? `\n${comparison.title}\n${axisLines}` : ""}`;
}

export function flattenLessonPlan(plan) {
  return plan.flatMap((unit) => unit.lessons.map((lesson) => ({ ...lesson, unit })));
}

export function getNextLesson(plan, progress) {
  const flat = flattenLessonPlan(plan);
  return flat.find((lesson) => !progress.completedLessons?.[lesson.id]) || flat[flat.length - 1];
}

export function isUnitUnlocked(unit, progress) {
  if (unit.order === 1) return true;
  const previousId = `u${unit.order - 1}_boss`;
  return Boolean(progress.completedLessons?.[previousId]);
}

export function unitStars(unit, progress) {
  const completed = unit.lessons.filter((lesson) => progress.completedLessons?.[lesson.id]).length;
  if (!completed) return 0;
  if (completed >= unit.lessons.length) return 3;
  if (completed >= Math.ceil(unit.lessons.length * 0.6)) return 2;
  return 1;
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
  return normalizeText(value).replace(/\s+/g, "-").slice(0, 36);
}
