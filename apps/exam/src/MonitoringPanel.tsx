import React from 'react';
import type { CandidateNotice,MonitoringStatus } from '../../../packages/proctor-web/src/types';
export function MonitoringPanel({status,notices,busy,acknowledge,sync}:{status:MonitoringStatus;notices:CandidateNotice[];busy:boolean;acknowledge:(id:string)=>void;sync:()=>void}) {
  return <aside className="monitoring-panel" aria-label="Exam monitoring"><div className="monitoring-summary"><p>Browser monitoring · {status.pending?`${status.pending} event${status.pending===1?'':'s'} awaiting sync`:'Saved events synced'}</p><button className="quiet" disabled={busy} onClick={sync}>Refresh monitoring</button></div>
    {status.problem&&<p className="error" role="alert">{status.problem}. Events already saved on this device remain queued. Contact your institution if this persists.</p>}
    {notices.filter(notice=>!notice.acknowledged).map(notice=><div className="monitoring-notice" role="alert" key={notice.id}><h2>{notice.issuer_kind==='system'?(notice.kind==='paused'?'Recording policy paused the assessment':'Recording policy warning'):notice.kind==='warning'?'Message from your proctor':notice.kind==='paused'?'Your proctor paused the assessment':'Your proctor resumed the assessment'}</h2><p>{notice.reason}</p><p className="hint">{new Date(notice.issued_at).toLocaleString()}</p><button className="quiet" disabled={busy} onClick={()=>acknowledge(notice.id)}>Acknowledge message</button></div>)}
  </aside>;
}
