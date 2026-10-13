import {useEffect,useRef,useState} from 'react';
import {Check,ChevronLeft,ChevronRight,FileSpreadsheet,RefreshCw,Upload} from 'lucide-react';
import {translate as t} from '../../i18n';
import {supabase} from '../../lib/supabase';
import {importRowsFromMatrix,mapStudentHeaders,normalizeImportCell,parseImportCsv,type ImportRow} from '../../lib/importFile';
import {studentImportRequest,type StudentImportConfig,type StudentImportHistory,type StudentImportJob,type StudentImportOptions,type StudentImportResult} from '../../lib/studentImport';
import {exactImportAmount,readStudentImportIntent,studentImportBatch,type StudentImportIntent} from '../../lib/studentImportWorkflow';
import './student-import.css';

const fields=[['full_name','Full name'],['first_name','First name'],['last_name','Last name'],['phone','Student phone'],['parent_phone','Parent phone'],['parent_name','Parent name'],['email','Email'],['group_name','Group'],['balance','Balance'],['joined_on','Join date']] as const;
const terminal=new Set(['completed','cancelled','reversed','recovery_review']);
const issueText:Record<string,()=>string>={scope_unavailable:()=>t('Your access no longer covers this row.'),group_missing:()=>t('Group not found. Check the group name.'),group_ambiguous:()=>t('More than one group has this name.'),phone_invalid:()=>t('Enter a valid student phone.'),name_required:()=>t('Student name is required.'),balance_invalid_integer:()=>t('Use a whole-number balance.'),existing_balance_requires_reconciliation:()=>t('Reconcile an existing student’s balance separately.'),duplicate_identity:()=>t('Duplicate student identity.'),group_capacity_exceeded:()=>t('The group does not have enough places.')};
const issue=(code:string)=>issueText[code]?.()??t(code.replaceAll('_',' '));
const cell=(value:unknown)=>value==null?'—':String(value);

export function StudentImportView({academyId,actorId}:{academyId:string;actorId:string}){
 const storageKey=`schood:student-import:v1:${actorId}:${academyId}`;
 const [intent,setIntent]=useState<StudentImportIntent|null>(()=>readStudentImportIntent(sessionStorage,storageKey));
 const [options,setOptions]=useState<StudentImportOptions|null>(null);
 const [history,setHistory]=useState<StudentImportHistory|null>(null);
 const [data,setData]=useState<StudentImportResult|null>(null);
 const [file,setFile]=useState<{name:string;hash:string;headers:string[];rows:ImportRow[]}|null>(null);
 const [mapping,setMapping]=useState<Record<string,string>>({});
 const [branchId,setBranchId]=useState('');
 const [balance,setBalance]=useState<StudentImportConfig['balance_convention']>('credit_positive');
 const [dateFormat,setDateFormat]=useState<StudentImportConfig['date_format']>('iso');
 const [duplicates,setDuplicates]=useState<StudentImportConfig['duplicate_strategy']>('reject');
 const [createGroups,setCreateGroups]=useState(false);
 const [busy,setBusy]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const [page,setPage]=useState(0);const [reason,setReason]=useState('');const [showRecovery,setShowRecovery]=useState(false);
 const controller=useRef<AbortController|null>(null);const running=useRef(false);
 const currentIntent=useRef(intent);currentIntent.current=intent;
 const job=data?.job;const branch=options?.branches.find(b=>b.id===(intent?.settings.branch_id??branchId));
 const request=<T,>(action:Parameters<typeof studentImportRequest>[2],payload:Record<string,unknown>={})=>studentImportRequest<T>(academyId,actorId,action,payload,controller.current?.signal);
 const save=(value:StudentImportIntent|null)=>{
  // Only request identity/settings are retained. Student and parent rows stay in memory.
  if(value)sessionStorage.setItem(storageKey,JSON.stringify(value));else sessionStorage.removeItem(storageKey);
  currentIntent.current=value;setIntent(value);
 };
 const refreshHistory=async()=>setHistory(await request<StudentImportHistory>('list'));
 const inspect=async(id:string,offset=0)=>{
  const next=await request<StudentImportResult>('rows',{job_id:id,offset,limit:25});setData(next);setPage(offset/25);return next;
 };
 const run=async(label:string,work:()=>Promise<void>)=>{
  if(running.current)return;running.current=true;setBusy(label);setError('');setNotice('');
  try{await work();}catch(e){if(!controller.current?.signal.aborted)setError(e instanceof Error?t(e.message):t('The import could not be completed.'));}
  finally{running.current=false;if(!controller.current?.signal.aborted)setBusy('');}
 };
 useEffect(()=>{
  const abort=new AbortController();controller.current=abort;
  let active=true;
  void Promise.all([
   studentImportRequest<StudentImportOptions>(academyId,actorId,'options',{},abort.signal),
   studentImportRequest<StudentImportHistory>(academyId,actorId,'list',{},abort.signal),
  ]).then(async([setup,recent])=>{
   if(!active)return;setOptions(setup);setHistory(recent);setBranchId(setup.branches[0]?.id??'');
   const saved=currentIntent.current;
   if(saved){
    const found=await studentImportRequest<StudentImportResult&{found:boolean}>(academyId,actorId,'lookup',{key:saved.uploadKey},abort.signal);
    if(!active)return;
    if(found.found){setData(found);const rows=await studentImportRequest<StudentImportResult>(academyId,actorId,'rows',{job_id:found.job.id,limit:25},abort.signal);if(active)setData(rows);}
   }
  }).catch(e=>{if(active)setError(e instanceof Error?t(e.message):t('Import setup is unavailable. Try again.'));});
  const {data:auth}=supabase.auth.onAuthStateChange((event,session)=>{
   if(event==='SIGNED_OUT'||(session&&session.user.id!==actorId)){abort.abort();sessionStorage.removeItem(storageKey);if(active){setFile(null);setIntent(null);setData(null);setOptions(null);setHistory(null);setError(t('Your account changed. Reopen the import workspace.'));}}
  });
  return()=>{active=false;abort.abort();auth.subscription.unsubscribe();};
 },[academyId,actorId,storageKey]);

 const chooseFile=(selected:File)=>run(t('Reading file'),async()=>{
  if(selected.size>10*1024*1024)throw new Error('Import files are limited to 10 MB.');
  if(!/\.(csv|xlsx)$/i.test(selected.name))throw new Error('Choose a CSV or XLSX file.');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await selected.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(intent&&intent.fileHash!==hash)throw new Error('To resume this upload, select the same original file.');
  const matrix=/\.csv$/i.test(selected.name)?parseImportCsv(await selected.text()):
   (await (await import('read-excel-file/browser')).readSheet(selected)).map(row=>row.map(normalizeImportCell));
  const parsed=importRowsFromMatrix(matrix);
  if(intent&&parsed.rows.length!==intent.settings.expected_rows)throw new Error('The original upload row count does not match.');
  setFile({name:selected.name,hash,...parsed});setMapping(intent?.settings.column_mapping??mapStudentHeaders(parsed.headers));
 });
 const upload=()=>run(t('Uploading students'),async()=>{
  if(!file)throw new Error('Choose the original file to upload.');
  if(!branch)throw new Error('Choose a branch.');
  let pending=intent;
  if(!pending){
   const columns=Object.fromEntries(Object.entries(mapping).filter(([,heading])=>heading));
   if((!columns.full_name&&!columns.first_name)||!columns.phone)throw new Error('Map student name and phone before uploading.');
   if(new Set(Object.values(columns)).size!==Object.values(columns).length)throw new Error('Map each source column to only one field.');
   pending={version:1,uploadKey:crypto.randomUUID(),commitKey:crypto.randomUUID(),recoveryKey:crypto.randomUUID(),fileHash:file.hash,
    settings:{branch_id:branch.id,source_filename:file.name,column_mapping:columns,expected_rows:file.rows.length,
     balance_convention:balance,currency:branch.currency,date_format:dateFormat,create_missing_groups:createGroups,duplicate_strategy:duplicates}};
   save(pending);
  }
  const found=await request<StudentImportResult&{found:boolean}>('lookup',{key:pending.uploadKey});
  let state=found.found?found.job:null;
  if(state&&state.status!=='uploading'){await inspect(state.id);return;}
  let offset=state?.staged_rows??0;
  while(offset<file.rows.length){
   const rows=studentImportBatch(file.rows,pending.settings,offset,options?.limits.batch_rows??200);
   const result=await request<StudentImportResult>('stage',{key:pending.uploadKey,settings:pending.settings,rows,offset,seal:offset+rows.length===file.rows.length});
   state=result.job;
   if(!Number.isInteger(state.staged_rows)||state.staged_rows<=offset||state.staged_rows>file.rows.length)throw new Error('We could not confirm this import result. Check its status before trying again.');
   save({...pending,jobId:state.id});setData(result);offset=state.staged_rows;
  }
  if(state){await request<StudentImportResult>('preview',{job_id:state.id});await inspect(state.id);await refreshHistory();}
 });
 const preview=()=>run(t('Reviewing students'),async()=>{if(job){await request('preview',{job_id:job.id});await inspect(job.id);}});
 const commit=()=>run(t('Importing students'),async()=>{
  if(!job?.validation||!intent)return;
  const result=await request<StudentImportResult>('commit',{job_id:job.id,key:intent.commitKey,preview_hash:job.validation.preview_hash});
  setData(result);await inspect(job.id);await refreshHistory();
  setNotice(t(result.preview_changed?'The preview changed. Review it again before importing.':'Import completed.'));
 });
 const recover=()=>run(t('Correcting import'),async()=>{
  if(!job||!intent||!(intent.recoveryReason??reason).trim())return;
  const pending={...intent,recoveryReason:intent.recoveryReason??reason.trim()};save(pending);
  await request('recover',{job_id:job.id,key:pending.recoveryKey,reason:pending.recoveryReason});await inspect(job.id);await refreshHistory();setShowRecovery(false);
 });
 const newImport=()=>{save(null);setFile(null);setData(null);setMapping({});setPage(0);setReason('');setShowRecovery(false);setError('');setNotice('');};
 const openJob=(item:StudentImportJob)=>run(t('Opening import'),async()=>{
  const result=await inspect(item.id);
  const existing=readStudentImportIntent(sessionStorage,storageKey);
  save(existing?.uploadKey===item.idempotency_key?existing:{version:1,uploadKey:item.idempotency_key,commitKey:crypto.randomUUID(),recoveryKey:crypto.randomUUID(),fileHash:'',settings:result.job.settings,jobId:item.id});
  setFile(null);setReason('');setShowRecovery(false);
 });
 const canLeave=!intent||Boolean(job&&terminal.has(job.status));
 const stage=job?.receipt?3:job&&job.status!=='uploading'?2:file?1:0;
 return <section className="student-import" aria-busy={!!busy}>
  <div className="student-import__intro"><div><p>{t('Move your spreadsheet into students, groups and opening balances.')}</p></div>
   {canLeave&&intent?<button className="btn" disabled={!!busy} onClick={newImport}>{t('New import')}</button>:null}</div>
  <ol className="student-import__steps">{[t('Choose file'),t('Map columns'),t('Review & import'),t('Receipt')].map((label,index)=><li key={label} aria-current={stage===index?'step':undefined} className={stage===index?'is-current':stage>index?'is-complete':''}><span>{stage>index?<Check size={14}/>:index+1}</span>{label}</li>)}</ol>
  {error?<div className="student-import__message is-error" role="alert"><p>{error}</p><button className="btn" disabled={!!busy} onClick={()=>void run(t('Checking status'),async()=>{
   if(job)await inspect(job.id,page*25);else if(intent){const found=await request<StudentImportResult&{found:boolean}>('lookup',{key:intent.uploadKey});if(found.found)await inspect(found.job.id);else setNotice(t('No upload was found. You can retry with the same file.'));}
   else {setOptions(await request('options'));await refreshHistory();}
  })}><RefreshCw size={15}/>{t('Check status')}</button></div>:null}
  {notice?<p className="student-import__message" role="status">{notice}</p>:null}
  {intent&&!job?<button className="btn" disabled={!!busy} onClick={()=>void run(t('Cancelling upload'),async()=>{
   const found=await request<StudentImportResult&{found:boolean}>('lookup',{key:intent.uploadKey});
   if(found.found){await inspect(found.job.id);return;}
   newImport();
  })}>{t('Cancel upload')}</button>:null}
  {busy?<p className="student-import__progress" role="status">{t(busy)}{job?.status==='uploading'?` · ${job.staged_rows} / ${job.expected_rows}`:'…'}</p>:null}
  {!job||job.status==='uploading'?<div className="student-import__setup">
   <div className="student-import__panel student-import__file"><FileSpreadsheet size={28}/><h3>{t(intent?'Resume your upload':'Start with your spreadsheet')}</h3><p>{t(intent?'Select the same original file. Your saved rows will not be uploaded twice.':'CSV or XLSX · up to 5,000 students · 10 MB')}</p>
    <label className="student-import__file-button">{t(file?'Change file':'Choose file')}<input type="file" accept=".csv,.xlsx" disabled={!!busy} onChange={e=>{const selected=e.target.files?.[0];e.target.value='';if(selected)void chooseFile(selected);}}/></label>
    {file?<p><strong>{file.name}</strong><br/>{file.rows.length.toLocaleString()} {t('students')}</p>:null}
    <p className="student-import__hint">{t('Store phone numbers as text. Keep one student per row and use the first sheet in Excel.')}</p>
   </div>
   <div className="student-import__panel"><h3>{t('Import settings')}</h3><div className="student-import__settings">
    <label>{t('Branch')}<select disabled={!!intent||!!busy||!options} value={intent?.settings.branch_id??branchId} onChange={e=>{setBranchId(e.target.value);setCreateGroups(false);}}><option value="">{t('Choose a branch')}</option>{options?.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>{t('Positive balance means')}<select disabled={!!intent||!!busy} value={intent?.settings.balance_convention??balance} onChange={e=>setBalance(e.target.value as typeof balance)}><option value="credit_positive">{t('Prepaid credit')}</option><option value="debt_positive">{t('Student owes tuition')}</option></select></label>
    <label>{t('Date format')}<select disabled={!!intent||!!busy} value={intent?.settings.date_format??dateFormat} onChange={e=>setDateFormat(e.target.value as typeof dateFormat)}><option value="iso">{'YYYY-MM-DD'}</option><option value="day_first">{'DD/MM/YYYY'}</option><option value="month_first">{'MM/DD/YYYY'}</option></select></label>
    <label>{t('Existing students')}<select disabled={!!intent||!!busy} value={intent?.settings.duplicate_strategy??duplicates} onChange={e=>setDuplicates(e.target.value as typeof duplicates)}><option value="reject">{t('Stop for review')}</option><option value="skip">{t('Skip existing students')}</option><option value="reuse">{t('Use existing student')}</option></select></label>
   </div><label className="student-import__checkbox"><input type="checkbox" disabled={!!intent||!!busy||!branch?.can_create_groups} checked={intent?.settings.create_missing_groups??createGroups} onChange={e=>setCreateGroups(e.target.checked)}/>{t('Create missing groups')}</label>
   <p className="student-import__hint">{t('Group names must match an active group in this branch. Blank groups create a contact without enrollment. Parent links remain pending consent.')}</p>
   {branch?<details><summary>{t('Available groups')}</summary><p>{options?.groups.filter(g=>g.branch_id===branch.id).map(g=>g.name).join(' · ')||t('No groups in this branch.')}</p></details>:null}</div>
  </div>:null}
  {file&&(!job||job.status==='uploading')?<div className="student-import__panel"><div className="student-import__section-title"><div><h3>{t('Match your columns')}</h3><p>{t('Name and student phone are required. Review the suggested matches.')}</p></div><button className="btn primary" disabled={!!busy||!branch} onClick={()=>void upload()}><Upload size={16}/>{t(intent?'Resume upload':'Upload & review')}</button></div>
   <div className="student-import__mapping">{fields.map(([field,label])=><label key={field}>{t(label)}{['full_name','phone'].includes(field)?' *':''}<select disabled={!!intent||!!busy} value={mapping[field]??''} onChange={e=>setMapping({...mapping,[field]:e.target.value})}><option value="">{t('Do not import')}</option>{file.headers.map(header=><option key={header} value={header}>{header}</option>)}</select><small>{cell(file.rows[0]?.[mapping[field]])}</small></label>)}</div>
  </div>:null}
  {job?<div className="student-import__panel"><div className="student-import__section-title"><div><h3>{job.settings.source_filename}</h3><p>{branch?.name??t('Import')} · {t(job.status.replaceAll('_',' '))} · {job.expected_rows.toLocaleString()} {t('students')}</p></div><div className="student-import__actions">
   <button className="btn" disabled={!!busy} onClick={()=>void run(t('Checking status'),async()=>{await inspect(job.id,page*25);})}><RefreshCw size={15}/>{t('Refresh')}</button>
   {['sealed','validated'].includes(job.status)?<button className="btn" disabled={!!busy} onClick={()=>void preview()}>{t('Review again')}</button>:null}
   {['uploading','sealed','validated','cancelled'].includes(job.status)?<button className="btn" disabled={!!busy} onClick={()=>void run(t('Cancelling upload'),async()=>{await request('cancel',{job_id:job.id});newImport();await refreshHistory();})}>{t('Cancel upload')}</button>:null}
  </div></div>
  {job.validation?<><div className="student-import__stats">{[['New students',job.validation.create_rows],['Existing students',job.validation.reuse_rows],['Skipped',job.validation.skipped_rows],['Needs correction',job.validation.invalid_rows]].map(([label,count])=><div key={label}><span>{t(String(label))}</span><strong>{count}</strong></div>)}</div>
   <div className="student-import__balances"><span className="is-credit">{t('Prepaid credit')} <strong>{exactImportAmount(job.validation.opening_credit)} {job.validation.currency}</strong></span><span className="is-debt">{t('Student debt')} <strong>{exactImportAmount(job.validation.opening_debt)} {job.validation.currency}</strong></span></div>
   {job.status==='validated'?<div className="student-import__review"><p>{t(data?.permissions?.can_commit?'Review names, groups and balances before confirming. No messages will be sent.':'This import needs corrections or an authorized finance reviewer before it can be applied.')}</p><button className="btn primary" disabled={!!busy||!data?.permissions?.can_commit} onClick={()=>void commit()}>{t('Confirm import')}</button></div>:null}</>:null}
  {job.receipt?<div className="student-import__receipt"><Check size={22}/><div><h3>{t('Import receipt')}</h3><p>{job.receipt.contacts} {t('new contacts')} · {job.receipt.memberships} {t('memberships')} · {job.receipt.opening_balance_entries} {t('opening balances')}</p><p>{t('No payments collected. No parent messages sent.')}</p></div></div>:null}
  {job.recovery_receipt?<div className="student-import__message"><strong>{t('Correction receipt')}</strong><p>{job.recovery_receipt.corrected_effects} {t('corrected')} · {job.recovery_receipt.manual_review_effects} {t('need manual review')} · {job.recovery_receipt.reversal_entries} {t('balance reversals')}</p><p>{t('Changed or used records are retained for review.')}</p></div>:null}
  {data?.rows?.length?<><div className="student-import__table"><table><thead><tr>{['Row','Student','Phone','Group','Opening balance','Review'].map(label=><th key={label}>{t(label)}</th>)}</tr></thead><tbody>{data.rows.map(row=><tr key={row.row_number}><td>{row.row_number}</td><td>{cell(row.normalized?.full_name??row.mapped.full_name??row.mapped.first_name)}</td><td>{cell(row.normalized?.phone??row.mapped.phone)}</td><td>{cell(row.normalized?.group_name??row.mapped.group_name)}</td><td>{row.normalized?.ledger_amount==null?'—':<span className={BigInt(String(row.normalized.ledger_amount))>0n?'is-debt':'is-credit'}>{exactImportAmount((BigInt(String(row.normalized.ledger_amount))*-1n).toString())}</span>}</td><td>{row.errors.length?row.errors.map(issue).join(' · '):t(row.finance_approved?'Ready':'Finance review needed')}</td></tr>)}</tbody></table></div>
   <div className="student-import__pagination"><button className="btn" aria-label={t('Previous page')} disabled={!!busy||page===0} onClick={()=>void run(t('Loading rows'),async()=>{await inspect(job.id,(page-1)*25);})}><ChevronLeft size={16}/></button><span>{page*25+1}–{Math.min((page+1)*25,job.staged_rows)} / {job.staged_rows}</span><button className="btn" aria-label={t('Next page')} disabled={!!busy||!data.has_more} onClick={()=>void run(t('Loading rows'),async()=>{await inspect(job.id,(page+1)*25);})}><ChevronRight size={16}/></button></div></>:null}
  {data?.permissions?.can_recover?<div className="student-import__recovery"><button className="btn" disabled={!!busy} onClick={()=>setShowRecovery(!showRecovery)}>{t('Correct this import')}</button>{showRecovery?<div><p>{t('This reverses unchanged import records and opening balances. Later payments, attendance and consent are preserved for manual review.')}</p><label>{t('Reason for correction')}<textarea maxLength={1000} disabled={!!busy||!!intent?.recoveryReason} value={intent?.recoveryReason??reason} onChange={e=>setReason(e.target.value)}/></label><button className="btn" disabled={!!busy||!(intent?.recoveryReason??reason).trim()} onClick={()=>void recover()}>{t('Confirm correction')}</button></div>:null}</div>:null}
  </div>:null}
  <div className="student-import__panel"><div className="student-import__section-title"><h3>{t('Recent imports')}</h3><button className="btn" disabled={!!busy} onClick={()=>void run(t('Loading imports'),refreshHistory)}><RefreshCw size={15}/>{t('Refresh')}</button></div>
   {!history?<p>{t('Loading imports…')}</p>:!history.jobs.length?<p className="student-import__hint">{t('Your imports and receipts will appear here.')}</p>:<ul className="student-import__history">{history.jobs.map(item=><li key={item.id}><div><strong>{item.settings.source_filename}</strong><small>{new Date(item.created_at).toLocaleDateString()} · {item.expected_rows} {t('students')} · {t(item.status.replaceAll('_',' '))}</small></div><button className="btn" disabled={!!busy||(!canLeave&&job?.id!==item.id)} onClick={()=>void openJob(item)}>{t('Open')}</button></li>)}</ul>}
   {history?.has_more&&history.cursor?<button className="btn" disabled={!!busy} onClick={()=>void run(t('Loading imports'),async()=>{const more=await request<StudentImportHistory>('list',history.cursor!);setHistory({...more,jobs:[...history.jobs,...more.jobs]});})}>{t('Load more')}</button>:null}
  </div>
 </section>;
}
