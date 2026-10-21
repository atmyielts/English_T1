import { type SectionDraft } from "../../../../packages/assessment-core/src/design.ts";
import {
  blankBlueprint,
  blankBlueprintRule,
  type BlueprintRuleDraft,
} from "../../../../packages/assessment-core/src/blueprint-draft.ts";
import {
  type Classification,
  DIFFICULTIES,
} from "../../../../packages/assessment-core/src/blueprint.ts";
import { ITEM_TYPES } from "../../../../packages/assessment-core/src/mod.ts";
import { useAppT, useCodeText, useItemLabel } from "../i18n/index.ts";
import type { Row } from "../../../../packages/assessment-web/src/client";
export function BlueprintEditor(
  { section, index, questions, change }: {
    section: SectionDraft;
    index: number;
    questions: Row[];
    change: (section: SectionDraft) => void;
  },
) {
  const t = useAppT(), codeText = useCodeText(), itemLabel = useItemLabel();
  const value = section.blueprint,
    toggle = (list: string[], value: string) =>
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value];
  if (!value) {
    return (
      <button
        type="button"
        className="quiet"
        onClick={() => change({ ...section, blueprint: blankBlueprint() })}
      >
        {t("blueprint.add", { section: index + 1 })}
      </button>
    );
  }
  const topics = [
    ...new Set([
      ...questions.filter((question) => section.items.includes(question.id!))
        .flatMap((question) =>
          (question.payload as { classification?: Classification })
            ?.classification?.topics ?? []
        ),
      ...value.rules.flatMap((rule) => rule.topics),
    ]),
  ].sort((a, b) => a.localeCompare(b));
  const updateRule = (id: string, partial: Partial<BlueprintRuleDraft>) =>
    change({
      ...section,
      blueprint: {
        ...value,
        rules: value.rules.map((rule) =>
          rule.id === id ? { ...rule, ...partial } : rule
        ),
      },
    });
  return (
    <fieldset>
      <legend>{t("blueprint.legend", { section: index + 1 })}</legend>
      <p>
        {t("blueprint.lead")}
      </p>
      <div className="design-fields">
        <label>
          {t("blueprint.minPoints", { section: index + 1 })}
          <input
            type="number"
            min={0}
            max={500000}
            step="0.000001"
            value={value.minimumPoints}
            onChange={(event) =>
              change({
                ...section,
                blueprint: { ...value, minimumPoints: event.target.value },
              })}
          />
        </label>
        <label>
          {t("blueprint.maxPoints", { section: index + 1 })}
          <input
            type="number"
            min={0}
            max={500000}
            step="0.000001"
            value={value.maximumPoints}
            onChange={(event) =>
              change({
                ...section,
                blueprint: { ...value, maximumPoints: event.target.value },
              })}
          />
        </label>
      </div>
      {value.rules.map((rule, n) => (
        <fieldset key={rule.id}>
          <legend>{t("blueprint.rule", { rule: n + 1, section: index + 1 })}</legend>
          <label>
            {t("blueprint.ruleName", { rule: n + 1, section: index + 1 })}
            <input
              required
              maxLength={200}
              value={rule.label}
              onChange={(event) =>
                updateRule(rule.id, { label: event.target.value })}
            />
          </label>
          <fieldset>
            <legend>{t("blueprint.topics", { rule: n + 1, section: index + 1 })}</legend>
            {topics.map((topic) => (
              <label className="check" key={topic}>
                <input
                  type="checkbox"
                  checked={rule.topics.includes(topic)}
                  onChange={() =>
                    updateRule(rule.id, { topics: toggle(rule.topics, topic) })}
                />
                {topic}
              </label>
            ))}
            {!topics.length && (
              <p>
                {t("blueprint.noTopics")}
              </p>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={rule.allTopics}
                onChange={(event) =>
                  updateRule(rule.id, { allTopics: event.target.checked })}
              />{t("blueprint.allTopics")}
            </label>
          </fieldset>
          <fieldset>
            <legend>
              {t("blueprint.difficulty", { rule: n + 1, section: index + 1 })}
            </legend>
            {DIFFICULTIES.map((difficulty) => (
              <label className="check" key={difficulty}>
                <input
                  type="checkbox"
                  checked={rule.difficulties.includes(difficulty)}
                  onChange={() =>
                    updateRule(rule.id, {
                      difficulties: toggle(
                        rule.difficulties,
                        difficulty,
                      ) as BlueprintRuleDraft["difficulties"],
                    })}
                />
                {codeText("blueprint.difficulty", difficulty, `${difficulty[0].toUpperCase() + difficulty.slice(1)} (estimated)`)}
              </label>
            ))}
          </fieldset>
          <label>
            {t("blueprint.types", { rule: n + 1, section: index + 1 })}
            <select
              multiple
              size={4}
              value={rule.types}
              onChange={(event) =>
                updateRule(rule.id, {
                  types: [...event.target.selectedOptions].map((option) =>
                    option.value
                  ),
                })}
            >
              {ITEM_TYPES.map((type) => (
                <option key={type} value={type}>{itemLabel(type)}</option>
              ))}
            </select>
          </label>
          <p>
            {t("blueprint.filtersHint")}
          </p>
          <div className="design-fields">
            <label>
              {t("blueprint.minQuestions", { rule: n + 1, section: index + 1 })}
              <input
                required
                type="number"
                min={0}
                max={section.items.length}
                step={1}
                value={rule.minimum}
                onChange={(event) =>
                  updateRule(rule.id, { minimum: event.target.value })}
              />
            </label>
            <label>
              {t("blueprint.maxQuestions", { rule: n + 1, section: index + 1 })}
              <input
                type="number"
                min={0}
                max={section.items.length}
                step={1}
                placeholder={t("blueprint.drawCount")}
                value={rule.maximum}
                onChange={(event) =>
                  updateRule(rule.id, { maximum: event.target.value })}
              />
            </label>
          </div>
          <button
            type="button"
            className="quiet"
            onClick={() =>
              change({
                ...section,
                blueprint: {
                  ...value,
                  rules: value.rules.filter((item) => item.id !== rule.id),
                },
              })}
          >
            {t("blueprint.removeRule", { rule: n + 1, section: index + 1 })}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="quiet"
        disabled={value.rules.length >= 20}
        onClick={() =>
          change({
            ...section,
            blueprint: {
              ...value,
              rules: [...value.rules, blankBlueprintRule()],
            },
          })}
      >
        {t("blueprint.addRule", { section: index + 1 })}
      </button>
      <button
        type="button"
        className="quiet"
        onClick={() => {
          const { blueprint: _removed, ...rest } = section;
          change(rest);
        }}
      >
        {t("blueprint.remove", { section: index + 1 })}
      </button>
    </fieldset>
  );
}
