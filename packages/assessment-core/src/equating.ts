/** Observed-score equating between two forms taken by equivalent groups.
 * Linear (mean–sigma) and equipercentile with continuized percentile ranks.
 * Equating is only claimed for reviewed, sufficiently large, equivalent
 * groups; the caller must record that evidence. Randomized forms alone are
 * not equivalent forms. */
export interface Moments {mean:number;sd:number}
export function moments(scores:number[]):Moments{
  if(scores.length<2)throw new RangeError('Equating needs at least two scores per form.');
  const mean=scores.reduce((s,x)=>s+x,0)/scores.length,variance=scores.reduce((s,x)=>s+(x-mean)**2,0)/(scores.length-1);
  return {mean,sd:Math.sqrt(variance)};
}
/** y = μY + (σY/σX)(x − μX). */
export function linearEquating(fromForm:number[],toForm:number[]){
  const x=moments(fromForm),y=moments(toForm);
  if(x.sd===0||y.sd===0)throw new RangeError('Linear equating needs score variation on both forms.');
  return (score:number)=>y.mean+(y.sd/x.sd)*(score-x.mean);
}
/** Percentile rank of integer score x on 0..max with the usual continuization. */
function percentileRanks(scores:number[],max:number){
  const counts=new Float64Array(max+1);for(const s of scores){if(!Number.isInteger(s)||s<0||s>max)throw new RangeError('Equipercentile equating needs integer scores within 0..max.');counts[s]++;}
  const n=scores.length,cumulative=new Float64Array(max+2);for(let x=0;x<=max;x++)cumulative[x+1]=cumulative[x]+counts[x]/n;
  return {pr:(x:number)=>100*(cumulative[x]+(cumulative[x+1]-cumulative[x])/2),cumulative};
}
export function equipercentileEquating(fromForm:number[],fromMax:number,toForm:number[],toMax:number){
  const from=percentileRanks(fromForm,fromMax),to=percentileRanks(toForm,toMax);
  return (score:number)=>{
    if(!Number.isInteger(score)||score<0||score>fromMax)throw new RangeError('Score outside the source form range.');
    const p=from.pr(score)/100;
    // Invert the continuized cumulative distribution of the target form.
    for(let y=0;y<=toMax;y++){const lo=to.cumulative[y],hi=to.cumulative[y+1];if(p<=hi||y===toMax){if(hi===lo)return y-0.5;return Math.min(toMax+0.5,Math.max(-0.5,y-0.5+(p-lo)/(hi-lo)));}}
    return toMax;
  };
}
