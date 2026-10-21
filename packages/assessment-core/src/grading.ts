import {ContractError,isSubjective,object,scoreResponse,text,uuid,validateItem,validateKey} from './mod.ts';
export interface GradeScore {item_version_id:string;score:number|null;max_score:number;status:'scored'|'needs_human'}
export function scoreUnits(value:unknown,label='Score'):number{
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000000||Math.round(value*1e6)/1e6!==value)throw new ContractError('invalid_score',`${label} must be nonnegative with at most six decimal places`);
 return Math.round(value*1e6);
}
export function validateRubric(value:unknown){
 const raw=object(value);if(!Array.isArray(raw.criteria)||!raw.criteria.length||raw.criteria.length>30)throw new ContractError('invalid_rubric','Rubric requires 1–30 criteria');
 const criteria=raw.criteria.map(value=>{const row=object(value),max=scoreUnits(row.max_score,'Criterion maximum')/1e6;if(max<=0||max>1000)throw new ContractError('invalid_rubric','Criterion maximum must be positive and at most 1000');return {id:text(row.id,'Criterion ID',80),title:text(row.title,'Criterion title',200),descriptor:text(row.descriptor,'Descriptor',5000),max_score:max};});
 if(new Set(criteria.map(row=>row.id)).size!==criteria.length)throw new ContractError('invalid_rubric','Criterion IDs must be unique');return {title:text(raw.title,'Rubric title',200),criteria};
}
/** Deterministic worker report contains no keys, response text, candidate identity or caller-provided scores. */
export function gradeBundle(value:unknown){
 const raw=object(value),input_hash=text(raw.input_hash,'Input hash',64);if(!/^[a-f0-9]{64}$/.test(input_hash))throw new ContractError('invalid_grade_bundle','Invalid canonical input hash');
 if(!Array.isArray(raw.items)||!raw.items.length||raw.items.length>25000)throw new ContractError('invalid_grade_bundle','A grading bundle requires selected form items');
 const scores:GradeScore[]=raw.items.map(value=>{
  const entry=object(value),item=validateItem(entry.item);scoreUnits(item.max_score,'Item maximum');
  if(isSubjective(item.type))validateRubric(entry.rubric);
  const result=scoreResponse(item,validateKey(item,entry.key),entry.response);
  if(result.score!==null)scoreUnits(result.score);
  return {item_version_id:uuid(entry.item_version_id),...result};
 });
 if(new Set(scores.map(row=>row.item_version_id)).size!==scores.length)throw new ContractError('invalid_grade_bundle','Form item IDs must be unique');
 return {scorer_version:'assessment.scorer.v1' as const,input_hash,scores};
}
/** Criteria are normalized onto the item's maximum, e.g. four nine-point criteria -> a nine-point item. */
export function rubricScore(rubric:unknown,criteria:unknown,maxScore:number):number{
 const spec=validateRubric(rubric),given=object(criteria);if(Object.keys(given).length!==spec.criteria.length||spec.criteria.some(row=>!(row.id in given)))throw new ContractError('invalid_mark','Score every rubric criterion exactly once');
 let achieved=0n,maximum=0n;for(const row of spec.criteria){const score=scoreUnits(given[row.id]),max=scoreUnits(row.max_score);if(score>max)throw new ContractError('invalid_mark','Criterion score exceeds its maximum');achieved+=BigInt(score);maximum+=BigInt(max);}
 const numerator=BigInt(scoreUnits(maxScore))*achieved;return Number((numerator*2n+maximum)/(maximum*2n))/1e6;
}
