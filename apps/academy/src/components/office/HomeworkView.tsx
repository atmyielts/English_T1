import {useCallback,useEffect,useMemo,useState} from 'react';
import {translate as t,getLocaleTag} from '../../i18n';
import {homeworkRequest,type CourseModules,type Funnel,type HomeworkOverview,type Mistake,type QueueCorrection,type QueueItem,type QueueSubmission} from '../../lib/homework';
import './HomeworkView.css';

type Tab='review'|'funnel'|'courses'|'plan';
type Props={academyId:string;actorId:string};

const dateTime=(value:string|null|undefined)=>value?new Intl.DateTimeFormat(getLocaleTag(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'';
const percent=(part:number,whole:number)=>whole>0?Math.round(part*100/whole)+'%':'—';
const SIGNAL_LABELS:Record<string,string>={duplicate_media:'Same photo as another student',similar_text:'Very similar to another answer',untimed_source:'Typed in Telegram (not timed)',large_paste:'Large pasted text',fast_typing:'Unusually fast typing'};
const SKIP_LABELS:Record<string,string>={audio_needs_teacher:'Voice answers are marked by the teacher.',file_needs_teacher:'This file type is marked by the teacher.',vision_unavailable:'The AI could not read the photos.',already_graded:'Already graded.'};

export function HomeworkView({academyId,actorId}:Props){
 const [tab,setTab]=useState<Tab>('review');
 const [overview,setOverview]=useState<HomeworkOverview|null>(null),[error,setError]=useState('');
 const loadOverview=useCallback(()=>{homeworkRequest<HomeworkOverview>(academyId,actorId,'homework_overview').then(setOverview).catch(reason=>setError(reason instanceof Error?reason.message:'Homework could not load. Try again.'));},[academyId,actorId]);
 useEffect(()=>{loadOverview();},[loadOverview]);
 const tabs:{id:Tab;label:string;show:boolean}[]=[
  {id:'review',label:t('Review queue'),show:overview?.can.review??true},
  {id:'funnel',label:t('Homework funnel'),show:overview?.can.reports??true},
  {id:'courses',label:t('Course checks'),show:overview?.can.review??true},
  {id:'plan',label:t('Plan and settings'),show:true},
 ];
 return <section className="panel homework-os" aria-labelledby="homework-os-title">
  <div className="section-heading"><div><h2 id="homework-os-title">{t('Homework OS')}</h2></div>
   {overview&&!overview.plan.allowed.homework&&<span className="status status--warning">{t('Plan required')}</span>}</div>
  <div className="homework-tabs" role="tablist">{tabs.filter(item=>item.show).map(item=><button key={item.id} type="button" role="tab" aria-selected={tab===item.id} className={tab===item.id?'homework-tab is-active':'homework-tab'} onClick={()=>setTab(item.id)}>
   {item.label}{item.id==='review'&&overview?.waiting?<span className="homework-badge">{overview.waiting}</span>:null}</button>)}</div>
  {error&&<p className="form-error" role="alert">{t(error)}</p>}
  {tab==='review'&&<ReviewTab academyId={academyId} actorId={actorId} onChange={loadOverview}/>}
  {tab==='funnel'&&<FunnelTab academyId={academyId} actorId={actorId}/>}
  {tab==='courses'&&<CourseChecksTab academyId={academyId} actorId={actorId}/>}
  {tab==='plan'&&overview&&<PlanTab academyId={academyId} actorId={actorId} overview={overview} onSaved={loadOverview}/>}
 </section>;
}

function ReviewTab({academyId,actorId,onChange}:Props&{onChange:()=>void}){
 const [items,setItems]=useState<QueueItem[]|null>(null),[index,setIndex]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(()=>{homeworkRequest<{items:QueueItem[]}>(academyId,actorId,'review_queue',{limit:40}).then(value=>{setError('');setItems(value.items);setIndex(0);}).catch(reason=>{setItems([]);setError(reason instanceof Error?reason.message:'The review queue could not load. Retry.');});},[academyId,actorId]);
 useEffect(()=>{load();},[load]);
 const current=items?.[index]??null;
 const done=useCallback(()=>{setItems(list=>{const next=(list??[]).filter((_,i)=>i!==index);setIndex(i=>Math.min(i,Math.max(next.length-1,0)));return next;});onChange();},[index,onChange]);
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(target&&['INPUT','TEXTAREA','SELECT'].includes(target.tagName))return;
  if(event.key==='j')setIndex(i=>Math.min(i+1,(items?.length??1)-1));if(event.key==='k')setIndex(i=>Math.max(i-1,0));};
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[items]);
 if(!items)return <p role="status">{t('Loading the review queue…')}</p>;
 return <div className="homework-review">
  {error&&<p className="form-error" role="alert">{t(error)}</p>}
  {items.length===0?<div className="empty-state"><p>{t('Nothing to review. New hand-ins appear here as soon as students send them.')}</p><button type="button" className="ghost-btn" onClick={load}>{t('Refresh')}</button></div>:<>
   <ol className="homework-list" aria-label={t('Waiting for review')}>{items.map((item,i)=><li key={item.kind+(item.kind==='submission'?item.submission.id:item.correction.id)}>
    <button type="button" className={i===index?'homework-list-item is-active':'homework-list-item'} onClick={()=>setIndex(i)}>
     <strong>{item.student.name}</strong><span>{item.kind==='correction'?t('Correction'):item.assignment.title}</span>
     <small>{item.classroom.name}{item.kind==='submission'&&item.ai?.status==='ready'?' · '+t('AI draft ready'):''}{item.kind==='submission'&&item.signals.some(s=>s.severity==='review')?' · '+t('Check'):''}</small>
    </button></li>)}</ol>
   <div className="homework-detail">{current&&(current.kind==='submission'
    ?<SubmissionCard key={current.submission.id} item={current} academyId={academyId} actorId={actorId} busy={busy} setBusy={setBusy} onDone={done}/>
    :<CorrectionCard key={current.correction.id} item={current} academyId={academyId} actorId={actorId} busy={busy} setBusy={setBusy} onDone={done}/>)}
    <p className="muted homework-keys">{t('Keys: J next, K previous.')}</p></div>
  </>}
 </div>;
}

function Files({files}:{files:{filename:string|null;mime_type:string|null;url:string|null}[]}){
 if(!files.length)return null;
 return <div className="homework-files">{files.map((file,i)=>{const mime=file.mime_type??'';if(!file.url)return <p key={i} className="muted">{t('This file is not available.')}</p>;
  if(mime.startsWith('image/'))return <a key={i} href={file.url} target="_blank" rel="noreferrer"><img src={file.url} alt={t('Page {n}',{n:i+1})} loading="lazy"/></a>;
  if(mime.startsWith('audio/'))return <audio key={i} controls preload="none" src={file.url}/>;
  if(mime.startsWith('video/'))return <video key={i} controls preload="none" src={file.url}/>;
  return <a key={i} className="small-btn" href={file.url} target="_blank" rel="noreferrer">{file.filename??t('Open file')}</a>;})}</div>;
}

function SubmissionCard({item,academyId,actorId,busy,setBusy,onDone}:{item:QueueSubmission;academyId:string;actorId:string;busy:boolean;setBusy:(v:boolean)=>void;onDone:()=>void}){
 const ai=item.ai?.status==='ready'?item.ai:null;
 const criteria=item.rubric?.parsed??null;
 const maxScore=criteria?criteria.reduce((sum,c)=>sum+c.max,0):Number(item.submission.max_score??item.assignment.max_score??ai?.max_score??10);
 const [score,setScore]=useState(ai?.suggested_score!=null?String(ai.suggested_score):'');
 const [rubric,setRubric]=useState<Record<string,string>>(()=>Object.fromEntries((criteria??[]).map(c=>[c.id,ai?.rubric_scores?.[c.id]!=null?String(ai.rubric_scores[c.id]):''])));
 const [comments,setComments]=useState(ai?.summary??'');
 const [mistakes,setMistakes]=useState<(Mistake&{keep:boolean})[]>(()=>(ai?.mistakes??[]).map(m=>({...m,source:'ai',keep:true})));
 const [error,setError]=useState('');
 const rubricTotal=criteria?criteria.reduce((sum,c)=>sum+(Number(rubric[c.id])||0),0):null;
 const edited=(ai==null)||comments!==(ai.summary??'')||mistakes.some(m=>!m.keep)||(criteria?criteria.some(c=>rubric[c.id]!==String(ai.rubric_scores?.[c.id]??'')):score!==String(ai.suggested_score??''));
 const decide=async(decision:'grade'|'return')=>{setBusy(true);setError('');
  const kept=mistakes.filter(m=>m.keep).map(m=>({tag:m.tag,excerpt:m.excerpt,correction:m.correction,explanation:m.explanation,source:m.source}));
  try{
   await homeworkRequest(academyId,actorId,'review_decide',{submission_id:item.submission.id,expected_attempt_number:item.submission.attempt_number,
    decision:decision==='return'?'return':edited?'edit':'approve',comments,mistakes:kept,
    ...(criteria?{rubric_scores:Object.fromEntries(criteria.map(c=>[c.id,Number(rubric[c.id])]))}:{score:Number(score),max_score:maxScore})});
   onDone();
  }catch(reason){setError(reason instanceof Error?reason.message:'This review was not saved. Retry.');}finally{setBusy(false);}};
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(busy||(target&&['INPUT','TEXTAREA','SELECT'].includes(target.tagName)))return;
  if(event.key==='a'&&ai)void decide('grade');if(event.key==='r')void decide('return');};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);});
 return <article className="homework-card" aria-label={t('Submission by {name}',{name:item.student.name})}>
  <header><h3>{item.assignment.title}</h3><p className="muted">{item.student.name} · {item.classroom.name} · {dateTime(item.submission.submitted_at)}{item.submission.source==='telegram_bot'?' · Telegram':''}{item.submission.attempt_number>1?' · '+t('Attempt {n}',{n:item.submission.attempt_number}):''}</p></header>
  {item.signals.length>0&&<ul className="homework-signals">{item.signals.map(s=><li key={s.signal} className={s.severity==='review'?'status status--warning':'status'}>{t(SIGNAL_LABELS[s.signal]??s.signal)}</li>)}</ul>}
  {item.submission.submission_content&&<blockquote className="homework-answer">{item.submission.submission_content}</blockquote>}
  {item.submission.submission_url&&<a href={item.submission.submission_url} target="_blank" rel="noreferrer">{item.submission.submission_url}</a>}
  <Files files={item.submission.files}/>
  <div className="homework-mark">
   <h4>{ai?t('AI draft (check before releasing)'):t('Your mark')}</h4>
   {item.ai&&item.ai.status==='skipped'&&<p className="muted">{t(SKIP_LABELS[item.ai.skip_reason??'']??'The AI did not mark this one.')}</p>}
   {item.ai&&['queued','running'].includes(item.ai.status)&&<p className="muted">{t('The AI draft is still being prepared.')}</p>}
   {criteria?<div className="homework-rubric">{criteria.map(c=><label key={c.id}>{c.title} <span className="muted">/ {c.max}</span>
     <input className="input" type="number" min={0} max={c.max} step={0.5} value={rubric[c.id]??''} onChange={event=>setRubric(value=>({...value,[c.id]:event.target.value}))}/></label>)}
     <p><strong>{t('Total')}: {rubricTotal} / {maxScore}</strong></p></div>
    :<label className="homework-score">{t('Score')}<span><input className="input" type="number" min={0} max={maxScore} step={0.5} value={score} onChange={event=>setScore(event.target.value)}/> / {maxScore}</span></label>}
   <label>{t('Comment to the student')}<textarea className="input" rows={3} value={comments} onChange={event=>setComments(event.target.value)}/></label>
   {mistakes.length>0&&<fieldset className="homework-mistakes"><legend>{t('Mistakes to save in the mistake bank')}</legend>{mistakes.map((m,i)=><label key={i}>
    <input type="checkbox" checked={m.keep} onChange={event=>setMistakes(list=>list.map((x,j)=>j===i?{...x,keep:event.target.checked}:x))}/>
    <span><code>{m.tag}</code> {m.excerpt}{m.correction?<> → <em>{m.correction}</em></>:null}{m.explanation?<small className="muted"> {m.explanation}</small>:null}</span></label>)}</fieldset>}
  </div>
  {error&&<p className="form-error" role="alert">{t(error)}</p>}
  <div className="homework-actions">
   <button type="button" className="primary-btn" disabled={busy||(criteria?criteria.some(c=>rubric[c.id]===''):score==='')} onClick={()=>void decide('grade')}>{edited?t('Release this mark'):t('Approve AI draft (A)')}</button>
   <button type="button" className="ghost-btn" disabled={busy} onClick={()=>void decide('return')}>{t('Return for correction (R)')}</button>
  </div>
 </article>;
}

function CorrectionCard({item,academyId,actorId,busy,setBusy,onDone}:{item:QueueCorrection;academyId:string;actorId:string;busy:boolean;setBusy:(v:boolean)=>void;onDone:()=>void}){
 const [error,setError]=useState('');
 const decide=async(decision:'accept'|'needs_work')=>{setBusy(true);setError('');try{await homeworkRequest(academyId,actorId,'correction_decide',{correction_id:item.correction.id,decision});onDone();}
  catch(reason){setError(reason instanceof Error?reason.message:'This review was not saved. Retry.');}finally{setBusy(false);}};
 return <article className="homework-card">
  <header><h3>{t('Correction')}: {item.assignment.title}</h3><p className="muted">{item.student.name} · {item.classroom.name} · {dateTime(item.correction.created_at)}</p></header>
  {item.mistakes.length>0&&<ul className="homework-mistake-list">{item.mistakes.map(m=><li key={m.id}><code>{m.tag}</code> {m.excerpt}{m.correction?<> → <em>{m.correction}</em></>:null}</li>)}</ul>}
  {item.correction.content&&<blockquote className="homework-answer">{item.correction.content}</blockquote>}
  <Files files={item.correction.media}/>
  {error&&<p className="form-error" role="alert">{t(error)}</p>}
  <div className="homework-actions"><button type="button" className="primary-btn" disabled={busy} onClick={()=>void decide('accept')}>{t('Accept correction')}</button>
   <button type="button" className="ghost-btn" disabled={busy} onClick={()=>void decide('needs_work')}>{t('Needs more work')}</button></div>
 </article>;
}

function FunnelTab({academyId,actorId}:Props){
 const [days,setDays]=useState(28),[result,setResult]=useState<{days:number;funnel:Funnel|null;error:string}|null>(null);
 useEffect(()=>{let active=true;const to=new Date(),from=new Date(to.getTime()-days*86400000);
  homeworkRequest<Funnel>(academyId,actorId,'homework_funnel',{from:from.toISOString(),to:to.toISOString()}).then(value=>{if(active)setResult({days,funnel:value,error:''});})
   .catch(reason=>{if(active)setResult({days,funnel:null,error:reason instanceof Error?reason.message:'The homework funnel could not load. Retry.'});});
  return()=>{active=false;};},[academyId,actorId,days]);
 const current=result?.days===days?result:null,funnel=current?.funnel??null,error=current?.error??'';
 const totals=useMemo(()=>(funnel?.classrooms??[]).reduce((sum,row)=>({assigned:sum.assigned+row.assigned,submitted:sum.submitted+row.submitted,reviewed:sum.reviewed+row.reviewed,on_time:sum.on_time+row.on_time}),{assigned:0,submitted:0,reviewed:0,on_time:0}),[funnel]);
 return <div className="homework-funnel">
  <label className="homework-period">{t('Period')}<select className="input" value={days} onChange={event=>setDays(Number(event.target.value))}>
   <option value={7}>{t('Last 7 days')}</option><option value={28}>{t('Last 4 weeks')}</option><option value={90}>{t('Last 3 months')}</option></select></label>
  {error&&<p className="form-error" role="alert">{t(error)}</p>}
  {!funnel&&!error&&<p role="status">{t('Loading report…')}</p>}
  {funnel&&<>
   <div className="homework-kpis">
    <div><strong>{funnel.assignments}</strong><span>{t('Assignments due')}</span></div>
    <div><strong>{percent(totals.submitted,totals.assigned)}</strong><span>{t('Handed in')}</span></div>
    <div><strong>{percent(totals.on_time,totals.assigned)}</strong><span>{t('On time')}</span></div>
    <div><strong>{percent(totals.reviewed,totals.submitted)}</strong><span>{t('Reviewed')}</span></div>
   </div>
   {funnel.classrooms.length===0?<p>{t('No homework was due in this period.')}</p>:<div className="homework-table" tabIndex={0} role="region" aria-label={t('Homework funnel by group')}><table>
    <thead><tr>{['Group','Assigned','Opened in Telegram','Handed in','On time','Reviewed','Returned','Corrected','Mastered','Median review time'].map(h=><th key={h}>{t(h)}</th>)}</tr></thead>
    <tbody>{funnel.classrooms.map(row=><tr key={row.classroom_id}><td>{row.classroom_name}</td><td>{row.assigned}</td><td>{row.opened}</td>
     <td>{row.submitted} ({percent(row.submitted,row.assigned)})</td><td>{percent(row.on_time,row.assigned)}</td><td>{row.reviewed}</td><td>{row.returned}</td><td>{row.corrected}</td><td>{row.mastered}</td>
     <td>{row.median_review_hours==null?'—':t('{h} h',{h:row.median_review_hours})}</td></tr>)}</tbody></table></div>}
   {funnel.reviewers.length>0&&<><h3>{t('Reviewers')}</h3><div className="homework-table"><table><thead><tr><th>{t('Teacher')}</th><th>{t('Reviewed')}</th><th>{t('Median review time')}</th></tr></thead>
    <tbody>{funnel.reviewers.map(r=><tr key={r.user_id}><td>{r.name}</td><td>{r.reviewed}</td><td>{r.median_review_hours==null?'—':t('{h} h',{h:r.median_review_hours})}</td></tr>)}</tbody></table></div></>}
   <p className="muted">{t('Counts each student once per assignment. Median review time runs from hand-in to the released mark.')}</p>
  </>}
 </div>;
}

function CourseChecksTab({academyId,actorId}:Props){
 const [courses,setCourses]=useState<{id:string;title:string;status:string}[]>([]),[courseId,setCourseId]=useState(''),[loaded,setLoaded]=useState<{courseId:string;data:CourseModules}|null>(null),[error,setError]=useState(''),[saved,setSaved]=useState('');
 useEffect(()=>{homeworkRequest<CourseModules>(academyId,actorId,'course_modules').then(value=>setCourses(value.courses??[])).catch(reason=>setError(reason instanceof Error?reason.message:'Courses could not load.'));},[academyId,actorId]);
 useEffect(()=>{if(!courseId)return;let active=true;homeworkRequest<CourseModules>(academyId,actorId,'course_modules',{course_id:courseId}).then(value=>{if(active)setLoaded({courseId,data:value});}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Courses could not load.');});return()=>{active=false;};},[academyId,actorId,courseId]);
 const data=loaded?.courseId===courseId&&courseId?loaded.data:null;
 const save=async(moduleId:string,rule:{type:string;quiz_id?:string;min_percent?:string})=>{setError('');setSaved('');
  try{await homeworkRequest(academyId,actorId,'set_module_unlock',{module_id:moduleId,...rule});setSaved(moduleId);}catch(reason){setError(reason instanceof Error?reason.message:'The unlock rule was not saved. Retry.');}};
 return <div className="homework-courses">
  <p>{t('Students open the next module only after they pass its check. Build courses in Curriculum, then choose the checks here.')}</p>
  <label>{t('Course')}<select className="input" value={courseId} onChange={event=>setCourseId(event.target.value)}><option value="">{t('Choose a course')}</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
  {error&&<p className="form-error" role="alert">{t(error)}</p>}
  {data&&(data.modules.length===0?<p>{t('This course has no modules yet.')}</p>:<ol className="homework-modules">{data.modules.map((m,i)=><ModuleRule key={m.id} index={i} module={m} quizzes={data.quizzes} saved={saved===m.id} onSave={rule=>void save(m.id,rule)}/>)}</ol>)}
 </div>;
}

function ModuleRule({index,module,quizzes,saved,onSave}:{index:number;module:CourseModules['modules'][number];quizzes:CourseModules['quizzes'];saved:boolean;onSave:(rule:{type:string;quiz_id?:string;min_percent?:string})=>void}){
 const [type,setType]=useState(module.unlock_rule?.type??'none'),[quiz,setQuiz]=useState(module.unlock_rule?.quiz_id??''),[min,setMin]=useState(module.unlock_rule?.min_percent!=null?String(module.unlock_rule.min_percent):'');
 return <li><strong>{module.title}</strong>
  <div className="homework-rule">
   <select className="input" value={type} onChange={event=>setType(event.target.value)} aria-label={t('Unlock rule')}>
    <option value="none">{t('Always open')}</option>{index>0&&<option value="previous_module">{t('After the previous module is finished')}</option>}<option value="quiz_pass">{t('After passing a check quiz')}</option></select>
   {type==='quiz_pass'&&<><select className="input" value={quiz} onChange={event=>setQuiz(event.target.value)} aria-label={t('Check quiz')}><option value="">{t('Choose a quiz')}</option>{quizzes.map(q=><option key={q.id} value={q.id}>{q.title}</option>)}</select>
    <input className="input" type="number" min={1} max={100} placeholder={t('Pass mark %')} value={min} onChange={event=>setMin(event.target.value)}/></>}
   <button type="button" className="small-btn" disabled={type==='quiz_pass'&&!quiz} onClick={()=>onSave({type,...(type==='quiz_pass'?{quiz_id:quiz,min_percent:min}:{})})}>{t('Save')}</button>
   {saved&&<span className="form-success">{t('Saved')}</span>}
  </div></li>;
}

function PlanTab({academyId,actorId,overview,onSaved}:Props&{overview:HomeworkOverview;onSaved:()=>void}){
 const [settings,setSettings]=useState(overview.settings),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const {plan}=overview;
 const save=async(patch:Partial<typeof settings>)=>{const next={...settings,...patch};setSettings(next);setError('');setSaved(false);
  try{await homeworkRequest(academyId,actorId,'homework_settings',patch);setSaved(true);onSaved();}catch(reason){setError(reason instanceof Error?reason.message:'Settings were not saved. Retry.');}};
 const tier=plan.audience==='center'?(plan.center_tier?t('Centre tier: {tier}',{tier:plan.center_tier}):t('No active centre tier')):(plan.teacher_tier==='teacher_pro'?t('Teacher Pro plan'):plan.teacher_tier?t('Teacher plan'):t('No teaching plan yet'));
 const yes=(value:boolean)=>value?t('Included'):t('Not included');
 return <div className="homework-plan">
  <div className="homework-plan-card"><h3>{tier}</h3>
   {plan.teacher_plan_ends_at&&<p className="muted">{t('Active until {date}',{date:dateTime(plan.teacher_plan_ends_at)})}</p>}
   <ul><li>{t('Telegram hand-in, review queue, funnel and parent summary')}: <strong>{yes(plan.paid.homework)}</strong></li>
    <li>{t('Publishing courses')}: <strong>{yes(plan.paid.courses)}</strong></li><li>{t('AI pre-marking and mistake bank')}: <strong>{yes(plan.paid.homework_ai)}</strong></li></ul>
   {!plan.billing_enforced&&<p className="muted">{t('Everything is open during the launch period. Plans apply once Schood switches billing on.')}</p>}
   {plan.audience==='center'?<p className="muted">{t('Centre-owned academies use the centre tier: Growth includes homework and courses, Premium and Exclusive add AI pre-marking.')}</p>
    :<div className="homework-teaching-plans">{overview.teaching_plans.map(p=><div key={p.id} className="homework-plan-option"><strong>{t(p.name)}</strong>
     <span>{p.is_active&&!p.metadata?.placeholder_price?new Intl.NumberFormat(getLocaleTag()).format(p.amount)+' '+p.currency+' / '+t('{n} days',{n:p.duration_days??30}):t('Price coming soon')}</span>
     <ul>{(p.metadata?.features??[]).map(f=><li key={f}>{t(f)}</li>)}</ul></div>)}
     <p className="muted">{t('Independent teachers can build courses and use homework tools with a Schood Teaching plan. Contact Schood support to activate it.')}</p></div>}
  </div>
  <div className="homework-plan-card"><h3>{t('Features switched on by Schood')}</h3><ul>
   <li>{t('Telegram hand-in')}: <strong>{overview.flags.telegram_handin?t('On'):t('Not yet')}</strong></li>
   <li>{t('AI pre-marking')}: <strong>{overview.flags.premark?t('On'):t('Not yet')}</strong></li>
   <li>{t('Weekly parent summary')}: <strong>{overview.flags.digest?t('On'):t('Not yet')}</strong></li></ul></div>
  <div className="homework-plan-card"><h3>{t('This academy')}</h3>
   {[['telegram_handin_enabled','Let students hand in homework through the Schood Telegram bot'],['premark_enabled','Prepare an AI draft mark for teachers'],['digest_enabled','Send parents a weekly homework summary in Telegram']].map(([key,label])=>
    <label key={key} className="homework-toggle"><input type="checkbox" disabled={!overview.can.manage} checked={Boolean(settings[key as keyof typeof settings])} onChange={event=>void save({[key]:event.target.checked})}/>{t(label)}</label>)}
   {!overview.can.manage&&<p className="muted">{t('Only the academy owner can change these settings.')}</p>}
   {error&&<p className="form-error" role="alert">{t(error)}</p>}{saved&&<p className="form-success">{t('Saved')}</p>}
  </div>
 </div>;
}
