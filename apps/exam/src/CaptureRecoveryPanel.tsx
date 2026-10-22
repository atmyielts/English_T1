import type {SavedCaptureDevice} from '../../../packages/assessment-web/src/capture-devices';
import {useAppT} from './i18n/index.ts';
export function CaptureRecoveryPanel({devices,busy,error,notice,recover}:{devices:SavedCaptureDevice[];busy:boolean;error:string;notice:string;recover:(device:SavedCaptureDevice)=>void}){
 const t=useAppT();
 if(!devices.length&&!notice)return null;
 return <section aria-label={t('exam.captureRecovery.label')}><h2>{t('exam.captureRecovery.title')}</h2><p>{t('exam.captureRecovery.intro')}</p>{error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}<ul className="records">{devices.map(device=><li key={device.session}><strong>{t('exam.captureRecovery.registration',{id:device.registration})}</strong><button className="quiet" disabled={busy} onClick={()=>recover(device)}>{t('exam.captureRecovery.recover')}</button></li>)}</ul></section>;
}
