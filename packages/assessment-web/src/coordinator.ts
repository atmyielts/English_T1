import {supabase} from './client';
import {AttemptRuntime,type LeaseCredentials,type RuntimeResult,type RuntimeSnapshot,type RuntimeStatus} from './runtime';
const endpoint=import.meta.env.VITE_ASSESSMENT_COORDINATOR_URL as string|undefined;
export function assertCoordinatorReady(){
  if(!endpoint)throw new Error('The exam coordinator has not been configured. Contact your institution before starting.');
  const target=new URL(endpoint);
  if(target.username||target.password||target.search||target.hash||!(target.protocol==='https:'||(target.protocol==='http:'&&['localhost','127.0.0.1'].includes(target.hostname))))throw new Error('The exam coordinator address is not valid.');
  if(!navigator.locks||!crypto.subtle)throw new Error('This browser cannot protect a single active exam tab. Use a supported browser.');
  const probe='schood-exam-storage-probe:'+crypto.randomUUID();try{sessionStorage.setItem(probe,'1');sessionStorage.removeItem(probe);}catch{throw new Error('Enable browser session storage before starting this assessment.');}
}
async function holdTab(scope:string):Promise<()=>void>{
  let release!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  let resolve!: (value:()=>void)=>void,reject!:(reason:unknown)=>void;
  const ready=new Promise<()=>void>((yes,no)=>{resolve=yes;reject=no;});
  void navigator.locks.request(`schood-exam:${scope}`,{ifAvailable:true},async lock=>{if(!lock){reject(new Error('This assessment is already open in another tab. Close that tab before resuming here.'));return;}resolve(release);await held;}).catch(reject);
  return ready;
}
export async function openCoordinator(tenant:string,actor:string,attempt:string,changed:(snapshot:RuntimeSnapshot)=>void,status:(status:RuntimeStatus)=>void){
  assertCoordinatorReady();const scope=`${tenant}:${actor}:${attempt}`,release=await holdTab(scope),storageKey=`schood-exam-lease:${scope}`;
  try{
    const stored=sessionStorage.getItem(storageKey);
    const initial:LeaseCredentials=stored?JSON.parse(stored):{device_id:crypto.randomUUID(),token:Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('')};
    if(!/^[a-f0-9]{64}$/.test(initial.token)||! /^[a-f0-9-]{36}$/i.test(initial.device_id))throw new Error('Exam device data is invalid. Contact your institution.');
    sessionStorage.setItem(storageKey,JSON.stringify(initial));
    async function send(action?:string,data?:Record<string,unknown>,key?:string):Promise<RuntimeResult>{
      const {data:auth}=await supabase!.auth.getSession();
      if(!auth.session||auth.session.user.id!==actor)throw new Error('Sign in to the original candidate account before continuing.');
      const url=new URL(`${endpoint!.replace(/\/$/,'')}/attempts/${attempt}/${action?'commands':'state'}`);url.searchParams.set('tenant_id',tenant);
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetch(url,{method:action?'POST':'GET',signal:controller.signal,cache:'no-store',headers:{Authorization:`Bearer ${auth.session.access_token}`,...(action?{'Content-Type':'application/json','Idempotency-Key':key!}:{})},...(action?{body:JSON.stringify({action,data})}:{})});
        const payload=await response.json();if(!response.ok)throw new Error(payload.error??'The exam connection could not be verified.');return payload.data as RuntimeResult;
      }finally{clearTimeout(timer);}
    }
    const runtime=new AttemptRuntime({state:()=>send(),command:(action,data,key)=>send(action,data,key)},{read:()=>({...initial}),write:value=>sessionStorage.setItem(storageKey,JSON.stringify(value))},changed,status);
    return {runtime,close(){runtime.close();release();}};
  }catch(cause){release();throw cause;}
}
