import {useEffect,useState} from 'react';
import {translate as t,getLocaleTag} from '../../i18n';
import {homeworkRequest} from '../../lib/homework';
import type {MistakeFeed} from '../students/StudentMistakesView';

/** D4: a parent decides whether their child's homework mistakes join the child's Schood English practice. */
export function GuardianMistakeFeed({academyId,relationshipId,actorId,studentName}:{academyId:string;relationshipId:string;actorId:string;studentName:string}){
 const [feed,setFeed]=useState<MistakeFeed|null>(null),[linked,setLinked]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;setFeed(null);setError('');
  homeworkRequest<{consent:MistakeFeed;account_linked:boolean}>(academyId,actorId,'guardian_mistake_feed',{relationship_id:relationshipId})
   .then(value=>{if(active){setFeed(value.consent);setLinked(value.account_linked);}})
   .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'This setting could not load. Try again.');});
  return()=>{active=false;};},[academyId,relationshipId,actorId]);
 const save=async(enabled:boolean)=>{setBusy(true);setError('');try{setFeed((await homeworkRequest<{consent:MistakeFeed}>(academyId,actorId,'guardian_mistake_feed_set',{relationship_id:relationshipId,enabled})).consent);}
  catch(reason){setError(reason instanceof Error?reason.message:'This setting was not saved. Try again.');}finally{setBusy(false);}};
 if(!feed&&!error)return null;
 const on=feed?.status==='granted';
 return <article className="market-card">
  <h2>{t('Homework mistakes in Schood English')}</h2>
  <p>{t('Let {name} practise the mistakes from their homework in Schood English (Today plan and Review). Only the mistake, its correction and the explanation are copied. You or your child can turn it off at any time, and the copies are deleted.',{name:studentName})}</p>
  {feed&&<p className="muted">{on?t('On since {date}.',{date:new Intl.DateTimeFormat(getLocaleTag(),{dateStyle:'medium'}).format(new Date(String(feed.granted_at)))}):t('Off.')}</p>}
  {feed&&!linked&&!on&&<p className="muted">{t('Your child needs a Schood account linked to this centre first. Ask the centre to send an invitation.')}</p>}
  {error&&<p className="form-error" role="alert">{t(error)}</p>}
  {feed&&(on||linked)&&<button type="button" className={on?'ghost-btn':'primary-btn'} disabled={busy} onClick={()=>void save(!on)}>{busy?t('Saving…'):on?t('Turn off'):t('Turn on')}</button>}
 </article>;
}
