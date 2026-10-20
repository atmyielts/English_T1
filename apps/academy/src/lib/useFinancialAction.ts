import {translate} from '../i18n';
import {useRef,useState} from 'react';
import {hasPendingFinance,pendingFinanceReview,retryFinanceRequest,StaffRequestError} from './staffRequest';

// Retry the captured transport, including its original actor/body/key. Calling
// the form's callback again could generate a different random payment key.
export function useFinancialAction(academyId:string,actorId:string,refresh:()=>Promise<void>){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [pending,setPending]=useState(()=>hasPendingFinance(academyId,actorId));
 const successMessage=useRef(translate('Financial change confirmed.'));
 const inFlight=useRef(false);
 const execute=async(work:()=>Promise<unknown>)=>{
  if(inFlight.current)return;inFlight.current=true;
  setBusy(true);setError('');setNotice('');
  try{await work();setPending(false);setNotice(successMessage.current);await refresh();}
  catch(next){
   const uncertain=next instanceof StaffRequestError&&next.retryable;
   setPending(uncertain||hasPendingFinance(academyId,actorId));
   setError(uncertain?translate('This financial change is not confirmed. Retry the pending action.'):next instanceof StaffRequestError&&next.status===403?translate('Your current access does not cover these financial records.'):next instanceof StaffRequestError&&next.status===409&&!hasPendingFinance(academyId,actorId)?translate('The financial record changed. Refresh and review it.'):next instanceof StaffRequestError&&next.status===400?translate('Review the financial values, available balance and current status.'):next instanceof Error?translate(next.message):translate('The financial change could not be saved.'));
  }finally{inFlight.current=false;setBusy(false);}
 };
 const run=async(work:()=>Promise<unknown>,message:string)=>{
  if(pending||hasPendingFinance(academyId,actorId)){setPending(true);setError(translate('Confirm the pending financial action before starting another.'));return;}
  successMessage.current=message;await execute(work);
 };
 return {busy,error,notice,pending,review:pending?pendingFinanceReview(academyId,actorId):null,run,retry:()=>execute(()=>retryFinanceRequest(academyId,actorId))};
}
