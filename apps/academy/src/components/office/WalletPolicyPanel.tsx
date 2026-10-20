import {useState,type FormEvent} from 'react';
import {translate as t} from '../../i18n';
import type {AcademyCommercialCore,AcademyWalletPolicy} from '../../lib/client';
import {financialMoney} from '../../lib/financialMoney';

type Payload={contact_id:string;classroom_id:string;currency:string;mode:string;warning_credit:string;reason:string;account_credit_acknowledged:boolean};
export function WalletPolicyPanel({data,disabled,canManage,onSave}:{data:AcademyCommercialCore;disabled:boolean;canManage:boolean;onSave:(payload:Payload)=>void}){
 const [visible,setVisible]=useState(20);
 const [form,setForm]=useState<Payload>({contact_id:'',classroom_id:'',currency:'UZS',mode:'off',warning_credit:'0',reason:'',account_credit_acknowledged:false});
 const patch=(next:Partial<Payload>)=>setForm(previous=>({...previous,...next}));
 const review=(row:AcademyWalletPolicy)=>setForm({contact_id:row.contact_id,classroom_id:row.classroom_id,currency:row.currency,mode:row.mode,warning_credit:String(row.warning_credit),reason:'',account_credit_acknowledged:false});
 const contact=(id:string)=>{const row=data.contacts.find(c=>c.id===id);return row?`${row.first_name} ${row.last_name}`:id;};
 return <section className="panel commercial-span compact-form" aria-label={t('Prepaid wallet policy')}>
  <h3>{t('Prepaid wallet policy')}</h3>
  <p>{t('Choose a policy only for classes paid from prepaid credit. A paid course can correctly have a zero account balance.')}</p>
  <p>{t('Credit is shared across this institution in the chosen currency. At zero credit, a freeze pauses new lesson access, live-room entry, quiz attempts and submissions. Billing, saved work and existing quiz completion remain available. New credit restores learning automatically; vacation pauses keep their own dates.')}</p>
  {data.wallet_policies===undefined?<p role="status">{t('Wallet controls are temporarily unavailable. Try again later.')}</p>:null}
  {data.wallet_policies?.slice(0,visible).map(row=><article className="panel" key={row.id}>
   <strong>{contact(row.contact_id)} · {data.classrooms.find(c=>c.id===row.classroom_id)?.name??row.classroom_id}</strong>
   <p>{t(row.mode==='freeze'?'Freeze at zero credit':row.mode==='alert'?'Alert only':'Off')} · {t('Available credit')}: {financialMoney(row.available_credit,row.currency)} · {t('Alert level')}: {financialMoney(row.warning_credit,row.currency)}</p>
   {row.low_credit?<p role="status">{t(row.learning_paused?'Prepaid learning is paused at zero credit. Add credit or ask your academy to review the wallet policy.':'Prepaid credit is at or below the alert level.')}</p>:null}
   {canManage?<button className="small-btn" type="button" disabled={disabled} onClick={()=>review(row)}>{t('Review wallet policy')}</button>:null}
  </article>)}
  {(data.wallet_policies?.length??0)>visible?<button className="small-btn" type="button" onClick={()=>setVisible(count=>count+20)}>{t('Load more')}</button>:null}
  {data.wallet_policies?.length===0?<p>{t('No prepaid wallet policies. Existing learning access is unchanged.')}</p>:null}
  {canManage?<form className="grid two" onSubmit={(event:FormEvent)=>{event.preventDefault();onSave(form);}}>
   <label>{t('Student')}<select className="input" required disabled={disabled} value={form.contact_id} onChange={e=>patch({contact_id:e.target.value,account_credit_acknowledged:false})}><option value="">{t('Choose student')}</option>{data.contacts.map(c=><option key={c.id} value={c.id}>{contact(c.id)}</option>)}</select></label>
   <label>{t('Classroom')}<select className="input" required disabled={disabled} value={form.classroom_id} onChange={e=>patch({classroom_id:e.target.value,account_credit_acknowledged:false})}><option value="">{t('Choose classroom')}</option>{data.classrooms.filter(c=>c.is_active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>{t('Currency')}<input className="input" required pattern="[A-Z]{3}" maxLength={3} disabled={disabled} value={form.currency} onChange={e=>patch({currency:e.target.value.toUpperCase(),account_credit_acknowledged:false})}/></label>
   <label>{t('Wallet policy')}<select className="input" disabled={disabled} value={form.mode} onChange={e=>patch({mode:e.target.value,account_credit_acknowledged:false})}><option value="off">{t('Off')}</option><option value="alert">{t('Alert only')}</option><option value="freeze">{t('Freeze at zero credit')}</option></select></label>
   <label>{t('Alert level')}<input className="input" inputMode="numeric" required pattern="[0-9]{1,19}" disabled={disabled} value={form.warning_credit} onChange={e=>patch({warning_credit:e.target.value})}/></label>
   <label>{t('Reason')}<input className="input" required maxLength={1000} disabled={disabled} value={form.reason} onChange={e=>patch({reason:e.target.value})}/></label>
   <label><input type="checkbox" required disabled={disabled} checked={form.account_credit_acknowledged} onChange={e=>patch({account_credit_acknowledged:e.target.checked})}/>{t('I reviewed the class and currency and understand that this uses the shared institution wallet.')}</label>
   <button className="primary-btn" type="submit" disabled={disabled||data.wallet_policies===undefined}>{t('Save wallet policy')}</button>
  </form>:null}
 </section>;
}
