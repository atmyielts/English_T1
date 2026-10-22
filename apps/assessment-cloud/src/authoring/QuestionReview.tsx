import { useState } from "react";
import type {
  AnswerKey,
  Item,
} from "../../../../packages/assessment-core/src/mod.ts";
import type { validateRubric } from "../../../../packages/assessment-core/src/grading.ts";
import { QuestionResponse } from "../../../../packages/assessment-web/src/QuestionResponse";
import { QuestionMedia } from "../../../../packages/assessment-web/src/QuestionMedia";
import { MathText } from "../../../../packages/assessment-web/src/MathText";
import type { Row } from "../../../../packages/assessment-web/src/client";
import {PrivateTargetOverlay} from './ImageInteractionFields';
import { useAppT, useItemLabel, type AppKey } from "../i18n/index.ts";
import { type ReviewComment, type ReviewComparison, ReviewChanges, ReviewConversation } from "./ReviewConversation";
export function QuestionReview({
  material,
  tenant,
  actor,
  canApprove,
  canComment = false,
  canRequestChanges = false,
  busy,
  approve,
  comment = async () => false,
  requestChanges = async () => false,
}: {
  material: Row;
  tenant:string;
  actor:string;
  canApprove: boolean;
  canComment?: boolean;
  canRequestChanges?: boolean;
  busy: boolean;
  approve: () => void;
  comment?: (data: { area: string; body: string }) => Promise<boolean>;
  requestChanges?: (data: { area: string; body: string }) => Promise<boolean>;
}) {
  const t = useAppT(), itemLabel = useItemLabel();
  const difficulty = (value: string) => { const key = `difficulty.${value}` as AppKey, text = t(key); return text === key ? value : text; };
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
        {t("questionReview.title")}
      </h3>
      {item.classification&&<p>{t("questionReview.classification", { topics: item.classification.topics.join(" · ")||t("classification.notClassified"), difficulty: item.classification.estimated_difficulty != null ? difficulty(item.classification.estimated_difficulty) : t("classification.notClassified") })}</p>}
      <p>
        {t("questionReview.meta", { type: itemLabel(item.type) ?? "", locale: item.locale.toUpperCase(), score: String(item.max_score) })}
      </p>
      <h4><MathText text={item.prompt} /></h4>
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
      <h4>{t("questionReview.key")}</h4>
      {key.hotspot?<><p>{t('questionReview.hotspot')}</p><ol>{key.hotspot.regions.map((region,index)=><li key={index}>{region.shape==='rectangle'?t('questionReview.rectangle',{left:String(region.x1*100),top:String(region.y1*100),right:String(region.x2*100),bottom:String(region.y2*100)}):region.shape==='ellipse'?t('questionReview.ellipse',{x:String(region.x*100),y:String(region.y*100),rx:String(region.radius_x*100),ry:String(region.radius_y*100)}):t('questionReview.polygon',{points:region.points.map(p=>t('questionReview.point',{x:String(p.x*100),y:String(p.y*100)})).join(' → ')})}</li>)}</ol><QuestionMedia item={{media:item.media?.filter(media=>media.artifact_id===item.image_response?.artifact_id)}} tenant={tenant} actor={actor} imageOverlay={()=><PrivateTargetOverlay regions={key.hotspot!.regions}/>}/></>:key.numeric ? (
        <p>
          {t("questionReview.numeric", { value: String(key.numeric.value), tolerance: String(key.numeric.tolerance) })}
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
        <p>{t("questionReview.human")}</p>
      )}
      {key.correct && (
        <p>
          {key.case_sensitive
            ? t("questionReview.caseSensitive")
            : t("questionReview.caseIgnored")}{" "}
          {key.partial_credit
            ? t("questionReview.partialOn")
            : t("questionReview.partialOff")}
        </p>
      )}
      {rubric && (
        <>
          <h4>{rubric.title}</h4>
          <dl>
            {rubric.criteria.map((row) => (
              <div key={row.id}>
                <dt>
                  {t("questionReview.criterion", { title: row.title, max: String(row.max_score) })}
                </dt>
                <dd>{row.descriptor}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <ReviewChanges comparison={(material.comparison as ReviewComparison | null | undefined) ?? null} />
      <ReviewConversation
        comments={(material.comments as ReviewComment[] | undefined) ?? []}
        canComment={canComment}
        canRequestChanges={canRequestChanges}
        busy={busy}
        comment={comment}
        requestChanges={requestChanges}
      />
      {canApprove && (
        <>
          <label className="check">
            <input
              type="checkbox"
              disabled={busy}
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            {t("questionReview.confirm")}
          </label>
          <button disabled={busy || !checked} onClick={approve}>
            {t("questionReview.approve")}
          </button>
        </>
      )}
    </section>
  );
}
