import {webhookBackoff,webhookDelivered,webhookUrl} from '../../../packages/assessment-core/src/webhooks.ts';
/** A delivery already signed by the Edge function. The Worker holds no secret. */
export interface PreparedDelivery {delivery_id:string;lease_token:string;attempt:number;url:string;body:string;headers:Record<string,string>}
export interface DeliveryOutcome {delivery_id:string;lease_token:string;status:number;error:string|null;retry_seconds:number}
/** POST each delivery with redirects refused, a hard timeout and bounded
 * concurrency. Response bodies are never read or logged; only the status. */
export async function deliverBatch(items:PreparedDelivery[],fetcher:typeof fetch,options:{timeoutMs?:number;concurrency?:number;random?:()=>number}={}):Promise<DeliveryOutcome[]>{
  const timeoutMs=options.timeoutMs??10000,concurrency=Math.max(1,options.concurrency??8),random=options.random??Math.random;
  const outcomes:DeliveryOutcome[]=new Array(items.length);let next=0;
  async function one(item:PreparedDelivery):Promise<DeliveryOutcome>{
    const done=(status:number,error:string|null)=>({delivery_id:item.delivery_id,lease_token:item.lease_token,status,error,retry_seconds:webhookBackoff(item.attempt,random())});
    try{webhookUrl(item.url);}catch{return done(0,'endpoint_url_rejected');}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetcher(item.url,{method:'POST',headers:item.headers,body:item.body,redirect:'manual',signal:controller.signal});
      void response.body?.cancel().catch(()=>{});
      if(response.status>=300&&response.status<400)return done(response.status,'redirect_refused');
      return done(response.status,webhookDelivered(response.status)?null:`http_${response.status}`);
    }catch(cause){return done(0,controller.signal.aborted?'timeout':cause instanceof Error?cause.name:'network_error');}
    finally{clearTimeout(timer);}
  }
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(next<items.length){const index=next++;outcomes[index]=await one(items[index]);}}));
  return outcomes;
}
