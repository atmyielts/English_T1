import { createClient } from '@supabase/supabase-js';
import {watchAccount} from './account-watch';
import {LocalizedError,english} from './i18n/translate.ts';
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = Boolean(url && anon);
// Uses the established Schood cookie format without importing Academy application code.
const cookies = {
  getItem(key: string) {
    const read = (name: string) => document.cookie.split('; ').find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
    const count = Number(read(`${key}.__chunks`) ?? 0);
    if (count > 100) return null;
    let encoded = count ? '' : read(key);
    for (let i = 0; i < count; i++) { const part = read(`${key}.${i}`); if (!part) return null; encoded += part; }
    try { return encoded ? decodeURIComponent(encoded) : null; } catch { return null; }
  },
  setItem(key: string, value: string) {
    this.removeItem(key);
    const encoded = encodeURIComponent(value);
    const count = Math.ceil(encoded.length / 2000);
    const domain = import.meta.env.VITE_AUTH_SHARED_COOKIE === 'true' ? import.meta.env.VITE_AUTH_COOKIE_DOMAIN : undefined;
    const suffix = `; Path=/; SameSite=Lax; Max-Age=2592000${location.protocol === 'https:' ? '; Secure' : ''}${domain ? `; Domain=${domain}` : ''}`;
    if (count <= 1) document.cookie = `${key}=${encoded}${suffix}`;
    else { document.cookie = `${key}.__chunks=${count}${suffix}`; for (let i = 0; i < count; i++) document.cookie = `${key}.${i}=${encoded.slice(i * 2000, (i + 1) * 2000)}${suffix}`; }
  },
  removeItem(key: string) {
    const names = document.cookie.split('; ').map(value => value.split('=')[0]).filter(name => name === key || name.startsWith(`${key}.`));
    for (const name of names) { document.cookie = `${name}=; Path=/; Max-Age=0`; if (import.meta.env.VITE_AUTH_COOKIE_DOMAIN) document.cookie = `${name}=; Path=/; Max-Age=0; Domain=${import.meta.env.VITE_AUTH_COOKIE_DOMAIN}`; }
  },
};
export const supabase = configured ? createClient(url!, anon!, { auth: { storage: cookies, storageKey: 'schood-auth', persistSession: true, autoRefreshToken: true } }) : null;
export function observeAccount(changed:(actor:string)=>void){
  if(!supabase)return()=>{};
  const watcher=watchAccount({async current(){const {data}=await supabase!.auth.getSession();return data.session?.user.id??'';},subscribe(publish){const {data}=supabase!.auth.onAuthStateChange((_event,session)=>publish(session?.user.id??''));return()=>data.subscription.unsubscribe();}},changed);
  const check=()=>void watcher.check(),timer=setInterval(check,5000);
  check();window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
  return()=>{clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);watcher.close();};
}
export type Row = Record<string, unknown> & { id?: string };
export class ServiceRequestError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
export async function request<T>(path: string, tenant?: string, command?: { action: string; data: unknown }, revision?: number, idempotencyKey?: string, expectedActor?:string): Promise<T> {
  return serviceRequest<T>('assessment-cloud', path, tenant, command, revision, idempotencyKey,expectedActor);
}
/** A plain JSON POST outside the command envelope (no idempotency key needed). */
export async function postJson<T>(path: string, body: Record<string, unknown>, expectedActor?: string): Promise<T> {
  return serviceRequest<T>('assessment-cloud', path, undefined, body as unknown as { action: string; data: unknown }, undefined, undefined, expectedActor);
}
export async function proctorRequest<T>(path: string, tenant?: string, command?: { action: string; data: unknown }, idempotencyKey?: string, expectedActor?:string): Promise<T> {
  return serviceRequest<T>('proctor', path, tenant, command, undefined, idempotencyKey,expectedActor);
}
async function serviceRequest<T>(service: 'assessment-cloud' | 'proctor', path: string, tenant?: string, command?: { action: string; data: unknown }, revision?: number, idempotencyKey?: string,expectedActor?:string): Promise<T> {
  if (!supabase) throw new LocalizedError("client.unconfigured");
  const { data } = await supabase!.auth.getSession();
  if (!data.session) throw new LocalizedError("common.signIn");
  if(expectedActor&&data.session.user.id!==expectedActor)throw new LocalizedError("common.accountChanged");
  const headers: Record<string, string> = { Authorization: `Bearer ${data.session.access_token}`, apikey: anon!, 'Content-Type': 'application/json' };
  if (command) headers['Idempotency-Key'] = idempotencyKey ?? crypto.randomUUID();
  if (revision) headers['If-Match'] = String(revision);
  const endpoint = new URL(`${url}/functions/v1/${service}/${path}`);
  if (tenant) endpoint.searchParams.set('tenant_id', tenant);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const response=await fetch(endpoint,{method:command?'POST':'GET',headers,signal:controller.signal,...(command?{body:JSON.stringify(command)}:{})});const payload=await response.json();if(!response.ok)throw new ServiceRequestError(response.status,payload.code??'request_failed',payload.error??english('client.requestFailed'));return payload.data as T;}finally{clearTimeout(timer);}
}
