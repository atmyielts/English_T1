import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Compass,
  Flag,
  Pencil,
  Sparkles,
  Users,
} from "lucide-react";
import {
  type Answer,
  type Answers,
  type GuideFlow,
  type Locale,
  type Question,
  validAnswer,
  visibleQuestions,
} from "../../../../../supabase/functions/_shared/guide";
import { guideCopy as c } from "./copy";
import "./guide.css";

function answerLabel(q: Question, value: Answer, locale: Locale): string {
  if (value === null) return c.skipped[locale];
  if (Array.isArray(value)) {
    return value.map((id) => q.options.find((o) => o.id === id)?.label[locale] ?? id).join(", ");
  }
  return q.options.find((o) => o.id === value)?.label[locale] ?? String(value);
}
export function StudyRoute(
  { flow, answers, locale, chapter, onEdit }: {
    flow: GuideFlow;
    answers: Answers;
    locale: Locale;
    chapter: string;
    onEdit: (id: string) => void;
  },
) {
  const chapters = ["goal", "starting", "routine", "result"] as const;
  const icons = [Flag, BookOpen, CalendarDays, Compass];
  const current = chapters.indexOf(chapter as typeof chapters[number]);
  const answered = visibleQuestions(flow, answers).filter((q) => Object.hasOwn(answers, q.id));
  const chapterQuestions = visibleQuestions(flow, answers).filter(q => q.chapter === chapter);
  const chapterAnswered = chapterQuestions.filter(q => Object.hasOwn(answers, q.id)).length;
  const routeProgress = current === 3 ? 100 : Math.min(100, (Math.max(0, current) + chapterAnswered / Math.max(1, chapterQuestions.length)) / 3 * 100);
  return (
    <aside className="guide-route" aria-label={c.summary[locale]}>
      <div className="guide-route-heading">
        <Compass size={20} />
        <span>{c.guide[locale]}</span>
      </div>
      <ol className="guide-chapters">
        {chapters.map((id, index) => {
          const Icon = icons[index];
          return (
            <li
              key={id}
              className={index === current ? "is-current" : index < current ? "is-done" : ""}
              aria-current={index === current ? "step" : undefined}
            >
              <span className="guide-node">{index < current ? <Check size={17} /> : <Icon size={17} />}</span>
              <span>{c[id][locale]}</span>
            </li>
          );
        })}
      </ol>
      <div className="guide-route-art" aria-hidden="true">
        {flow.appearance.illustration === "classroom"
          ? <Users size={50} />
          : flow.appearance.illustration === "books"
          ? <BookOpen size={50} />
          : (
            <svg viewBox="0 0 200 100">
              <path className="guide-route-track" d="M12 76C40 76 23 28 63 28S82 83 118 65 148 24 181 24" />
              <path className="guide-route-progress" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - routeProgress} d="M12 76C40 76 23 28 63 28S82 83 118 65 148 24 181 24" />
              <circle cx="12" cy="76" r="5" />
              <circle cx="63" cy="28" r="5" />
              <circle cx="118" cy="65" r="5" />
              <path d="M181 38V8L197 15 181 23" />
            </svg>
          )}
      </div>
      <p className="guide-route-hint">{c.routeHint[locale]}</p>
      {answered.length > 0 && (
        <details className="guide-summary">
          <summary>
            {c.summary[locale]} <Pencil size={14} />
          </summary>
          <ul>
            {answered.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => onEdit(q.id)}
                >
                  <span>{q.title[locale]}</span>
                  <strong>{answerLabel(q, answers[q.id], locale)}</strong>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}
export function GuideQuestion(
  { question, initial, locale, busy, onAnswer, onBack }: {
    question: Question;
    initial?: Answer;
    locale: Locale;
    busy: boolean;
    onAnswer: (value: Answer) => void;
    onBack?: () => void;
  },
) {
  const [value, setValue] = useState<Answer | undefined>(initial);
  const [invalid, setInvalid] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const select = (id: string) => {
    setInvalid(false);
    if (question.kind === "multi") {
      const selected = Array.isArray(value) ? value : [];
      if (selected.includes(id)) setValue(selected.filter((v) => v !== id));
      else if (selected.length < (question.maxSelections ?? 3)) setValue([...selected, id]);
    } else setValue(id);
  };
  return (
    <section className="guide-question guide-enter" aria-busy={busy}>
      <div className="guide-eyebrow">
        <Sparkles size={15} />
        {c[question.chapter][locale]}
        {!question.required && <span>{c.optional[locale]}</span>}
      </div>
      <h1 ref={heading} tabIndex={-1}>{question.title[locale]}</h1>
      <details className="guide-why">
        <summary>{c.why[locale]}</summary>
        <p>{question.help[locale]}</p>
      </details>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!validAnswer(question, value) || value === undefined) {
            setInvalid(true);
            return;
          }
          onAnswer(value);
        }}
      >
        {question.kind === "multi" && (
          <p className="guide-hint">{c.multi[locale]} {question.maxSelections ?? 3}</p>
        )}
        {["single", "multi"].includes(question.kind)
          ? (
            <fieldset className="guide-options" disabled={busy}>
              <legend className="guide-sr">{question.title[locale]}</legend>
              {question.options.map((option, i) => {
                const selected = value === option.id || (Array.isArray(value) && value.includes(option.id));
                const capped = question.kind === "multi" && Array.isArray(value) &&
                  value.length >= (question.maxSelections ?? 3) && !selected;
                return (
                  <label
                    key={option.id}
                    className={`guide-option ${selected ? "is-selected" : ""} ${capped ? "is-capped" : ""}`}
                  >
                    <input
                      type={question.kind === "multi" ? "checkbox" : "radio"}
                      name={question.id}
                      value={option.id}
                      checked={selected}
                      disabled={capped}
                      onChange={() => select(option.id)}
                    />
                    <span className="guide-option-mark" aria-hidden="true">
                      {selected ? <Check size={18} /> : String.fromCharCode(65 + i)}
                    </span>
                    <span className="guide-option-copy">
                      <strong>{option.label[locale]}</strong>
                      {option.detail && <small>{option.detail[locale]}</small>}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )
          : (
            <label className="guide-input-label">
              {question.title[locale]}
              <input
                className="guide-input"
                type={question.kind}
                value={typeof value === "string" || typeof value === "number" ? value : ""}
                min={question.kind === "number" ? question.min : undefined}
                max={question.kind === "number" ? question.max : undefined}
                step={question.kind === "number" ? "any" : undefined}
                disabled={busy}
                aria-invalid={invalid}
                onChange={(event) => {
                  setInvalid(false);
                  setValue(
                    event.target.value === ""
                      ? undefined
                      : question.kind === "number"
                      ? Number(event.target.value)
                      : event.target.value,
                  );
                }}
              />
            </label>
          )}
        {invalid && <p role="alert" className="guide-error">{c.choose[locale]}</p>}
        <div className="guide-actions">
          {onBack && (
            <button type="button" className="guide-back" onClick={onBack} disabled={busy}>
              <ArrowLeft size={17} />
              {c.back[locale]}
            </button>
          )}
          <button type="submit" className="guide-primary" disabled={busy}>
            {c.continue[locale]}
            <ArrowRight size={18} />
          </button>
        </div>
        {!question.required && (
          <button
            type="button"
            className="guide-text-button"
            onClick={() => onAnswer(null)}
            disabled={busy}
          >
            {c.skip[locale]}
          </button>
        )}
      </form>
    </section>
  );
}
