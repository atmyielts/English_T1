import {useEffect,useState} from 'react';
import {pendingOperational,retryOperational} from '../../lib/operationalRequest';
import {translate} from '../../i18n';

export function OperationalPendingNotice({academyId,actorId,onRecovered}:{academyId:string;actorId:string;onRecovered:()=>Promise<unknown>}){
 const [pending,setPending]=useState(()=>pendingOperational(academyId,actorId));const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const sync=()=>setPending(pendingOperational(academyId,actorId));sync();window.addEventListener('schood-operational-pending',sync);return()=>window.removeEventListener('schood-operational-pending',sync);},[academyId,actorId]);
 if(!pending)return null;
 const payload=pending.payload,label=pending.command==='create_lead'?'Save lead':pending.command==='teacher_lesson_start'?'Start lesson':pending.command==='teacher_lesson_attendance'?'Save attendance':'Finish lesson';
 return <section className="info-banner" role="status"><div><strong>{translate('A saved change still needs confirmation.')}</strong><p>{translate(label)}{pending.command==='create_lead'?`: ${String(payload.full_name??'')} · ${String(payload.phone??'')} · ${String(payload.interested_course??'')}`:pending.command==='teacher_lesson_attendance'?` · ${Array.isArray(payload.records)?payload.records.length:0} ${translate('Students')}`:''}</p>{error?<p role="alert">{translate(error)}</p>:null}<button type="button" className="small-btn" disabled={busy} onClick={()=>{if(busy)return;setBusy(true);setError('');void retryOperational(academyId,actorId).then(onRecovered).catch(reason=>setError(reason instanceof Error?reason.message:String(reason))).finally(()=>{setBusy(false);setPending(pendingOperational(academyId,actorId));});}}>{translate(busy?'Saving…':'Retry saving')}</button></div></section>;
}
