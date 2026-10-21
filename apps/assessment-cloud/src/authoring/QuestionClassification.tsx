import type { ItemDraft } from "../../../../packages/assessment-core/src/authoring.ts";
export function QuestionClassification(
  { draft, change }: {
    draft: ItemDraft;
    change: (value: Partial<ItemDraft>) => void;
  },
) {
  const topics = draft.topics ?? [];
  return (
    <fieldset>
      <legend>Blueprint classification</legend>
      <p>
        Topics and difficulty are pinned to this question version and included
        in independent review. Difficulty is an author estimate, not calibrated
        test difficulty. These fields are not sent in candidate question
        manifests.
      </p>
      {topics.map((topic, index) => (
        <div className="author-row" key={index}>
          <label>
            Blueprint topic {index + 1}
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
            aria-label={`Remove blueprint topic ${index + 1}`}
          >
            Remove topic
          </button>
        </div>
      ))}
      <button
        className="quiet"
        type="button"
        disabled={topics.length >= 20}
        onClick={() => change({ topics: [...topics, ""] })}
      >
        Add blueprint topic
      </button>
      <label>
        Author-estimated difficulty<select
          value={draft.estimatedDifficulty ?? ""}
          onChange={(event) =>
            change({ estimatedDifficulty: event.target.value })}
        >
          <option value="">Not classified</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </label>
    </fieldset>
  );
}
