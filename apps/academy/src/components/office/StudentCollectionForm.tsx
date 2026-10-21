import{useEffect,useState,type FormEvent}from'react';
import{translate as t}from'../../i18n';
import{teacherStudioCommercialCore,type AcademyCommercialCore,type AcademyCashbox,type AcademyCashierShift}from'../../lib/client';
import{staffRequest}from'../../lib/staffRequest';
type Props={academyId:string;actorId:string;branchId:string;shifts:AcademyCashierShift[];boxes:AcademyCashbox[];disabled:boolean;run:(work:()=>Promise<unknown>,message:string)=>Promise<void>};
export function StudentCollectionForm({academyId,actorId,branchId,shifts,boxes,disabled,run}:Props){
 const[data,setData]=useState<AcademyCommercialCore|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const[contact,setContact]=useState(''),[shift,setShift]=useState(''),[charge,setCharge]=useState(''),[amount,setAmount]=useState(''),[method,setMethod]=useState('cash'),[reason,setReason]=useState('');
 useEffect(()=>{let active=true;void teacherStudioCommercialCore(academyId,actorId,branchId).then(value=>{if(active){setData(value);setError('');}}).catch(value=>{if(active)setError(value instanceof Error?value.message:'Unable to load financial records. Try again.');});return()=>{active=false;};},[academyId,actorId,branchId,revision]);
 const ownShifts=shifts.filter(s=>s.status==='open'&&s.cashier_user_id===actorId),selected=ownShifts.find(s=>s.id===shift),box=boxes.find(b=>b.id===selected?.cashbox_id),currency=box?.currency??'UZS';
 const submit=(event:FormEvent)=>{event.preventDefault();if(disabled||!data||!selected||!box||!data.contacts.some(c=>c.id===contact))return;void run(()=>staffRequest(academyId,'collect_student_payment',{contact_id:contact,shift_id:shift,charge_id:charge||null,amount,currency,payment_method:method,reason},actorId),'Student payment and cashier receipt recorded.');};
 return <form className="panel compact-form" onSubmit={submit}><fieldset disabled={disabled||!data} style={{border:0,padding:0,margin:0,minWidth:0,display:'contents'}}><h3>{t('Collect a student payment')}</h3><p className="muted">{t('Record cash or a completed card-terminal receipt in your own open shift. Click payments must use their verified provider flow.')}</p>
  {!ownShifts.length&&<p role="status">{t('Open your cashier shift before collecting a payment.')}</p>}
  {error&&<p role="alert">{t(error)}</p>}
  {!data&&!error&&<p role="status">{t('Loading financial records…')}</p>}
  {data?.has_more?.contacts&&<p role="status">{t('Lists show the latest 500 records. Totals include all permitted records.')}</p>}
  <label>{t('Student')}<select className="input" required value={contact} onChange={event=>{setContact(event.target.value);setCharge('');}}><option value="">{t('Choose student')}</option>{data?.contacts.map(c=><option key={c.id} value={c.id}>{[c.first_name,c.last_name].filter(Boolean).join(' ')}</option>)}</select></label>
  <label>{t('Cashier shift')}<select className="input" required value={shift} onChange={event=>{setShift(event.target.value);setCharge('');}}><option value="">{t('Choose an open shift')}</option>{ownShifts.map(s=><option key={s.id} value={s.id}>{boxes.find(b=>b.id===s.cashbox_id)?.name??t('Cashbox')}</option>)}</select></label>
  <label>{t('Charge')}<select className="input" value={charge} onChange={event=>setCharge(event.target.value)}><option value="">{t('Add to prepaid wallet')}</option>{data?.charges.filter(c=>c.contact_id===contact&&c.currency===currency&&!['paid','void','written_off'].includes(c.status)).map(c=><option key={c.id} value={c.id}>{c.description||t('Charge')} · {c.currency}</option>)}</select></label>
  <label>{t('Amount')} · {currency}<input className="input" type="text" inputMode="numeric" pattern="[0-9]{1,10}" required value={amount} onChange={event=>setAmount(event.target.value)}/></label>
  <label>{t('Payment method')}<select className="input" value={method} onChange={event=>setMethod(event.target.value)}><option value="cash">{t('Cash')}</option><option value="manual_pos">{t('Card terminal receipt')}</option></select></label>
  <label>{t('Receipt note')}<input className="input" required maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)}/></label><button className="primary-btn" disabled={disabled||!ownShifts.length||!data}>{t('Record collection')}</button></fieldset>
  {error&&<button className="small-btn" type="button" disabled={disabled} onClick={()=>setRevision(value=>value+1)}>{t('Try again')}</button>}
 </form>;
}
