import React,{useEffect,useState} from 'react';
import type {DraftStatus as Status} from './useEncryptedDraft';
import {useWebT} from './i18n/useWebT.ts';
import {localizeText} from './i18n/translate.ts';
export function DraftStatus({status,problem,loadSaved,discard,retry,disabled=false}:{status:Status;problem:string;loadSaved:()=>Promise<void>;discard:()=>Promise<void>;retry:()=>Promise<unknown>;disabled?:boolean}){
 const t=useWebT();const [choice,setChoice]=useState<'adopt'|'discard'|null>(null);useEffect(()=>{setChoice(null);},[status]);
 const failed=['conflict','changed','error'].includes(status);
 return <div className="encrypted-draft-status">
 {failed?<><p role="alert">{t('draft.status.failed',{problem:localizeText(problem,t)})}</p><div className="author-actions">{status!=='error'&&<button type="button" className="quiet" disabled={disabled} onClick={()=>setChoice('adopt')}>{t('draft.status.restore')}</button>}{status==='error'&&<button type="button" className="quiet" disabled={disabled} onClick={()=>void retry()}>{t('draft.status.retry')}</button>}</div></>:<p role="status">{t(status==='loading'?'draft.status.loading':status==='saving'?'draft.status.saving':status==='saved'?'draft.status.saved':'draft.status.idle')}</p>}
 {(failed||status==='saved')&&<button type="button" className="quiet" disabled={disabled} onClick={()=>setChoice('discard')}>{t('draft.status.discard')}</button>}
 {choice&&<div role="alert"><p>{t(choice==='adopt'?'draft.status.adoptQuestion':'draft.status.discardQuestion')}</p><div className="author-actions"><button type="button" disabled={disabled} onClick={()=>{const action=choice==='adopt'?loadSaved:discard;setChoice(null);void action();}}>{t(choice==='adopt'?'draft.status.confirmAdopt':'draft.status.confirmDiscard')}</button><button type="button" className="quiet" disabled={disabled} onClick={()=>setChoice(null)}>{t('draft.status.keep')}</button></div></div>}
 </div>;
}
