import type { ItemDraft } from "../../../../packages/assessment-core/src/authoring.ts";
import { useAppT } from "../i18n/index.ts";
export function QuestionClassification(
  { draft, change }: {
    draft: ItemDraft;
    change: (value: Partial<ItemDraft>) => void;
  },
) {
  const t = useAppT();
  const topics = draft.topics ?? [];
  return (
    <fieldset>
      <legend>{t("classification.legend")}</legend>
      <p>
        {t("classification.lead")}
      </p>
      {topics.map((topic, index) => (
        <div className="author-row" key={index}>
          <label>
            {t("classification.topic", { number: index + 1 })}
            <input
              maxLength={80}
              value={topic}
              onChange={(event) =>
                change({
                  topics: topics.map((value, i) =>
                    i === index ? event.target.value : value
                  ),
                })}
            />
          </label>
          <button
            className="quiet"
            type="button"
            onClick={() =>
              change({ topics: topics.filter((_, i) => i !== index) })}
            aria-label={t("classification.removeTopicLabel", { number: index + 1 })}
          >
            {t("classification.removeTopic")}
          </button>
        </div>
      ))}
      <button
        className="quiet"
        type="button"
        disabled={topics.length >= 20}
        onClick={() => change({ topics: [...topics, ""] })}
      >
        {t("classification.addTopic")}
      </button>
      <label>
        {t("classification.difficulty")}<select
          value={draft.estimatedDifficulty ?? ""}
          onChange={(event) =>
            change({ estimatedDifficulty: event.target.value })}
        >
          <option value="">{t("classification.notClassified")}</option>
          <option value="easy">{t("classification.easy")}</option>
          <option value="medium">{t("classification.medium")}</option>
          <option value="hard">{t("classification.hard")}</option>
        </select>
      </label>
    </fieldset>
  );
}
