import {RuntimeError,type RecoveryTicket} from './protocol.ts';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function recoveryTicket(input:unknown):RecoveryTicket{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new RuntimeError(422,'invalid_recovery_ticket','Expected a recovery ticket');const value=input as Record<string,unknown>;
 if(value.schema_version!=='assessment.recovery.v1'||!uuid.test(String(value.tenant_id))||!uuid.test(String(value.attempt_id))||!uuid.test(String(value.lease_token))||typeof value.revision!=='number'||!Number.isSafeInteger(value.revision)||value.revision<1||value.revision>1000000)throw new RuntimeError(422,'invalid_recovery_ticket','Invalid recovery ticket');
 return {schema_version:'assessment.recovery.v1',tenant_id:String(value.tenant_id),attempt_id:String(value.attempt_id),revision:value.revision,lease_token:String(value.lease_token)};
}
export interface RecoveryProducer {sendBatch(messages:{body:RecoveryTicket;contentType:'json'}[]):Promise<unknown>}
export async function dispatchRecovery(claim:(limit:number)=>Promise<unknown>,queue:RecoveryProducer,maxBatches=200,now=()=>Date.now()){
 if(!Number.isSafeInteger(maxBatches)||maxBatches<1||maxBatches>200)throw new RuntimeError(503,'recovery_configuration','Recovery batch limit must be 1–200');
 const began=now();let sent=0;
 for(let batch=0;batch<maxBatches&&now()-began<50000;batch++){
  const value=await claim(100);if(!Array.isArray(value)||value.length>100)throw new RuntimeError(502,'invalid_recovery_claim','Invalid canonical recovery batch');if(!value.length)break;
  const messages=value.map(row=>({body:recoveryTicket(row),contentType:'json' as const}));await queue.sendBatch(messages);sent+=messages.length;
  if(messages.length<100)break;
 }
 return sent;
}
export interface RecoveryMessage {body:unknown;attempts:number;ack():void;retry(options:{delaySeconds:number}):void}
/** Per-message outcomes isolate failures. Never acknowledge before canonical recovery and DO persistence. */
export async function consumeRecovery(messages:readonly RecoveryMessage[],recover:(ticket:RecoveryTicket)=>Promise<void>,event:(outcome:'processed'|'retry',code:string)=>void=()=>{}){
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(8,messages.length)},async()=>{
  while(cursor<messages.length){const message=messages[cursor++];try{await recover(recoveryTicket(message.body));message.ack();event('processed','ok');}catch(cause){message.retry({delaySeconds:Math.min(30*2**Math.min(message.attempts,5),900)});event('retry',cause instanceof RuntimeError?cause.code:'recovery_unavailable');}}
 }));
}
