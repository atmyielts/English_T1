type Db={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>};
type Claim={outcome:string;notification_id:string;claim_token:string;channel:string;target:string|null;title:string|null;body:string};
export type ParentProviderResult={outcome:'sent'|'failed'|'unknown'|'unconfigured';providerId?:string};

// The provider runs immediately after the current-consent claim. External sends
// already in flight cannot be cancelled by a later revocation. They retain their
// actual outcome; uncertain outcomes require review rather than automatic resend.
export async function dispatchGuardianNotification(db:Db,id:string,provider:(claim:Claim)=>Promise<ParentProviderResult>){
 const claimed=await db.rpc('academy_guardian_delivery_claim',{p_notification_id:id});
 if(claimed.error||!claimed.data||typeof claimed.data!=='object')throw Error('Parent delivery consent could not be confirmed');
 const claim=claimed.data as Claim;
 if(claim.notification_id!==id)throw Error('Parent delivery identity changed');
 if(claim.outcome!=='send')return claim.outcome;
 if(!claim.claim_token||!['telegram','email','sms','inapp'].includes(claim.channel)||typeof claim.body!=='string')throw Error('Parent delivery claim is incomplete');
 let result:ParentProviderResult;
 try{result=claim.channel==='inapp'?{outcome:'sent'}:await provider(claim);}catch{result={outcome:'unknown'};}
 const saved=await db.rpc('academy_guardian_delivery_complete',{p_notification_id:id,p_claim_token:claim.claim_token,p_outcome:result.outcome,p_provider_id:result.providerId??null});
 if(saved.error)throw Error('Parent delivery outcome requires review');
 return result.outcome;
}

export async function sendParentTelegram(token:string,claim:{target:string|null;title:string|null;body:string},transport:typeof fetch=fetch):Promise<ParentProviderResult>{
 if(!token)return {outcome:'unconfigured'};
 try{
  const response=await transport(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({chat_id:claim.target,text:[claim.title,claim.body].filter(Boolean).join('\n'),disable_web_page_preview:true}),signal:AbortSignal.timeout(20000)});
  const body=await response.json();
  if(body?.ok===true&&Number.isSafeInteger(body.result?.message_id))return {outcome:'sent',providerId:String(body.result.message_id)};
  if(body?.ok===false&&typeof body.error_code==='number')return {outcome:'failed'};
  return {outcome:'unknown'};
 }catch{return {outcome:'unknown'};}
}

// A successful gateway response records provider acceptance, not handset delivery.
export async function sendParentSms(url:string,token:string,claim:{target:string|null;title:string|null;body:string;notification_id:string},transport:typeof fetch=fetch):Promise<ParentProviderResult>{
 if(!url||!token)return {outcome:'unconfigured'};
 try{const endpoint=new URL(url);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)return {outcome:'unconfigured'};}catch{return {outcome:'unconfigured'};}
 if(!claim.target||!/^\+?[0-9]{7,15}$/.test(claim.target))return {outcome:'failed'};
 try{
  const response=await transport(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':claim.notification_id},
   body:JSON.stringify({phone:claim.target,message:[claim.title,claim.body].filter(Boolean).join('\n'),reference:claim.notification_id}),signal:AbortSignal.timeout(20000)});
  if(response.status>=400&&response.status<500)return {outcome:'failed'};
  if(!response.ok)return {outcome:'unknown'};
  const body=await response.json().catch(()=>null);
  return {outcome:'sent',...(typeof body?.id==='string'||Number.isSafeInteger(body?.id)?{providerId:String(body.id)}:{})};
 }catch{return {outcome:'unknown'};}
}
