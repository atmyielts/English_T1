import {ContractError,object} from './mod.ts';
export interface BreakPolicy {
  schema_version:'assessment.break-policy.v1';
  clock:'stopped'|'running';
  max_breaks:number;
  max_seconds:number;
  total_seconds:number;
}
export const NO_BREAKS:BreakPolicy={schema_version:'assessment.break-policy.v1',clock:'stopped',max_breaks:0,max_seconds:0,total_seconds:0};
export function breakPolicy(value:unknown):BreakPolicy{
  const v=object(value),fields=['schema_version','clock','max_breaks','max_seconds','total_seconds'];
  const invalid=()=>{throw new ContractError('invalid_break_policy','Use a supported break policy with whole-second limits: up to 20 breaks, 3,600 seconds per break and 14,400 seconds total. Disabled breaks require all limits to be zero.');};
  if(Object.keys(v).some(k=>!fields.includes(k))||v.schema_version!=='assessment.break-policy.v1'||!['stopped','running'].includes(v.clock as string))invalid();
  for(const [name,max] of [['max_breaks',20],['max_seconds',3600],['total_seconds',14400]] as const){if(typeof v[name]!=='number'||!Number.isSafeInteger(v[name])||Number(v[name])<0||Number(v[name])>max)invalid();}
  if(v.max_breaks===0?(v.max_seconds!==0||v.total_seconds!==0):(Number(v.max_seconds)<1||Number(v.total_seconds)<Number(v.max_seconds)))invalid();
  return {schema_version:'assessment.break-policy.v1',clock:v.clock as BreakPolicy['clock'],max_breaks:Number(v.max_breaks),max_seconds:Number(v.max_seconds),total_seconds:Number(v.total_seconds)};
}
export interface BreakState {
  policy:BreakPolicy;revision:number;extra_seconds:number;used_breaks:number;used_seconds:number;
  active:{id:string;started_at:string;ends_at:string;clock:BreakPolicy['clock']}|null;
}
