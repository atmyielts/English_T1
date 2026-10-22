import {normalQuantile} from './psychometrics.ts';
/** Mantel–Haenszel differential item functioning for one dichotomous item,
 * stratified by total score, with the ETS A/B/C classification.
 * Group membership is supplied by an authorized reviewer for an approved
 * analysis; below the privacy minimum nothing is computed or disclosed. */
export interface Stratum {referenceCorrect:number;referenceIncorrect:number;focalCorrect:number;focalIncorrect:number}
export type DifClass='A'|'B'|'C';
export interface DifResult {
  status:'ok'|'insufficient_sample'|'undefined';
  alpha:number|null;deltaDif:number|null;standardError:number|null;chiSquare:number|null;significant:boolean|null;
  category:DifClass|null;favours:'reference'|'focal'|'neither'|null;
  reference:number;focal:number;
}
export const DIF_MINIMUM_GROUP=100;
const CHI_95=3.841458820694124;

export function mantelHaenszel(strata:Stratum[],minimumGroup=DIF_MINIMUM_GROUP):DifResult{
  const reference=strata.reduce((n,s)=>n+s.referenceCorrect+s.referenceIncorrect,0),focal=strata.reduce((n,s)=>n+s.focalCorrect+s.focalIncorrect,0);
  const empty={alpha:null,deltaDif:null,standardError:null,chiSquare:null,significant:null,category:null,favours:null,reference,focal};
  if(strata.some(s=>[s.referenceCorrect,s.referenceIncorrect,s.focalCorrect,s.focalIncorrect].some(v=>!Number.isSafeInteger(v)||v<0)))return {status:'undefined',...empty};
  if(reference<minimumGroup||focal<minimumGroup)return {status:'insufficient_sample',...empty};
  let num=0,den=0,sumA=0,sumE=0,sumV=0,p=0,pq=0,q=0;
  // Robins–Breslow–Greenland variance pieces for ln(alpha).
  let rbgR=0,rbgS=0,rbgPR=0,rbgPSQR=0,rbgQS=0;
  for(const s of strata){
    const A=s.referenceCorrect,B=s.referenceIncorrect,C=s.focalCorrect,D=s.focalIncorrect,N=A+B+C+D;
    if(N<2||A+B===0||C+D===0)continue; // a stratum with one group carries no comparison
    const R=A*D/N,S=B*C/N,P=(A+D)/N,Q=(B+C)/N;
    num+=R;den+=S;sumA+=A;sumE+=(A+B)*(A+C)/N;sumV+=(A+B)*(C+D)*(A+C)*(B+D)/(N*N*(N-1));
    rbgR+=R;rbgS+=S;rbgPR+=P*R;rbgPSQR+=P*S+Q*R;rbgQS+=Q*S;
    p+=P;q+=Q;pq+=P*Q;
  }
  if(num===0||den===0||sumV===0)return {status:'undefined',...empty};
  const alpha=num/den,deltaDif=-2.35*Math.log(alpha);
  const varLn=rbgPR/(2*rbgR*rbgR)+rbgPSQR/(2*rbgR*rbgS)+rbgQS/(2*rbgS*rbgS),standardError=2.35*Math.sqrt(varLn);
  const chiSquare=Math.pow(Math.max(0,Math.abs(sumA-sumE)-0.5),2)/sumV,significant=chiSquare>CHI_95;
  // ETS: C when |D| ≥ 1.5 and significantly beyond 1.0; A when |D| < 1 or not significant; otherwise B.
  const z=normalQuantile(0.975),size=Math.abs(deltaDif);
  const category:DifClass=!significant||size<1?'A':size>=1.5&&(size-1)/standardError>z?'C':'B';
  return {status:'ok',alpha,deltaDif,standardError,chiSquare,significant,category,favours:category==='A'?'neither':deltaDif<0?'reference':'focal',reference,focal};
}
