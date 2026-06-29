const STORAGE_KEY = "filopau_progress_v2";
const PUBLIC_APP_URL = "https://veo3ygemini-bit.github.io/filopau-quest/";

export const initialProgress = {
  xp: 0,
  level: 1,
  hearts: 3,
  streak: 1,
  startedAt: null,
  lastSeen: null,
  completedLessons: {},
  lessonScores: {},
  mistakes: [],
  reviews: [],
  bossHistory: [],
};

export function hydrateLocalProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeProgress(JSON.parse(raw)) : initialToday();
  } catch {
    return initialToday();
  }
}

export async function loadProgress() {
  const imported = readProgressFromUrl();
  if (imported) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
    stripProgressFromUrl();
    return imported;
  }

  const local = hydrateLocalProgress();
  if (hasBackendApi()) {
    try {
      const response = await fetch("/api/progress");
      if (response.ok) {
        const remote = await response.json();
        return normalizeProgress({ ...local, ...remote });
      }
    } catch {
      // Keep local fallback.
    }
  }
  return local;
}

export async function saveProgress(progress) {
  const normalized = normalizeProgress(progress);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  if (hasBackendApi()) {
    try {
      await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized),
      });
    } catch {
      // Local storage is the offline backup.
    }
  }
}

function hasBackendApi() {
  return window.location.protocol !== "file:" && !window.location.hostname.endsWith("github.io");
}

export function normalizeProgress(progress) {
  const today = new Date().toISOString().slice(0, 10);
  const normalized = {
    ...initialProgress,
    ...progress,
    completedLessons: progress?.completedLessons || {},
    lessonScores: progress?.lessonScores || {},
    mistakes: progress?.mistakes || [],
    reviews: progress?.reviews || [],
    bossHistory: progress?.bossHistory || [],
  };
  normalized.startedAt ||= today;
  normalized.lastSeen = today;
  normalized.level = Math.max(1, Math.floor(normalized.xp / 180) + 1);
  normalized.hearts = Math.max(0, Math.min(3, Number(normalized.hearts ?? 3)));
  return normalized;
}

export function initialToday() {
  return normalizeProgress({ ...initialProgress });
}

export function applyLessonResult(progress, lesson, result) {
  const score = Math.round((result.correct / Math.max(1, result.total)) * 100);
  const xpGain = Math.max(5, Math.round((lesson.xp || 40) * (score / 100)));
  const heartsLost = result.wrong;
  const mistakeRows = result.mistakes.map((item) => ({
    ...item,
    lessonId: lesson.id,
    unitId: lesson.unitId,
    due: Date.now() + 1000 * 60 * 10,
  }));

  return normalizeProgress({
    ...progress,
    xp: progress.xp + xpGain,
    hearts: Math.max(0, progress.hearts - heartsLost),
    completedLessons: {
      ...progress.completedLessons,
      [lesson.id]: true,
    },
    lessonScores: {
      ...progress.lessonScores,
      [lesson.id]: score,
    },
    mistakes: [...mistakeRows, ...progress.mistakes].slice(0, 60),
    reviews: [...mistakeRows, ...progress.reviews].slice(0, 40),
  });
}

export function applyBossResult(progress, lesson, evaluation) {
  const score = Number(evaluation.score || 0);
  const xpGain = Math.max(15, Math.round((lesson.xp || 80) * (score / 100)));
  const passed = score >= 60;
  return normalizeProgress({
    ...progress,
    xp: progress.xp + xpGain,
    hearts: passed ? progress.hearts : Math.max(0, progress.hearts - 1),
    completedLessons: passed
      ? {
          ...progress.completedLessons,
          [lesson.id]: true,
        }
      : progress.completedLessons,
    lessonScores: {
      ...progress.lessonScores,
      [lesson.id]: score,
    },
    bossHistory: [
      {
        lessonId: lesson.id,
        score,
        ai: Boolean(evaluation.ai),
        date: new Date().toISOString(),
      },
      ...progress.bossHistory,
    ].slice(0, 20),
  });
}

export function refillHearts(progress) {
  return normalizeProgress({ ...progress, hearts: 3 });
}

export function portableProgress(progress) {
  const normalized = normalizeProgress(progress || {});
  return {
    xp: normalized.xp,
    level: normalized.level,
    hearts: normalized.hearts,
    streak: normalized.streak,
    startedAt: normalized.startedAt,
    lastSeen: normalized.lastSeen,
    completedLessons: normalized.completedLessons,
    lessonScores: normalized.lessonScores,
    bossHistory: normalized.bossHistory,
  };
}

export function encodeProgress(progress) {
  return btoa(JSON.stringify(portableProgress(progress)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export function decodeProgress(value) {
  const padded = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
  const raw = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  return normalizeProgress(JSON.parse(atob(raw)));
}

export function progressTransferUrl(progress) {
  return `${PUBLIC_APP_URL}?progress=${encodeURIComponent(encodeProgress(progress))}`;
}

export function importProgressText(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) throw new Error("No hay progreso para importar.");
  if (trimmed.startsWith("http")) {
    const url = new URL(trimmed);
    const payload = url.searchParams.get("progress");
    if (!payload) throw new Error("El enlace no contiene progreso.");
    return decodeProgress(payload);
  }
  if (trimmed.startsWith("{")) return normalizeProgress(JSON.parse(trimmed));
  return decodeProgress(trimmed);
}

function readProgressFromUrl() {
  try {
    const payload = new URLSearchParams(window.location.search).get("progress");
    return payload ? decodeProgress(payload) : null;
  } catch {
    return null;
  }
}

function stripProgressFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("progress");
  window.history.replaceState({}, "", url.toString());
}
