import type { ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import type {
  Locale,
  Match,
  Signal,
} from "../../../../../supabase/functions/_shared/guide";
import { guideCopy as c } from "./copy";

export function GuideMatchCard(
  { match, locale, disabled, onOpen, children }: {
    match: Match;
    locale: Locale;
    disabled?: boolean;
    onOpen?: () => void;
    children?: ReactNode;
  },
) {
  return (
    <article className="guide-match">
      {match.owned && <div className="guide-owned">{c.owned[locale]}</div>}
      <h2>{match.product?.name ?? match.rule.title[locale]}</h2>
      <ul>
        {match.rule.reasons.map((reason, index) => (
          <li key={index}>
            <Check size={17} />
            <span>{reason[locale]}</span>
          </li>
        ))}
      </ul>
      {match.plan && !match.owned && (
        <>
          <div className="guide-price">
            {match.plan.amount === 0
              ? c.free[locale]
              : `${
                match.plan.amount.toLocaleString(
                  locale === "uz" ? "uz-UZ" : locale,
                )
              } ${match.plan.currency}`}
          </div>
          <p>
            {match.plan.name} · {match.plan.duration_days
              ? `${match.plan.duration_days} ${c.days[locale]}`
              : c.noExpiry[locale]}
          </p>
        </>
      )}
      {match.included.length > 0 && (
        <>
          <h3>{c.included[locale]}</h3>
          <p>{match.included.map((p) => p.name).join(" · ")}</p>
        </>
      )}
      <h3>{c.limits[locale]}</h3>
      <p>{match.rule.limitations[locale]}</p>
      {match.plan && !match.owned && <p>{c.priceNote[locale]}</p>}
      <button
        type="button"
        className="guide-primary"
        disabled={disabled || !onOpen}
        onClick={onOpen}
      >
        {match.owned ? c.open[locale] : match.rule.action[locale]}
        <ArrowRight size={18} />
      </button>
      {children}
    </article>
  );
}
export function GuideSignals(
  { signals, locale }: { signals: Signal[]; locale: Locale },
) {
  if (!signals.length) return null;
  return (
    <div className="guide-signals">
      <h2>{c.sample[locale]}</h2>
      {signals.map((s) => (
        <p key={s.skill}>
          <strong>{c[s.skill][locale]}:</strong> {s.correct} {c.correct[locale]}
          {" "}
          {s.answered} {c.answered[locale]} · {s.available - s.answered}{" "}
          {c.skipped[locale]}
        </p>
      ))}
    </div>
  );
}
