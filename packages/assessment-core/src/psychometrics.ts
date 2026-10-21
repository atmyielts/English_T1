/** Classical test theory uncertainty for released-result analytics.
 * Pure functions over the summary statistics a report snapshot already holds.
 * Every estimate carries warnings; an undefined value is `null`, never a guess.
 * This is descriptive CTT, not calibration, equating or a fairness claim. */

export type Warning =
  | 'small_sample'          // fewer than SMALL_SAMPLE candidates: intervals are wide
  | 'too_few_items'         // reliability needs at least two items
  | 'no_score_variance'     // everyone scored the same: reliability undefined
  | 'negative_reliability'  // alpha below zero: items do not measure one thing together
  | 'no_item_variance'      // every candidate got the item right (or wrong)
  | 'undefined';            // inputs cannot support the estimate
export interface Interval {estimate:number|null;lower:number|null;upper:number|null;level:number;warnings:Warning[]}
export const SMALL_SAMPLE=30;

// ---- distributions -------------------------------------------------------
function logGamma(x:number):number{
  // Lanczos approximation (g=7, n=9); accurate to ~1e-15 for x>0.
  const c=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  if(x<0.5)return Math.log(Math.PI/Math.sin(Math.PI*x))-logGamma(1-x);
  x-=1;let a=c[0];const t=x+7.5;for(let i=1;i<9;i++)a+=c[i]/(x+i);
  return 0.5*Math.log(2*Math.PI)+(x+0.5)*Math.log(t)-t+Math.log(a);
}
function betaContinuedFraction(a:number,b:number,x:number):number{
  const tiny=1e-300;let qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap;
  if(Math.abs(d)<tiny)d=tiny;d=1/d;let h=d;
  for(let m=1;m<=300;m++){
    const m2=2*m;let aa=m*(b-m)*x/((qam+m2)*(a+m2));
    d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;h*=d*c;
    aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
    d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;const delta=d*c;h*=delta;
    if(Math.abs(delta-1)<3e-15)break;
  }
  return h;
}
/** Regularized incomplete beta I_x(a,b). */
export function incompleteBeta(x:number,a:number,b:number):number{
  if(x<=0)return 0;if(x>=1)return 1;
  const front=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log(1-x));
  return x<(a+1)/(a+b+2)?front*betaContinuedFraction(a,b,x)/a:1-front*betaContinuedFraction(b,a,1-x)/b;
}
export function fCdf(f:number,d1:number,d2:number){return f<=0?0:incompleteBeta(d1*f/(d1*f+d2),d1/2,d2/2);}
/** Quantile of the F distribution by bisection on the CDF. */
export function fQuantile(p:number,d1:number,d2:number){
  if(!(p>0&&p<1)||!(d1>0&&d2>0))throw new RangeError('fQuantile needs 0<p<1 and positive degrees of freedom');
  let lo=0,hi=1;while(fCdf(hi,d1,d2)<p)hi*=2;
  for(let i=0;i<200;i++){const mid=(lo+hi)/2;if(fCdf(mid,d1,d2)<p)lo=mid;else hi=mid;if(hi-lo<1e-12*Math.max(1,hi))break;}
  return (lo+hi)/2;
}
/** Standard normal quantile (Acklam's algorithm, |error| < 1.2e-9). */
export function normalQuantile(p:number){
  if(!(p>0&&p<1))throw new RangeError('normalQuantile needs 0<p<1');
  const a=[-3.969683028665376e1,2.209460984245205e2,-2.759285104469687e2,1.383577518672690e2,-3.066479806614716e1,2.506628277459239],b=[-5.447609879822406e1,1.615858368580409e2,-1.556989798598866e2,6.680131188771972e1,-1.328068155288572e1],c=[-7.784894002430293e-3,-3.223964580411365e-1,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],d=[7.784695709041462e-3,3.224671290700398e-1,2.445134137142996,3.754408661907416];
  const low=0.02425;
  if(p<low){const q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  if(p>1-low){const q=Math.sqrt(-2*Math.log(1-p));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  const q=p-0.5,r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}

// ---- estimates -----------------------------------------------------------
const finite=(...values:number[])=>values.every(Number.isFinite);
const small=(n:number):Warning[]=>n<SMALL_SAMPLE?['small_sample']:[];

/** Cronbach's alpha with Feldt's (1965) F-based confidence interval. */
export function alphaInterval(alpha:number|null,candidates:number,items:number,level=0.95):Interval{
  const warnings:Warning[]=[...small(candidates)];
  if(items<2)return {estimate:null,lower:null,upper:null,level,warnings:[...warnings,'too_few_items']};
  if(alpha===null||!finite(alpha,candidates)||candidates<3)return {estimate:null,lower:null,upper:null,level,warnings:[...warnings,alpha===null?'no_score_variance':'undefined']};
  if(alpha<0)warnings.push('negative_reliability');
  const g=1-level,d1=candidates-1,d2=(candidates-1)*(items-1);
  return {estimate:alpha,lower:1-(1-alpha)*fQuantile(1-g/2,d1,d2),upper:1-(1-alpha)*fQuantile(g/2,d1,d2),level,warnings};
}
/** Standard error of measurement in score points: SD·√(1−reliability). */
export function standardErrorOfMeasurement(sd:number,reliability:number|null){
  if(reliability===null||!finite(sd,reliability)||sd<0||reliability>1)return {estimate:null,warnings:['undefined'] as Warning[]};
  if(reliability<0)return {estimate:null,warnings:['negative_reliability'] as Warning[]};
  return {estimate:sd*Math.sqrt(1-reliability),warnings:[] as Warning[]};
}
/** Item facility (proportion of full credit) with a Wilson score interval. */
export function facilityInterval(successes:number,candidates:number,level=0.95):Interval{
  if(!finite(successes,candidates)||candidates<1||successes<0||successes>candidates)return {estimate:null,lower:null,upper:null,level,warnings:['undefined']};
  const p=successes/candidates,z=normalQuantile(1-(1-level)/2),z2=z*z,den=1+z2/candidates;
  const centre=(p+z2/(2*candidates))/den,half=z/den*Math.sqrt(p*(1-p)/candidates+z2/(4*candidates*candidates));
  const warnings:Warning[]=[...small(candidates),...(successes===0||successes===candidates?['no_item_variance' as Warning]:[])];
  return {estimate:p,lower:Math.max(0,centre-half),upper:Math.min(1,centre+half),level,warnings};
}
/** Item–rest (or any Pearson) correlation with a Fisher z interval. */
export function correlationInterval(r:number|null,candidates:number,level=0.95):Interval{
  if(r===null||!finite(r,candidates)||Math.abs(r)>1)return {estimate:null,lower:null,upper:null,level,warnings:['no_item_variance']};
  if(candidates<4)return {estimate:r,lower:null,upper:null,level,warnings:['small_sample','undefined']};
  if(Math.abs(r)===1)return {estimate:r,lower:r,upper:r,level,warnings:small(candidates)};
  const z=Math.atanh(r),half=normalQuantile(1-(1-level)/2)/Math.sqrt(candidates-3);
  return {estimate:r,lower:Math.tanh(z-half),upper:Math.tanh(z+half),level,warnings:small(candidates)};
}
