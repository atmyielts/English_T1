import {translate} from '../../i18n';
import {financialMoney} from '../../lib/financialMoney';
export function FinancialActionStatus({busy,error,notice,pending,onRetry,review}:{busy:boolean;error:string;notice:string;pending:boolean;review?:{action:string;amount:unknown;currency:string}|null;onRetry:()=>Promise<void>}){
 return <>
  {error?<p className="form-error" role="alert">{translate(error)}</p>:null}
  {notice?<p className="form-success" role="status">{translate(notice)}</p>:null}
  {pending?<div className="panel" role="status"><p>{translate('A previous financial change needs confirmation before you start another.')}</p>
   {review?<p>{translate(review.action)}{review.amount!=null?` · ${financialMoney(review.amount,review.currency)}`:''}</p>:null}
   <button className="primary-btn" disabled={busy} onClick={()=>void onRetry()}>{translate('Retry pending action')}</button></div>:null}
 </>;
}
