import type {SavedCaptureDevice} from '../../../packages/assessment-web/src/capture-devices';
export function CaptureRecoveryPanel({devices,busy,error,notice,recover}:{devices:SavedCaptureDevice[];busy:boolean;error:string;notice:string;recover:(device:SavedCaptureDevice)=>void}){
 if(!devices.length&&!notice)return null;
 return <section aria-label="Saved recording recovery"><h2>Recording sessions on this device</h2><p>Confirm remaining footage after a completed exam. No camera, microphone or screen permission is requested. For an ongoing exam, resume its sitting instead. Keep this device until recovery is confirmed.</p>{error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}<ul className="records">{devices.map(device=><li key={device.session}><strong>Exam registration {device.registration}</strong><button className="quiet" disabled={busy} onClick={()=>recover(device)}>Recover saved footage</button></li>)}</ul></section>;
}
