import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  BookOpen,
  Flame,
  Heart,
  Home,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Zap,
} from "lucide-react";
import { AXES, getNextLesson, isUnitUnlocked, loadContent, unitStars } from "./lib/content.js";
import { applyBossResult, applyLessonResult, loadProgress, refillHearts, saveProgress } from "./lib/progress.js";
import { normalizeText, compact } from "./lib/text.js";

const statusLabels = {
  loading: "Cargando misión...",
  path: "Camino PAU",
  lesson: "Lección",
};

export default function App() {
  const [content, setContent] = useState(null);
  const [progress, setProgress] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [activeLesson, setActiveLesson] = useState(null);
  const [toast, setToast] = useState(null);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    let alive = true;
    async function boot() {
      const [loadedContent, loadedProgress, status] = await Promise.all([
        loadContent(),
        loadProgress(),
        fetch("/api/status")
          .then((response) => response.json())
          .catch(() => ({ ai: false })),
      ]);
      if (!alive) return;
      setContent(loadedContent);
      setProgress(loadedProgress);
      setAiStatus(status);
    }
    boot();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!progress) return;
    const id = setTimeout(() => saveProgress(progress), 250);
    return () => clearTimeout(id);
  }, [progress]);

  const nextLesson = useMemo(() => {
    if (!content || !progress) return null;
    return getNextLesson(content.lessonPlan, progress);
  }, [content, progress]);

  if (!content || !progress) {
    return <LoadingScreen />;
  }

  function startLesson(lesson) {
    if (progress.hearts <= 0) {
      setToast({ tone: "danger", text: "Sin vidas. Recarga y vuelve al ataque." });
      return;
    }
    setActiveLesson(lesson);
    setToast(null);
  }

  function completeLesson(lesson, result) {
    const updated = applyLessonResult(progress, lesson, result);
    setProgress(updated);
    saveProgress(updated);
    setActiveLesson(null);
    setToast({
      tone: result.wrong ? "warn" : "success",
      text: result.wrong ? "Lección completada. Lo fallado vuelve en repaso." : "Perfecto. Unidad más cerca del boss.",
    });
  }

  function completeBoss(lesson, evaluation) {
    const updated = applyBossResult(progress, lesson, evaluation);
    setProgress(updated);
    saveProgress(updated);
    if (Number(evaluation.score || 0) >= 60) {
      setToast({ tone: "success", text: "Boss superado. Siguiente bloque desbloqueado." });
    } else {
      setToast({ tone: "warn", text: "Boss corregido. Lee el feedback y reintenta con más precisión." });
    }
  }

  return (
    <div className={`app ${focusMode ? "is-focus" : ""}`}>
      <Sidebar
        progress={progress}
        aiStatus={aiStatus}
        nextLesson={nextLesson}
        focusMode={focusMode}
        onFocusMode={() => setFocusMode((value) => !value)}
        onRefill={() => setProgress(refillHearts(progress))}
        onHome={() => setActiveLesson(null)}
      />

      <main className="game-main">
        <TopBar
          mode={activeLesson ? "lesson" : "path"}
          progress={progress}
          toast={toast}
          onPrimary={() => (activeLesson ? setActiveLesson(null) : startLesson(nextLesson))}
        />

        {activeLesson ? (
          activeLesson.kind === "boss" ? (
            <BossBattle lesson={activeLesson} aiStatus={aiStatus} onDone={completeBoss} onExit={() => setActiveLesson(null)} />
          ) : (
            <LessonPlayer lesson={activeLesson} onDone={completeLesson} onExit={() => setActiveLesson(null)} />
          )
        ) : (
          <PathMap content={content} progress={progress} onStart={startLesson} />
        )}
      </main>

      <RightRail content={content} progress={progress} activeLesson={activeLesson} nextLesson={nextLesson} />
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="brand-orb">
        <Brain size={42} />
      </div>
      <h1>FiloPAU Quest</h1>
      <p>{statusLabels.loading}</p>
    </div>
  );
}

function Sidebar({ progress, aiStatus, nextLesson, focusMode, onFocusMode, onRefill, onHome }) {
  const hearts = Array.from({ length: 3 }, (_, index) => index < progress.hearts);
  return (
    <aside className="sidebar">
      <button className="brand" onClick={onHome} aria-label="Volver al camino">
        <span className="brand-mark">F</span>
        <span>
          <strong>FiloPAU</strong>
          <small>2 días / modo sprint</small>
        </span>
      </button>

      <div className="stat-grid">
        <Stat icon={<Flame />} label="Racha" value={`${progress.streak} día`} />
        <Stat icon={<Zap />} label="XP" value={progress.xp} />
        <Stat icon={<Trophy />} label="Nivel" value={progress.level} />
      </div>

      <div className="hearts" aria-label={`${progress.hearts} vidas`}>
        {hearts.map((active, index) => (
          <Heart key={index} size={23} fill={active ? "currentColor" : "none"} className={active ? "active" : ""} />
        ))}
        <button className="icon-button" onClick={onRefill} title="Recargar vidas">
          <RotateCcw size={18} />
        </button>
      </div>

      <button className="focus-toggle" onClick={onFocusMode}>
        <ShieldCheck size={18} />
        {focusMode ? "Salir de foco" : "Modo foco"}
      </button>

      <div className="next-card">
        <small>Siguiente misión</small>
        <strong>{nextLesson?.title || "Repaso libre"}</strong>
        <span>{nextLesson?.unit?.title}</span>
      </div>

      <div className={`ai-chip ${aiStatus?.ai ? "on" : "off"}`}>
        <Sparkles size={17} />
        {aiStatus?.ai ? "Gemini corrige bosses" : "Fallback local activo"}
      </div>
    </aside>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="stat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TopBar({ mode, progress, toast, onPrimary }) {
  return (
    <header className={`topbar ${mode}`}>
      <div>
        <span className="screen-label">{statusLabels[mode]}</span>
        <h1>{mode === "lesson" ? "Una pregunta. Un gesto. Siguiente." : "Aprende rápido. Responde. Desbloquea."}</h1>
      </div>
      {toast && <div className={`toast ${toast.tone}`}>{toast.text}</div>}
      <button className="primary-action" onClick={onPrimary}>
        {mode === "lesson" ? <Home size={18} /> : <Zap size={18} />}
        {mode === "lesson" ? "Camino" : progress.hearts <= 0 ? "Recargar primero" : "Seguir"}
      </button>
    </header>
  );
}

function PathMap({ content, progress, onStart }) {
  return (
    <section className="path-shell">
      <div className="path-header">
        <div>
          <h2>Camino express PAU</h2>
          <p>Ocho unidades cortas: primero base, luego mezcla real de examen.</p>
        </div>
        <div className="legend">
          {Object.entries(AXES).map(([key, axis]) => (
            <span key={key}>
              {axis.label} <b>({axis.guide})</b>
            </span>
          ))}
        </div>
      </div>

      <div className="path-map">
        {content.lessonPlan.map((unit, index) => {
          const unlocked = isUnitUnlocked(unit, progress);
          const stars = unitStars(unit, progress);
          return (
            <article className={`unit-node ${unlocked ? "unlocked" : "locked"} ${unit.final ? "final" : ""}`} key={unit.id}>
              <div className="unit-spine" style={{ "--accent": unit.accent }}>
                <span>{index + 1}</span>
              </div>
              <div className="unit-card">
                <div className="unit-meta">
                  <span>{unit.day}</span>
                  <span>{unit.estimate}</span>
                </div>
                <h3>{unit.title}</h3>
                <p>{unit.hook}</p>
                <div className="stars" aria-label={`${stars} estrellas`}>
                  {[0, 1, 2].map((item) => (
                    <Star key={item} size={19} fill={item < stars ? "currentColor" : "none"} />
                  ))}
                </div>
                <div className="lesson-row">
                  {unit.lessons.map((lesson) => {
                    const done = Boolean(progress.completedLessons?.[lesson.id]);
                    return (
                      <button
                        key={lesson.id}
                        className={`lesson-dot ${done ? "done" : ""} ${lesson.kind}`}
                        onClick={() => unlocked && onStart({ ...lesson, unit })}
                        disabled={!unlocked}
                        title={lesson.title}
                      >
                        {lesson.kind === "boss" ? (
                          <Trophy size={18} />
                        ) : done ? (
                          <ShieldCheck size={17} />
                        ) : lesson.kind === "learn" ? (
                          <BookOpen size={18} />
                        ) : (
                          lesson.title[0]
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LessonPlayer({ lesson, onDone, onExit }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [typed, setTyped] = useState("");
  const [revealed, setRevealed] = useState(false);
  const scoredTotal = lesson.questions.filter((item) => item.scored !== false).length || lesson.questions.length;
  const [result, setResult] = useState({ correct: 0, wrong: 0, total: scoredTotal, mistakes: [] });
  const question = lesson.questions[index];
  const progress = Math.round(((index + (selected || revealed ? 1 : 0)) / lesson.questions.length) * 100);

  function answerQuestion(value) {
    const ok = isCorrect(question, value);
    const scored = question.scored !== false;
    setSelected({ value, ok });
    setResult((current) => ({
      ...current,
      correct: current.correct + (scored && ok ? 1 : 0),
      wrong: current.wrong + (scored && !ok ? 1 : 0),
      mistakes: ok || !scored
        ? current.mistakes
        : [
            ...current.mistakes,
            {
              prompt: question.prompt,
              answer: question.answer,
              source: question.source,
            },
          ],
    }));
  }

  function revealQuestion() {
    setRevealed(true);
    if (question.scored !== false) {
      setResult((current) => ({ ...current, correct: current.correct + 1 }));
    }
  }

  function next() {
    if (index >= lesson.questions.length - 1) {
      onDone(lesson, result);
      return;
    }
    setIndex(index + 1);
    setSelected(null);
    setTyped("");
    setRevealed(false);
  }

  return (
    <section className="lesson-player">
      <div className="lesson-frame">
        <div className="lesson-progress">
          <button className="ghost-button" onClick={onExit}>
            <Home size={17} />
            Salir
          </button>
          <div className="bar">
            <span style={{ width: `${progress}%` }} />
          </div>
          <strong>
            {index + 1}/{lesson.questions.length}
          </strong>
        </div>

        <QuestionCard
          question={question}
          selected={selected}
          typed={typed}
          revealed={revealed}
          onSelect={answerQuestion}
          onType={setTyped}
          onReveal={revealQuestion}
          onSubmitText={() => answerQuestion(typed)}
        />

        {(selected || revealed) && (
          <div className={`feedback-card ${selected?.ok === false ? "wrong" : "right"}`}>
            <strong>{question.scored === false ? "Leído. Sigue con la siguiente idea." : selected?.ok === false ? "Casi. Ajusta esto:" : "Bien clavado."}</strong>
            <p>{question.explain || question.answer}</p>
            <button className="primary-action" onClick={next}>
              {index >= lesson.questions.length - 1 ? "Completar lección" : "Siguiente"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function QuestionCard({ question, selected, typed, revealed, onSelect, onType, onReveal, onSubmitText }) {
  if (question.type === "learn") {
    return (
      <article className={`question-card learn-mode ${question.variant === "author" ? "author-intro" : ""}`}>
        <span className="question-type">{question.variant === "author" ? "Aprender autor" : "Concepto guiado"}</span>
        <h2>{question.variant === "author" ? question.authorName : question.prompt}</h2>
        {question.variant === "author" ? (
          <>
            <p className="learn-school" style={{ "--author-color": question.color }}>
              {question.school}
            </p>
            <p className="learn-definition">{question.prompt}</p>
            <div className="learn-tips">
              {question.tips?.slice(0, 3).map((tip) => (
                <span key={tip}>{tip}</span>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="learn-author" style={{ "--author-color": question.color }}>
              {question.authorName}
            </p>
            <p className="learn-definition">{question.answer}</p>
            <div className="learn-context">
              <b>Conecta con la tesis:</b> {question.context}
            </div>
            {question.tip && <p className="learn-tip">Pista PAU: {question.tip}</p>}
          </>
        )}
        {!revealed && (
          <button className="primary-action wide" onClick={onReveal}>
            Entendido
          </button>
        )}
      </article>
    );
  }

  if (question.type === "learn-check") {
    return (
      <article className="question-card">
        <span className="question-type">Check de comprensión</span>
        <h2>{question.prompt}</h2>
        <blockquote>{question.definition}</blockquote>
        <div className="option-grid">
          {question.options.map((option) => (
            <button key={option} className={optionClass(selected, option, question.answer)} disabled={Boolean(selected)} onClick={() => onSelect(option)}>
              {option}
            </button>
          ))}
        </div>
      </article>
    );
  }

  if (question.type === "flash") {
    return (
      <article className="question-card flash-mode">
        <span className="question-type">Flashcard</span>
        <h2>{question.prompt}</h2>
        <p className={revealed ? "flash-answer visible" : "flash-answer"}>{revealed ? question.answer : "Respóndelo mentalmente antes de girar."}</p>
        {!revealed && (
          <button className="primary-action wide" onClick={onReveal}>
            Girar tarjeta
          </button>
        )}
      </article>
    );
  }

  if (question.type === "cloze") {
    return (
      <article className="question-card">
        <span className="question-type">Concepto escrito</span>
        <h2>{question.prompt}</h2>
        <div className="answer-line">
          <input value={typed} onChange={(event) => onType(event.target.value)} placeholder="Escribe el concepto" />
          <button className="primary-action" onClick={onSubmitText} disabled={!typed.trim() || selected}>
            Comprobar
          </button>
        </div>
      </article>
    );
  }

  if (question.type === "comparison") {
    return (
      <article className="question-card">
        <span className="question-type">Ejes PAU</span>
        <h2>{question.prompt}</h2>
        <blockquote>{question.snippet}</blockquote>
        <div className="option-grid axes-grid">
          {question.options.map((option) => (
            <button
              key={option.value}
              className={optionClass(selected, option.value, question.answer)}
              disabled={Boolean(selected)}
              onClick={() => onSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </article>
    );
  }

  return (
    <article className="question-card">
      <span className="question-type">Pregunta rápida</span>
      <h2>{question.prompt}</h2>
      <div className="option-grid">
        {question.options.map((option) => (
          <button key={option} className={optionClass(selected, option, question.answer)} disabled={Boolean(selected)} onClick={() => onSelect(option)}>
            {option}
          </button>
        ))}
      </div>
    </article>
  );
}

function BossBattle({ lesson, aiStatus, onDone, onExit }) {
  const question = lesson.questions[0];
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function evaluate() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: question.prompt,
          expected: question.expected,
          answer,
          sourcePack: question.sourcePack,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setEvaluation(data);
      onDone(lesson, data);
    } catch (err) {
      const data = localBossEvaluate(question, answer);
      setEvaluation(data);
      onDone(lesson, data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="boss-shell">
      <div className="boss-card">
        <div className="boss-top">
          <button className="ghost-button" onClick={onExit}>
            <Home size={17} />
            Salir
          </button>
          <span className={`ai-chip ${aiStatus?.ai ? "on" : "off"}`}>
            <Sparkles size={17} />
            {aiStatus?.ai ? "IA activa" : "Fallback local"}
          </span>
        </div>
        <div className="boss-title">
          <Trophy size={36} />
          <div>
            <span>Final Boss</span>
            <h2>{lesson.unit?.title || lesson.title}</h2>
          </div>
        </div>
        <p className="boss-prompt">{question.prompt}</p>
        <div className="source-strip">
          {question.sourcePack.concepts?.slice(0, 5).map((concept) => (
            <span key={concept.id}>{concept.term}</span>
          ))}
        </div>
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          disabled={Boolean(evaluation)}
          placeholder="Escribe como en PAU: tesis clara, conceptos y comparación por eje si toca."
        />
        {!evaluation && (
          <button className="primary-action wide" disabled={loading || answer.trim().length < 30} onClick={evaluate}>
            {loading ? "Corrigiendo..." : "Corregir con IA"}
          </button>
        )}
        {error && <div className="feedback-card wrong">{error}</div>}
        {evaluation && (
          <EvaluationResult
            evaluation={evaluation}
            onContinue={onExit}
            onRetry={() => {
              setEvaluation(null);
              setError("");
              setAnswer("");
            }}
          />
        )}
      </div>
    </section>
  );
}

function EvaluationResult({ evaluation, onContinue, onRetry }) {
  const score = Number(evaluation.score || 0);
  const passed = score >= 60;
  return (
    <div className={`evaluation ${score >= 75 ? "good" : score >= 55 ? "mid" : "low"}`}>
      <div className="score-ring">
        <strong>{score}</strong>
        <span>/100</span>
      </div>
      <div>
        <h3>{evaluation.verdict || "Corrección lista"}</h3>
        {!!evaluation.strengths?.length && (
          <p>
            <b>Has clavado:</b> {evaluation.strengths.join(" · ")}
          </p>
        )}
        {!!evaluation.missing?.length && (
          <p>
            <b>Para subir nota:</b> {evaluation.missing.join(" · ")}
          </p>
        )}
        <div className="model-answer">
          <b>Respuesta fuente:</b> {evaluation.correction}
        </div>
        {evaluation.nextQuestion && <p className="next-question">Micro-reto: {evaluation.nextQuestion}</p>}
        <div className="evaluation-actions">
          <button className="ghost-button" onClick={onRetry}>
            Reintentar mejor
          </button>
          <button className="primary-action" onClick={onContinue}>
            {passed ? "Continuar camino" : "Volver al camino"}
          </button>
        </div>
      </div>
    </div>
  );
}

function localBossEvaluate(question, answer) {
  const expected = normalizeText(question.expected || "");
  const normalizedAnswer = normalizeText(answer);
  const important = expected
    .split(/\s+/)
    .filter((word) => word.length > 5 && !["porque", "mediante", "aquello", "realidad", "humano", "fuente"].includes(word))
    .slice(0, 18);
  const hits = important.filter((word) => normalizedAnswer.includes(word));
  const missing = important.filter((word) => !normalizedAnswer.includes(word)).slice(0, 4);
  const ratio = hits.length / Math.max(1, important.length);
  const score = Math.max(normalizedAnswer.length > 45 ? 45 : 20, Math.round(ratio * 100));
  const concepts = question.sourcePack?.concepts?.slice(0, 4).map((concept) => `${concept.term}: ${concept.definition}`).join(" ");

  return {
    score,
    verdict: "Corrección local: útil para practicar cuando no hay servidor IA.",
    strengths: hits.slice(0, 3),
    missing,
    correction: concepts || question.expected,
    nextQuestion: "Repítelo con una tesis clara y dos conceptos técnicos.",
    ai: false,
  };
}

function RightRail({ content, progress, activeLesson, nextLesson }) {
  const authors = content.authors || [];
  const completedCount = Object.keys(progress.completedLessons || {}).length;
  const totalLessons = content.lessonPlan.reduce((sum, unit) => sum + unit.lessons.length, 0);
  return (
    <aside className="right-rail">
      <section className="rail-panel mission">
        <span>Meta de hoy</span>
        <h2>{completedCount}/{totalLessons}</h2>
        <p>Lecciones completadas. Haz bosses solo cuando puedas explicar sin mirar.</p>
      </section>

      <section className="rail-panel">
        <div className="rail-title">
          <ScrollText size={18} />
          <h3>Autores</h3>
        </div>
        <div className="author-list">
          {authors.map((author) => (
            <div key={author.id} className="author-row">
              <span style={{ background: author.color }} />
              <strong>{author.name}</strong>
              <small>{author.concepts?.length || 0}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="rail-panel">
        <div className="rail-title">
          <Brain size={18} />
          <h3>{activeLesson ? "Fuente activa" : "Siguiente"}</h3>
        </div>
        <p>{activeLesson ? compact(activeLesson.questions?.[0]?.source?.definition || activeLesson.questions?.[0]?.expected, 220) : nextLesson?.unit?.hook}</p>
      </section>
    </aside>
  );
}

function isCorrect(question, value) {
  if (question.type === "cloze") {
    const answer = normalizeText(value);
    return question.accepted.some((item) => {
      const expected = normalizeText(item);
      return answer.includes(expected) || expected.includes(answer);
    });
  }
  return value === question.answer;
}

function optionClass(selected, option, answer) {
  if (!selected) return "option";
  if (option === answer) return "option correct";
  if (selected.value === option && !selected.ok) return "option wrong";
  return "option muted";
}
