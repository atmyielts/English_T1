import React from 'react';
import type { CandidateNotice,MonitoringStatus } from '../../../packages/proctor-web/src/types';
import {useI18n} from '../../../packages/service-i18n/src/i18n.tsx';
import {useAppT} from './i18n/index.ts';
import {errorText} from '../../../packages/assessment-web/src/i18n/errors.ts';
export function MonitoringPanel({status,notices,busy,acknowledge,sync}:{status:MonitoringStatus;notices:CandidateNotice[];busy:boolean;acknowledge:(id:string)=>void;sync:()=>void}) {
  const t=useAppT(),{date}=useI18n();
  return <aside className="monitoring-panel" aria-label={t('exam.monitoring.label')}><div className="monitoring-summary"><p>{t('exam.monitoring.summary',{state:status.pending?t('exam.monitoring.pending',{count:status.pending}):t('exam.monitoring.synced')})}</p><button className="quiet" disabled={busy} onClick={sync}>{t('exam.monitoring.refresh')}</button></div>
    {status.problem&&<p className="error" role="alert">{t('exam.monitoring.problem',{problem:errorText(new Error(status.problem),t)})}</p>}
    {notices.filter(notice=>!notice.acknowledged).map(notice=><div className="monitoring-notice" role="alert" key={notice.id}><h2>{t(notice.issuer_kind==='system'?(notice.kind==='paused'?'exam.monitoring.systemPaused':'exam.monitoring.systemWarning'):notice.kind==='warning'?'exam.monitoring.message':notice.kind==='paused'?'exam.monitoring.paused':'exam.monitoring.resumed')}</h2><p>{notice.reason}</p><p className="hint">{date(notice.issued_at)}</p><button className="quiet" disabled={busy} onClick={()=>acknowledge(notice.id)}>{t('exam.monitoring.acknowledge')}</button></div>)}
  </aside>;
}
