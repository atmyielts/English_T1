import {useEffect,useRef,useState} from 'react';
import {request} from '../client';
import {useI18n} from '../../../../packages/service-i18n/src/i18n.tsx';
import {useAppT,useErrorText} from '../i18n/index.ts';

interface Unit {id:string;state:'reserved'|'consumed'|'released';source_id:string;created_at:string;settled_at:string|null;adjustments:{action:string;reason:string;at:string}[]|null}
interface Summary {enforced:boolean;entitlement:{id:string;starts_at:string|null;ends_at:string|null;plan_id:string|null;limits:Record<string,unknown>}|null;period_start:string;period_end:string;attempt_limit:number|null;attempts_reserved:number;attempts_consumed:number;attempts_released:number;units:Unit[]}
/** Institution view of its Assessment Cloud plan and metered attempts.
 * Adjustments are made by Schood support; this screen only explains them. */
export function BillingWorkspace({tenant,actor}:{tenant:string;actor:string}){
  const t=useAppT(),errorText=useErrorText(),{date,number}=useI18n();
  const [summary,setSummary]=useState<Summary|null>(null),[units,setUnits]=useState<Unit[]>([]),[more,setMore]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const scope=`${tenant}:${actor}`,live=useRef(scope);live.current=scope;
  async function load(before?:Unit){
    const expected=scope;setBusy(true);setError('');
    try{
      const query=`billing/summary?limit=50${before?`&before=${encodeURIComponent(before.created_at)}&before_id=${before.id}`:''}`;
      const data=await request<Summary>(query,tenant,undefined,undefined,undefined,actor);
      if(live.current!==expected)return;
      if(!before)setSummary(data);
      setUnits(current=>before?[...current,...data.units]:data.units);setMore(data.units.length===50);
    }catch(cause){if(live.current===expected)setError(errorText(cause));}
    finally{if(live.current===expected)setBusy(false);}
  }
  useEffect(()=>{setSummary(null);setUnits([]);void load();},[scope]);
  const used=summary?summary.attempts_reserved+summary.attempts_consumed:0;
  const state=(unit:Unit)=>t(unit.state==='reserved'?'billing.unit.reserved':unit.state==='consumed'?'billing.unit.consumed':'billing.unit.released');
  return <section className="billing" aria-labelledby="billing-heading">
    <h2 id="billing-heading">{t('billing.title')}</h2>
    {error&&<p role="alert" className="error">{error}</p>}
    {!summary?(!error&&<p role="status">{t('billing.loading')}</p>):<>
      <div className="billing-plan">
        <h3>{t('billing.plan')}</h3>
        {summary.entitlement?<p>{summary.entitlement.ends_at?t('billing.activeUntil',{date:date(summary.entitlement.ends_at,{dateStyle:'medium'})}):t('billing.activeOpen')}</p>:<p>{t('billing.noPlan')}</p>}
        <p className="hint">{summary.enforced?t('billing.enforced'):t('billing.notEnforced')}</p>
      </div>
      <div className="billing-usage">
        <h3>{t('billing.period',{start:date(summary.period_start,{dateStyle:'medium'}),end:date(Date.parse(summary.period_end)-86400000,{dateStyle:'medium'})})}</h3>
        <p className="billing-meter">{summary.attempt_limit===null?t('billing.usedUnlimited',{used:number(used)}):t('billing.usedOf',{used:number(used),limit:number(summary.attempt_limit)})}</p>
        {summary.attempt_limit!==null&&<progress max={summary.attempt_limit} value={Math.min(used,summary.attempt_limit)} aria-label={t('billing.meterLabel')}/>}
        <p className="hint">{t('billing.breakdown',{reserved:number(summary.attempts_reserved),consumed:number(summary.attempts_consumed),released:number(summary.attempts_released)})}</p>
        <p className="hint">{t('billing.howCounted')}</p>
      </div>
      <h3>{t('billing.units')}</h3>
      {!units.length&&<p>{t('billing.noUnits')}</p>}
      <ul className="records">{units.map(unit=><li key={unit.id}>
        <strong>{state(unit)}</strong>
        <span>{t('billing.unitLine',{attempt:unit.source_id,date:date(unit.created_at)})}</span>
        {(unit.adjustments??[]).map((adjustment,index)=><span key={index}>{t(adjustment.action==='release'?'billing.adjustment.release':'billing.adjustment.restore',{date:date(adjustment.at),reason:adjustment.reason})}</span>)}
      </li>)}</ul>
      {more&&<button className="quiet" disabled={busy} onClick={()=>void load(units[units.length-1])}>{t('billing.more')}</button>}
      <p className="hint">{t('billing.support')}</p>
    </>}
  </section>;
}
