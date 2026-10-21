import React,{useEffect,useState} from 'react';
import type {DraftStatus as Status} from './useEncryptedDraft';
export function DraftStatus({status,problem,loadSaved,discard,retry,disabled=false}:{status:Status;problem:string;loadSaved:()=>Promise<void>;discard:()=>Promise<void>;retry:()=>Promise<unknown>;disabled?:boolean}){
 const [choice,setChoice]=useState<'adopt'|'discard'|null>(null);useEffect(()=>{setChoice(null);},[status]);
 const failed=['conflict','changed','error'].includes(status);
 return <div className="encrypted-draft-status">
 {failed?<><p role="alert">{problem} This local draft has not been submitted or approved.</p><div className="author-actions">{status!=='error'&&<button type="button" className="quiet" disabled={disabled} onClick={()=>setChoice('adopt')}>Restore saved draft for review</button>}{status==='error'&&<button type="button" className="quiet" disabled={disabled} onClick={()=>void retry()}>Retry encrypted draft save</button>}</div></>:<p role="status">{status==='loading'?'Checking encrypted device draft…':status==='saving'?'Saving encrypted device draft…':status==='saved'?'Draft saved encrypted on this device. It is not submitted or approved.':'Edits will be saved encrypted on this device. They are not submitted or approved.'}</p>}
 {(failed||status==='saved')&&<button type="button" className="quiet" disabled={disabled} onClick={()=>setChoice('discard')}>Discard saved device draft</button>}
 {choice&&<div role="alert"><p>{choice==='adopt'?'Replace this open form with the newest saved draft and review it against the current source?':'Delete this saved device draft? This does not delete recorded institution data.'}</p><div className="author-actions"><button type="button" disabled={disabled} onClick={()=>{const action=choice==='adopt'?loadSaved:discard;setChoice(null);void action();}}>{choice==='adopt'?'Confirm draft restoration':'Confirm device draft deletion'}</button><button type="button" className="quiet" disabled={disabled} onClick={()=>setChoice(null)}>Keep current draft</button></div></div>}
 </div>;
}
