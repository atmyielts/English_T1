import {useEffect,useRef,useState} from 'react';
import {ResponseJournal} from '../../../packages/assessment-web/src/journal';
import {breakCommands,breakProblem} from '../../../packages/assessment-web/src/breaks';
import type {GradeCommands,GradeIntent} from '../../../packages/assessment-web/src/grade-command';
import type {AttemptRuntime} from '../../../packages/assessment-web/src/runtime';

/** Candidate break requests are durable per account and attempt: a lost reply is
 * retried with its saved key, and a reload offers that same request back instead
 * of silently creating another break. */
export function useBreaks(tenant:string,actor:string,attemptId:string,runtime:()=>AttemptRuntime|null,beforeBegin:()=>Promise<void>){
  const [pending,setPending]=useState<GradeIntent|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
  const engine=useRef<{commands:GradeCommands;journal:ResponseJournal;scope:string}|null>(null);
  const scope=`breaks:${tenant}:${actor}:${attemptId}`,live=useRef(scope);live.current=scope;
  useEffect(()=>{
    let active=true;engine.current=null;setPending(null);setError('');setReady(false);setBusy(false);
    if(!tenant||!actor||!attemptId)return;
    if(!navigator.locks){setError('Use a browser with secure workspace locking to take approved breaks.');return;}
    void ResponseJournal.create(scope).then(async journal=>{
      if(!active){journal.close();return;}
      const commands=breakCommands(journal,intent=>{
        const current=runtime();
        if(!current)return Promise.reject(new Error('Reconnect to the exam before confirming the break.'));
        return current.command(intent.action as 'break.begin'|'break.end',intent.data,intent.key);
      },async <T,>(work:()=>Promise<T>):Promise<T>=>await navigator.locks.request(`schood-exam-${scope}`,work));
      engine.current={commands,journal,scope};
      const saved=await commands.pending();
      if(active){setPending(saved);setReady(true);}
    }).catch(cause=>{if(active)setError(`Break requests cannot be saved on this device: ${cause instanceof Error?cause.message:String(cause)}`);});
    return()=>{active=false;engine.current?.journal.close();engine.current=null;};
  },[scope]);
  async function perform(work:(commands:GradeCommands)=>Promise<unknown>){
    const current=engine.current,expected=scope;
    if(!current||current.scope!==expected)throw new Error('Break requests are still opening on this device.');
    setBusy(true);setError('');
    try{await work(current.commands);}
    catch(cause){
      // The break already ended (elapsed, paused or finalized): that request is resolved.
      if(!(cause instanceof Error&&cause.message==='break_not_active')&&live.current===expected)setError(breakProblem(cause));
    }finally{
      if(live.current===expected&&engine.current===current){setPending(await current.commands.pending().catch(()=>null));setBusy(false);}
    }
  }
  return {
    pending,error,busy,ready,
    begin:()=>perform(async commands=>{await beforeBegin();await commands.execute('break.begin',{});}),
    end:(breakId:string)=>perform(commands=>commands.execute('break.end',{break_id:breakId})),
    retry:()=>perform(commands=>commands.retry()),
  };
}
