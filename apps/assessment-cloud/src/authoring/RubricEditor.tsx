import { useState, type FormEvent } from "react";
import { validateRubric } from "../../../../packages/assessment-core/src/grading.ts";
import {useEncryptedDraft} from '../../../../packages/assessment-web/src/useEncryptedDraft';
import {DraftStatus} from '../../../../packages/assessment-web/src/DraftStatus';
export function RubricEditor({
  busy,
  tenant,
  actor,
  save,
}: {
  busy: boolean;
  tenant:string;
  actor:string;
  save: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [initial]=useState(()=>({title:'',criteria:[{id:crypto.randomUUID(),title:'',max:'1',descriptor:''}]}));
  const encrypted=useEncryptedDraft(`authoring:${tenant}:${actor}:rubric:new`,'rubric-editor.v1',initial,value=>{const row=value as typeof initial;if(!row||typeof row.title!=='string'||!Array.isArray(row.criteria)||!row.criteria.length||row.criteria.length>30||row.criteria.some(c=>!c||!['id','title','max','descriptor'].every(id=>typeof (c as unknown as Record<string,unknown>)[id]==='string')))throw new Error('The saved rubric draft has an invalid structure.');return row;});
  const {title,criteria}=encrypted.value;
  const setTitle=(title:string)=>encrypted.update(current=>({...current,title}));
  const setCriteria=(value:typeof criteria|((value:typeof criteria)=>typeof criteria))=>encrypted.update(current=>({...current,criteria:typeof value==='function'?value(current.criteria):value}));
  const [error,setError]=useState(''),[submitting,setSubmitting]=useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if(busy||submitting||encrypted.blocked)return;
    setSubmitting(true);
    setError("");
    try {
      if(encrypted.blocked)throw new Error('Resolve encrypted draft recovery before saving.');
      const prepared=await encrypted.prepare();
      const value = validateRubric({
        title:prepared.value.title,
        criteria: prepared.value.criteria.map((row) => ({
          ...row,
          max_score: row.max.trim() ? Number(row.max) : NaN,
        })),
      });
      if (await save({...value,_draft:prepared.token}))await encrypted.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Complete the rubric.");
    }finally{setSubmitting(false);}
  }
  return (
    <section className="editor">
      <h2>Create a marking rubric</h2>
      <p>
        Rubrics are immutable. To change a rubric, create a new one and attach
        it to a revised question. Existing questions and released grades remain
        pinned to the old rubric.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <DraftStatus {...encrypted} disabled={busy||submitting}/>
        <fieldset disabled={busy||submitting||encrypted.blocked}>
          <legend>Rubric details</legend>
          <label>
            Rubric title
            <input
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          {criteria.map((row, index) => (
            <fieldset key={row.id}>
              <legend>Criterion {index + 1}</legend>
              <div className="author-fields">
                <label>
                  Criterion title {index + 1}
                  <input
                    required
                    maxLength={200}
                    value={row.title}
                    onChange={(event) =>
                      setCriteria((current) =>
                        current.map((c) =>
                          c.id === row.id
                            ? { ...c, title: event.target.value }
                            : c,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Criterion maximum {index + 1}
                  <input
                    type="number"
                    required
                    min="0.000001"
                    max={1000}
                    step="0.000001"
                    value={row.max}
                    onChange={(event) =>
                      setCriteria((current) =>
                        current.map((c) =>
                          c.id === row.id
                            ? { ...c, max: event.target.value }
                            : c,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <label>
                Criterion descriptor {index + 1}
                <textarea
                  required
                  maxLength={5000}
                  rows={3}
                  value={row.descriptor}
                  onChange={(event) =>
                    setCriteria((current) =>
                      current.map((c) =>
                        c.id === row.id
                          ? { ...c, descriptor: event.target.value }
                          : c,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="quiet"
                disabled={criteria.length <= 1}
                onClick={() =>
                  setCriteria((current) =>
                    current.filter((c) => c.id !== row.id),
                  )
                }
              >
                Remove criterion {index + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="quiet"
            disabled={criteria.length >= 30}
            onClick={() =>
              setCriteria((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  title: "",
                  max: "1",
                  descriptor: "",
                },
              ])
            }
          >
            Add rubric criterion
          </button>
        </fieldset>
        <p className="hint">
          Criterion points are normalized to the question’s maximum score. Human
          reviewers inspect the full rubric before approving a subjective
          question.
        </p>
        <button disabled={busy||submitting||encrypted.blocked}>Save immutable rubric</button>
      </form>
    </section>
  );
}
