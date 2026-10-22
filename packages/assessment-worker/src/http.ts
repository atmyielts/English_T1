import {ServiceError as RuntimeError} from './error.ts';
/** Timeout covers headers and body consumption. No caller credentials or payloads are logged. */
export async function boundedJson<T>(url:string,init:RequestInit,fetcher:typeof fetch=fetch,timeoutMs=8000,maxBytes=1000000):Promise<{ok:boolean;status:number;payload:T}>{
 const controller=new AbortController();let rejectAbort!:(cause:unknown)=>void;
 const aborted=new Promise<never>((_resolve,reject)=>{rejectAbort=reject;});
 const timer=setTimeout(()=>{controller.abort();rejectAbort(new RuntimeError(503,'upstream_timeout','The canonical service timed out'));},timeoutMs);
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,complete=false;
 try{
  const response=await Promise.race([fetcher(url,{...init,signal:controller.signal}),aborted]);reader=response.body?.getReader();
  const chunks:Uint8Array[]=[];let bytes=0;
  if(reader)for(;;){const {done,value}=await Promise.race([reader.read(),aborted]);if(done){complete=true;break;}bytes+=value.byteLength;if(bytes>maxBytes)throw new RuntimeError(502,'upstream_payload_limit','The canonical response exceeded its size limit');chunks.push(value);}
  const content=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){content.set(chunk,offset);offset+=chunk.byteLength;}
  let payload:T;try{payload=JSON.parse(new TextDecoder().decode(content)) as T;}catch{throw new RuntimeError(502,'upstream_invalid_json','The canonical service returned an invalid response');}
  return {ok:response.ok,status:response.status,payload};
 }finally{clearTimeout(timer);if(reader&&!complete)void reader.cancel().catch(()=>{});}
}
