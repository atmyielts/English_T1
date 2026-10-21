import { useState } from "react";
import type {
  AnswerKey,
  Item,
} from "../../../../packages/assessment-core/src/mod.ts";
import { itemLabels } from "../../../../packages/assessment-core/src/authoring.ts";
import type { validateRubric } from "../../../../packages/assessment-core/src/grading.ts";
import { QuestionResponse } from "../../../../packages/assessment-web/src/QuestionResponse";
import { QuestionMedia } from "../../../../packages/assessment-web/src/QuestionMedia";
import type { Row } from "../../../../packages/assessment-web/src/client";
import {PrivateTargetOverlay} from './ImageInteractionFields';
export function QuestionReview({
  material,
  tenant,
  actor,
  canApprove,
  busy,
  approve,
}: {
  material: Row;
  tenant:string;
  actor:string;
  canApprove: boolean;
  busy: boolean;
  approve: () => void;
}) {
  const item = material.payload as Item,
    key = material.key as AnswerKey,
    rubric = material.rubric as ReturnType<typeof validateRubric> | undefined,
    [response, setResponse] = useState<unknown>(null),
    [checked, setChecked] = useState(false);
  const optionText = (id: string) =>
    item.options?.find((row) => row.id === id)?.text ?? id;
  return (
    <section
      className="question-review"
      aria-labelledby="content-review-heading"
    >
      <h3 id="content-review-heading">
        Review question, scoring key and rubric
      </h3>
      {item.classification&&<p>Blueprint topics: {item.classification.topics.join(" · ")||"Not classified"}. Author-estimated difficulty: {item.classification.estimated_difficulty??"Not classified"}. These labels are part of this reviewed version, not psychometric calibration.</p>}
      <p>
        {itemLabels[item.type]} · {item.locale.toUpperCase()} · {item.max_score}{" "}
        points
      </p>
      <h4>{item.prompt}</h4>
      <QuestionMedia item={item} tenant={tenant} actor={actor}/>
      <QuestionResponse
        entry={{
          item_version_id: "review-preview",
          section_id: "preview",
          item,
        }}
        value={response}
        onChange={setResponse}
        mediaContext={{tenant,actor}}
      />
      <h4>Private scoring key</h4>
      {key.hotspot?<><p>Full credit for a point inside any private accepted region, including its boundary.</p><ol>{key.hotspot.regions.map((region,index)=><li key={index}>{region.shape==='rectangle'?`Rectangle: left ${region.x1*100}%, top ${region.y1*100}%, right ${region.x2*100}%, bottom ${region.y2*100}%`:region.shape==='ellipse'?`Ellipse: center ${region.x*100}%, ${region.y*100}%; radii ${region.radius_x*100}%, ${region.radius_y*100}%`:`Polygon vertices: ${region.points.map(p=>`${p.x*100}%, ${p.y*100}%`).join(' → ')}`}</li>)}</ol><QuestionMedia item={{media:item.media?.filter(media=>media.artifact_id===item.image_response?.artifact_id)}} tenant={tenant} actor={actor} imageOverlay={()=><PrivateTargetOverlay regions={key.hotspot!.regions}/>}/></>:key.numeric ? (
        <p>
          Answer: {key.numeric.value} · tolerance ±{key.numeric.tolerance}
        </p>
      ) : typeof key.correct === "string" ? (
        <p>{optionText(key.correct)}</p>
      ) : Array.isArray(key.correct) ? (
        <ol>
          {key.correct.map((id) => (
            <li key={id}>{optionText(id)}</li>
          ))}
        </ol>
      ) : key.correct ? (
        <dl>
          {Object.entries(key.correct).map(([id, answers]) => (
            <div key={id}>
              <dt>{id}</dt>
              <dd>
                {Array.isArray(answers)
                  ? answers.join(" / ")
                  : optionText(answers)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>Human marking required; no automatic answer key.</p>
      )}
      {key.correct && (
        <p>
          {key.case_sensitive
            ? "Capitalization must match."
            : "Capitalization is ignored for text answers."}{" "}
          {key.partial_credit
            ? "Partial credit is enabled."
            : "Partial credit is disabled."}
        </p>
      )}
      {rubric && (
        <>
          <h4>{rubric.title}</h4>
          <dl>
            {rubric.criteria.map((row) => (
              <div key={row.id}>
                <dt>
                  {row.title} · Maximum {row.max_score}
                </dt>
                <dd>{row.descriptor}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {canApprove && (
        <>
          <label className="check">
            <input
              type="checkbox"
              disabled={busy}
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            I reviewed the question, private key and any marking rubric.
          </label>
          <button disabled={busy || !checked} onClick={approve}>
            Approve reviewed question
          </button>
        </>
      )}
    </section>
  );
}
