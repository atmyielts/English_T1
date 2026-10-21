import { useEffect,useRef,useState } from 'react';
import { proctorRequest } from '../../../packages/assessment-web/src/client';
import { ProctorJournal } from '../../../packages/proctor-web/src/journal';
import { ProctorRuntime } from '../../../packages/proctor-web/src/runtime';
import { attachBrowserSignals } from '../../../packages/proctor-web/src/browser';
import type { CandidateProctorState,MonitoringStatus } from '../../../packages/proctor-web/src/types';
import {useAppT} from './i18n/index.ts';
import {errorText} from '../../../packages/assessment-web/src/i18n/errors.ts';
export function useProctor(tenant:string,user:string,attemptId:string,initial:CandidateProctorState|null,onState:(state:CandidateProctorState)=>void) {
  const [status,setStatus]=useState<MonitoringStatus>({pending:0,problem:null}),[notices,setNotices]=useState<CandidateProctorState['notices']>([]);
  const runtime=useRef<ProctorRuntime|null>(null),callback=useRef(onState);callback.current=onState;
  const t=useAppT(),translate=useRef(t);translate.current=t;
  const sessionId=initial?.session?.id??'';
  useEffect(()=>{
    let active=true,detach:(()=>void)|undefined,timer:ReturnType<typeof setInterval>|undefined,instance:ProctorRuntime|undefined;
    setStatus({pending:0,problem:null});setNotices(initial?.notices??[]);
    if(!sessionId||!attemptId||!user)return;
    void(async()=>{
      const journal=await ProctorJournal.create(`${tenant}:${user}:${sessionId}`);
      if(!active){journal.close();return;}
      instance=new ProctorRuntime(sessionId,journal,{state:()=>proctorRequest<CandidateProctorState>(`candidate/session?attempt_id=${attemptId}`,tenant,undefined,undefined,user),command:(action,data,key)=>proctorRequest('commands',tenant,{action,data},key,user)},state=>{if(active){setNotices(state.notices);callback.current(state);}},value=>{if(active)setStatus(value);});
      runtime.current=instance;await instance.tick();if(!active)return;
      detach=attachBrowserSignals(instance);
      timer=setInterval(()=>void instance!.tick().catch(cause=>{if(active)setStatus(current=>({...current,problem:cause.message}));}),5000);
    })().catch(cause=>{if(active)setStatus({pending:0,problem:translate.current('exam.monitoring.startFailed',{reason:errorText(cause,translate.current)})});});
    const online=()=>void instance?.tick().catch(cause=>{if(active)setStatus(current=>({...current,problem:cause.message}));});window.addEventListener('online',online);
    return()=>{active=false;detach?.();if(timer)clearInterval(timer);window.removeEventListener('online',online);if(runtime.current===instance)runtime.current=null;void instance?.close();};
  },[tenant,user,attemptId,sessionId]);
  return {status,notices,enabled:Boolean(sessionId),acknowledge:async(id:string)=>{if(runtime.current)await runtime.current.acknowledge(id);},sync:async()=>{if(runtime.current)await runtime.current.tick();}};
}
