import {ContractError} from './mod.ts';
/** Institution webhooks: event names, endpoint rules, signatures and retry
 * schedule. Payloads are thin (identifiers and type only); consumers read
 * details through authorized APIs, so a webhook never carries answers,
 * scores, keys or another tenant's data. */
export const WEBHOOK_EVENTS=['registration.created','attempt.submitted','result.released'] as const;
export type WebhookEvent=(typeof WEBHOOK_EVENTS)[number];
export const WEBHOOK_SIGNATURE_HEADER='Schood-Signature';
export const WEBHOOK_TOLERANCE_SECONDS=300;
export const WEBHOOK_MAX_ATTEMPTS=8;

/** Public HTTPS endpoints only: no credentials, IP literals, local or private
 * names, non-default ports or fragments. DNS rebinding is additionally
 * prevented by delivering from the edge network with redirects refused. */
export function webhookUrl(value:unknown):string{
  if(typeof value!=='string'||value.length>2048)throw new ContractError('invalid_webhook_url','Use a public HTTPS address under 2,048 characters.');
  let url:URL;try{url=new URL(value);}catch{throw new ContractError('invalid_webhook_url','Use a full HTTPS address, for example https://example.org/schood/webhooks.');}
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  const ipv4=/^\d{1,3}(\.\d{1,3}){3}$/.test(host),ipv6=host.startsWith('[')||host.includes(':');
  const local=host==='localhost'||/\.(localhost|local|internal|intranet|lan|home|corp|test|invalid|example)$/.test(host)||!host.includes('.');
  if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443')||ipv4||ipv6||local)
    throw new ContractError('invalid_webhook_url','Use a public HTTPS address with a domain name; local, private and IP addresses are not allowed.');
  return url.toString();
}
export function webhookEvents(value:unknown):WebhookEvent[]{
  if(!Array.isArray(value)||!value.length||value.length>WEBHOOK_EVENTS.length||new Set(value).size!==value.length||value.some(event=>!(WEBHOOK_EVENTS as readonly unknown[]).includes(event)))
    throw new ContractError('invalid_webhook_events','Choose one or more supported events.');
  return [...value].sort() as WebhookEvent[];
}
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
async function hmac(secret:string,message:string){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message)));
}
/** `t=<unix seconds>,v1=<hex>` with one v1 per active secret (rotation overlap). */
export async function signWebhook(secrets:string[],timestamp:number,body:string){
  if(!secrets.length)throw new ContractError('webhook_secret_missing','No signing secret is available.');
  const signatures=await Promise.all(secrets.map(secret=>hmac(secret,`${timestamp}.${body}`)));
  return [`t=${timestamp}`,...signatures.map(signature=>`v1=${signature}`)].join(',');
}
function constantTimeEqual(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
/** Reference verification for consumers and tests. */
export async function verifyWebhook(secret:string,header:string,body:string,now=Math.floor(Date.now()/1000),tolerance=WEBHOOK_TOLERANCE_SECONDS){
  const parts=header.split(',').map(part=>part.trim().split('=') as [string,string]);
  const timestamp=Number(parts.find(([name])=>name==='t')?.[1]);
  if(!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp)>tolerance)return false;
  const expected=await hmac(secret,`${timestamp}.${body}`);
  return parts.some(([name,value])=>name==='v1'&&typeof value==='string'&&constantTimeEqual(value,expected));
}
/** Seconds to wait after a failed attempt (1-based): 1m, 2m, 4m … capped at 6h, with ±20% jitter. */
export function webhookBackoff(attempt:number,random=Math.random()){
  const base=Math.min(60*2**Math.max(0,attempt-1),6*3600);
  return Math.round(base*(0.8+0.4*Math.min(1,Math.max(0,random))));
}
export function webhookDelivered(status:number){return status>=200&&status<300;}
