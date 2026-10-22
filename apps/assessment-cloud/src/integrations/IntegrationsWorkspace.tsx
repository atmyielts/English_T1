import {useEffect,useRef,useState} from 'react';
import {request} from '../client';
import {useI18n} from '../../../../packages/service-i18n/src/i18n.tsx';
import {useAppT,useErrorText} from '../i18n/index.ts';

const EVENTS=['registration.created','attempt.submitted','result.released'] as const;
const SCOPES=['registrations:read','registrations:write','results:read','events:read'] as const;
interface Endpoint {id:string;url:string;events:string[];state:'active'|'disabled';revision:number;secret_version:number;rotating_until:string|null;created_at:string}
interface Delivery {id:string;endpoint_id:string;state:'pending'|'delivering'|'delivered'|'dead';attempts:number;next_attempt_at:string;last_status:number|null;last_error:string|null;delivered_at:string|null;created_at:string;event_type:string;sequence:number}
interface Client {id:string;name:string;scopes:string[];state:'active'|'revoked';revision:number;created_at:string;secrets:{hint:string;created_at:string;expires_at:string|null}[]|null}
interface Revealed {label:string;id:string;secret:string|null}

/** Institution webhooks and API clients. Secrets are shown once and never stored here. */
export function IntegrationsWorkspace({tenant,actor}:{tenant:string;actor:string}){
  const t=useAppT(),errorText=useErrorText(),{date}=useI18n();
  const [endpoints,setEndpoints]=useState<Endpoint[]>([]),[clients,setClients]=useState<Client[]>([]),[deliveries,setDeliveries]=useState<Record<string,Delivery[]>>({});
  const [url,setUrl]=useState(''),[events,setEvents]=useState<string[]>([...EVENTS]),[name,setName]=useState(''),[scopes,setScopes]=useState<string[]>(['events:read','results:read']);
  const [hooksProblem,setHooksProblem]=useState(''),[clientsProblem,setClientsProblem]=useState('');
  const [revealed,setRevealed]=useState<Revealed|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const scope=`${tenant}:${actor}`,live=useRef(scope),keys=useRef<Record<string,string>>({});live.current=scope;
  const get=<T,>(path:string)=>request<T>(path,tenant,undefined,undefined,undefined,actor);
  async function refresh(){
    const expected=scope;
    // Each section loads on its own: one being disabled must not hide the other.
    await Promise.all([
      get<Endpoint[]>('webhooks/endpoints').then(rows=>{if(live.current===expected){setEndpoints(rows);setHooksProblem('');}}).catch(cause=>{if(live.current===expected)setHooksProblem(errorText(cause));}),
      get<Client[]>('api-clients').then(rows=>{if(live.current===expected){setClients(rows);setClientsProblem('');}}).catch(cause=>{if(live.current===expected)setClientsProblem(errorText(cause));}),
    ]);
  }
  useEffect(()=>{setEndpoints([]);setClients([]);setDeliveries({});setRevealed(null);setError('');setNotice('');void refresh();},[scope]);
  // One stable key per intended change, so a retried click after a lost reply replays it.
  async function command<T,>(path:string,intent:string,action:string,data:Record<string,unknown>,done:string,after?:(result:T)=>void){
    const expected=scope;setBusy(true);setError('');setNotice('');
    keys.current[intent]??=crypto.randomUUID();
    try{
      const result=await request<T>(path,tenant,{action,data},undefined,keys.current[intent],actor);
      delete keys.current[intent];
      if(live.current!==expected)return;
      after?.(result);setNotice(done);await refresh();
    }catch(cause){if(live.current===expected)setError(errorText(cause));}
    finally{if(live.current===expected)setBusy(false);}
  }
  const toggle=(list:string[],value:string)=>list.includes(value)?list.filter(item=>item!==value):[...list,value];
  async function history(endpoint:Endpoint){
    try{const rows=await get<Delivery[]>(`webhooks/deliveries?endpoint_id=${endpoint.id}&limit=20`);setDeliveries(current=>({...current,[endpoint.id]:rows}));}
    catch(cause){setError(errorText(cause));}
  }
  const deliveryState=(row:Delivery)=>t(row.state==='delivered'?'integrations.delivery.delivered':row.state==='dead'?'integrations.delivery.dead':row.state==='delivering'?'integrations.delivery.delivering':'integrations.delivery.pending');
  return <section className="integrations" aria-labelledby="integrations-heading">
    <h2 id="integrations-heading">{t('integrations.title')}</h2>
    <p className="hint">{t('integrations.intro')}</p>
    {error&&<p role="alert" className="error">{error}</p>}
    {notice&&<p role="status" className="notice">{notice}</p>}
    {revealed&&<div className="secret-once" role="region" aria-label={t('integrations.secret.region')}>
      <h3>{revealed.label}</h3>
      {revealed.secret?<><p>{t('integrations.secret.once')}</p><code className="secret-value">{revealed.secret}</code><p className="hint">{t('integrations.secret.id',{id:revealed.id})}</p></>:<p>{t('integrations.secret.unavailable')}</p>}
      <button className="quiet" onClick={()=>setRevealed(null)}>{t('integrations.secret.hide')}</button>
    </div>}

    <h3>{t('integrations.webhooks')}</h3>
    {hooksProblem&&<p role="status">{hooksProblem}</p>}
    <form className="editor" aria-label={t('integrations.webhook.add')} onSubmit={event=>{event.preventDefault();void command<Endpoint&{signing_secret?:string}>('webhooks/commands',`create:${url}:${events.join(',')}`,'endpoint.create',{url,events},t('integrations.webhook.created'),result=>{setRevealed({label:t('integrations.webhook.secretTitle'),id:result.id,secret:result.signing_secret??null});setUrl('');});}}>
      <label>{t('integrations.webhook.url')}<input type="url" required value={url} placeholder="https://hooks.example.org/schood" onChange={event=>setUrl(event.target.value)}/></label>
      <fieldset><legend>{t('integrations.webhook.events')}</legend>{EVENTS.map(name=><label key={name} className="check"><input type="checkbox" checked={events.includes(name)} onChange={()=>setEvents(current=>toggle(current,name))}/> {t(`integrations.event.${name}` as never)}</label>)}</fieldset>
      <button disabled={busy||!events.length}>{t('integrations.webhook.add')}</button>
    </form>
    {!endpoints.length&&<p>{t('integrations.webhook.none')}</p>}
    <ul className="records">{endpoints.map(endpoint=><li key={endpoint.id}>
      <strong>{endpoint.url}</strong>
      <span>{t(endpoint.state==='active'?'integrations.state.active':'integrations.state.disabled')} · {endpoint.events.map(name=>t(`integrations.event.${name}` as never)).join(', ')} · {t('integrations.webhook.secretVersion',{version:endpoint.secret_version})}{endpoint.rotating_until?' · '+t('integrations.webhook.rotating',{date:date(endpoint.rotating_until)}):''}</span>
      <div className="actions">
        <button className="quiet" disabled={busy} onClick={()=>void history(endpoint)}>{t('integrations.webhook.history')}</button>
        {endpoint.state==='active'&&<>
          <button className="quiet" disabled={busy} onClick={()=>void command<Endpoint&{signing_secret?:string;signing_secret_unavailable?:boolean}>('webhooks/commands',`rotate:${endpoint.id}:${endpoint.revision}`,'endpoint.rotate',{endpoint_id:endpoint.id,revision:endpoint.revision},t('integrations.webhook.rotated'),result=>setRevealed({label:t('integrations.webhook.secretTitle'),id:endpoint.id,secret:result.signing_secret??null}))}>{t('integrations.webhook.rotate')}</button>
          <button className="quiet" disabled={busy} onClick={()=>void command('webhooks/commands',`disable:${endpoint.id}:${endpoint.revision}`,'endpoint.disable',{endpoint_id:endpoint.id,revision:endpoint.revision},t('integrations.webhook.disabled'))}>{t('integrations.webhook.disable')}</button>
        </>}
      </div>
      {deliveries[endpoint.id]&&<ul className="deliveries">{deliveries[endpoint.id].map(row=><li key={row.id}>
        <span>{t('integrations.delivery.line',{type:t(`integrations.event.${row.event_type}` as never),sequence:row.sequence,state:deliveryState(row),attempts:row.attempts,date:date(row.created_at)})}{row.last_status!==null?' · HTTP '+row.last_status:''}{row.last_error?' · '+row.last_error:''}</span>
        {row.state==='dead'&&endpoint.state==='active'&&<button className="quiet" disabled={busy} onClick={()=>void command('webhooks/commands',`replay:${row.id}`,'delivery.replay',{delivery_id:row.id},t('integrations.delivery.replayed'),()=>void history(endpoint))}>{t('integrations.delivery.replay')}</button>}
      </li>)}{!deliveries[endpoint.id].length&&<li>{t('integrations.delivery.none')}</li>}</ul>}
    </li>)}</ul>

    <h3>{t('integrations.clients')}</h3>
    {clientsProblem&&<p role="status">{clientsProblem}</p>}
    <form className="editor" aria-label={t('integrations.client.add')} onSubmit={event=>{event.preventDefault();void command<Client&{client_secret?:string}>('api-clients/commands',`client:${name}:${scopes.join(',')}`,'client.create',{name,scopes},t('integrations.client.created'),result=>{setRevealed({label:t('integrations.client.secretTitle'),id:result.id,secret:result.client_secret??null});setName('');});}}>
      <label>{t('integrations.client.name')}<input required maxLength={120} value={name} onChange={event=>setName(event.target.value)}/></label>
      <fieldset><legend>{t('integrations.client.scopes')}</legend>{SCOPES.map(value=><label key={value} className="check"><input type="checkbox" checked={scopes.includes(value)} onChange={()=>setScopes(current=>toggle(current,value))}/> {t(`integrations.scope.${value}` as never)}</label>)}</fieldset>
      <p className="hint">{t('integrations.client.authority')}</p>
      <button disabled={busy||!scopes.length}>{t('integrations.client.add')}</button>
    </form>
    {!clients.length&&<p>{t('integrations.client.none')}</p>}
    <ul className="records">{clients.map(client=><li key={client.id}>
      <strong>{client.name}</strong>
      <span>{t(client.state==='active'?'integrations.state.active':'integrations.state.revoked')} · {client.scopes.map(value=>t(`integrations.scope.${value}` as never)).join(', ')} · {t('integrations.client.id',{id:client.id})}</span>
      {(client.secrets??[]).map(secret=><span key={secret.created_at}>{t(secret.expires_at?'integrations.client.secretExpiring':'integrations.client.secretActive',{hint:secret.hint,date:date(secret.expires_at??secret.created_at)})}</span>)}
      {client.state==='active'&&<div className="actions">
        <button className="quiet" disabled={busy} onClick={()=>void command<Client&{client_secret?:string}>('api-clients/commands',`client-rotate:${client.id}:${client.revision}`,'client.rotate',{client_id:client.id,revision:client.revision},t('integrations.client.rotated'),result=>setRevealed({label:t('integrations.client.secretTitle'),id:client.id,secret:result.client_secret??null}))}>{t('integrations.client.rotate')}</button>
        <button className="quiet" disabled={busy} onClick={()=>void command('api-clients/commands',`client-revoke:${client.id}:${client.revision}`,'client.revoke',{client_id:client.id,revision:client.revision},t('integrations.client.revoked'))}>{t('integrations.client.revoke')}</button>
      </div>}
    </li>)}</ul>
  </section>;
}
