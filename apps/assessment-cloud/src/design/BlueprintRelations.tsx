import { useState } from "react";
import { blankBlueprintFamily, type BlueprintDraft, type BlueprintFamilyDraft } from "../../../../packages/assessment-core/src/blueprint-draft.ts";
import type { Row } from "../../../../packages/assessment-web/src/client";
import { useAppT } from "../i18n/index.ts";

/** Enemies, families and exposure for one section's blueprint (blueprint v2). */
export function BlueprintRelations({ value, items, questions, index, change }: {
  value: BlueprintDraft;
  items: string[];
  questions: Row[];
  index: number;
  change: (value: BlueprintDraft) => void;
}) {
  const t = useAppT();
  const [first, setFirst] = useState(""), [second, setSecond] = useState("");
  const prompt = (id: string) => String((questions.find((q) => q.id === id)?.payload as { prompt?: string })?.prompt ?? id);
  const enemies = value.enemies ?? [], families = value.families ?? [];
  const pairKey = (a: string, b: string) => [a, b].sort().join(":");
  const updateFamily = (id: string, partial: Partial<BlueprintFamilyDraft>) =>
    change({ ...value, families: families.map((family) => family.id === id ? { ...family, ...partial } : family) });
  return (
    <fieldset className="blueprint-relations">
      <legend>{t("relations.legend", { section: index + 1 })}</legend>
      <p className="hint">{t("relations.lead")}</p>
      <label>
        {t("relations.exposure", { section: index + 1 })}
        <input type="number" min={1} max={100000} step={1} value={value.exposure ?? ""} onChange={(event) => change({ ...value, exposure: event.target.value })} />
      </label>
      <p className="hint">{t("relations.exposureHint")}</p>

      <h4>{t("relations.enemies")}</h4>
      <ul className="records">
        {enemies.map(([a, b]) => (
          <li key={pairKey(a, b)}>
            <span>{t("relations.pair", { first: prompt(a), second: prompt(b) })}</span>
            <button type="button" className="quiet" onClick={() => change({ ...value, enemies: enemies.filter(([x, y]) => pairKey(x, y) !== pairKey(a, b)) })}>
              {t("relations.removePair", { first: prompt(a), second: prompt(b) })}
            </button>
          </li>
        ))}
      </ul>
      <div className="design-fields">
        <label>{t("relations.firstQuestion", { section: index + 1 })}
          <select value={first} onChange={(event) => setFirst(event.target.value)}>
            <option value="">{t("relations.choose")}</option>
            {items.map((id) => <option key={id} value={id}>{prompt(id)}</option>)}
          </select>
        </label>
        <label>{t("relations.secondQuestion", { section: index + 1 })}
          <select value={second} onChange={(event) => setSecond(event.target.value)}>
            <option value="">{t("relations.choose")}</option>
            {items.filter((id) => id !== first).map((id) => <option key={id} value={id}>{prompt(id)}</option>)}
          </select>
        </label>
      </div>
      <button type="button" className="quiet" disabled={!first || !second || first === second || enemies.length >= 100 || enemies.some(([a, b]) => pairKey(a, b) === pairKey(first, second))}
        onClick={() => { const [a, b] = [first, second].sort(); change({ ...value, enemies: [...enemies, [a, b]] }); setFirst(""); setSecond(""); }}>
        {t("relations.addPair", { section: index + 1 })}
      </button>

      <h4>{t("relations.families")}</h4>
      {families.map((family, n) => (
        <fieldset key={family.id}>
          <legend>{t("relations.family", { family: n + 1 })}</legend>
          <label>{t("relations.familyName", { family: n + 1 })}
            <input maxLength={200} value={family.label} onChange={(event) => updateFamily(family.id, { label: event.target.value })} />
          </label>
          <div role="group" aria-label={t("relations.familyQuestions", { family: n + 1 })}>
            {items.map((id) => (
              <label key={id} className="check">
                <input type="checkbox" checked={family.ids.includes(id)} onChange={() => updateFamily(family.id, { ids: family.ids.includes(id) ? family.ids.filter((x) => x !== id) : [...family.ids, id] })} /> {prompt(id)}
              </label>
            ))}
          </div>
          <label>{t("relations.familyMaximum", { family: n + 1 })}
            <input type="number" min={0} step={1} value={family.maximum} onChange={(event) => updateFamily(family.id, { maximum: event.target.value })} />
          </label>
          <button type="button" className="quiet" onClick={() => change({ ...value, families: families.filter((item) => item.id !== family.id) })}>
            {t("relations.removeFamily", { family: n + 1 })}
          </button>
        </fieldset>
      ))}
      <button type="button" className="quiet" disabled={families.length >= 20} onClick={() => change({ ...value, families: [...families, blankBlueprintFamily()] })}>
        {t("relations.addFamily", { section: index + 1 })}
      </button>
    </fieldset>
  );
}
