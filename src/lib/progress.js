const STORAGE_KEY = "filopau_progress_v2";

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
  const local = hydrateLocalProgress();
  try {
    const response = await fetch("/api/progress");
    if (response.ok) {
      const remote = await response.json();
      return normalizeProgress({ ...local, ...remote });
    }
  } catch {
    // Keep local fallback.
  }
  return local;
}

export async function saveProgress(progress) {
  const normalized = normalizeProgress(progress);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
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
