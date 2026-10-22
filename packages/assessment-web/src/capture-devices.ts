export interface SavedCaptureDevice { registration: string; session: string; }
export const captureDeviceKey=(tenant:string,actor:string,registration:string)=>`schood-capture-device:${tenant}:${actor}:${registration}`;
export function savedCaptureDevices(tenant:string,actor:string):SavedCaptureDevice[]{
 if(!tenant||!actor)return[];const prefix=captureDeviceKey(tenant,actor,'');const rows:SavedCaptureDevice[]=[];
 for(let i=0;i<sessionStorage.length;i++){const key=sessionStorage.key(i);if(!key?.startsWith(prefix))continue;const value=JSON.parse(sessionStorage.getItem(key)??'null');if(value?.session_id)rows.push({registration:key.slice(prefix.length),session:String(value.session_id)});}
 return rows;
}
