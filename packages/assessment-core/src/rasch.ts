/** Rasch (1PL) calibration by joint maximum likelihood with the (L−1)/L bias
 * correction. Difficulties are centred at 0 logits. Items and persons with
 * zero or perfect scores are excluded and reported, never given infinite
 * estimates. Fit statistics accompany every item. This is a calibration
 * tool for reviewed datasets, not an automatic scoring change. */
export interface RaschItem {index:number;difficulty:number;standardError:number;infit:number;outfit:number}
export interface RaschResult {
  converged:boolean;iterations:number;items:RaschItem[];abilities:(number|null)[];
  excludedItems:number[];excludedPersons:number[];
}
const logistic=(x:number)=>1/(1+Math.exp(-x));
export function calibrateRasch(responses:(0|1|null)[][],options:{maxIterations?:number;tolerance?:number}={}):RaschResult{
  const maxIterations=options.maxIterations??500,tolerance=options.tolerance??1e-6;
  const persons=responses.length,itemCount=persons?responses[0].length:0;
  if(!persons||!itemCount||responses.some(row=>row.length!==itemCount))throw new RangeError('Use a rectangular person × item response matrix.');
  let activePersons=[...Array(persons).keys()],activeItems=[...Array(itemCount).keys()];
  const excludedItems=new Set<number>(),excludedPersons=new Set<number>();
  // Iteratively remove extreme persons/items (removing one can make another extreme).
  for(let changed=true;changed;){
    changed=false;
    for(const p of activePersons){const seen=activeItems.filter(i=>responses[p][i]!==null),score=seen.reduce((s,i)=>s+(responses[p][i] as number),0);if(!seen.length||score===0||score===seen.length){excludedPersons.add(p);changed=true;}}
    activePersons=activePersons.filter(p=>!excludedPersons.has(p));
    for(const i of activeItems){const seen=activePersons.filter(p=>responses[p][i]!==null),score=seen.reduce((s,p)=>s+(responses[p][i] as number),0);if(!seen.length||score===0||score===seen.length){excludedItems.add(i);changed=true;}}
    activeItems=activeItems.filter(i=>!excludedItems.has(i));
    if(activeItems.length<2||activePersons.length<2)break;
  }
  if(activeItems.length<2||activePersons.length<2)return {converged:false,iterations:0,items:[],abilities:Array(persons).fill(null),excludedItems:[...excludedItems].sort((a,b)=>a-b),excludedPersons:[...excludedPersons].sort((a,b)=>a-b)};
  const b=new Float64Array(itemCount),theta=new Float64Array(persons);
  const itemScore=new Float64Array(itemCount),personScore=new Float64Array(persons);
  for(const p of activePersons)for(const i of activeItems){const x=responses[p][i];if(x!==null){itemScore[i]+=x;personScore[p]+=x;}}
  let iterations=0,converged=false;
  for(;iterations<maxIterations&&!converged;iterations++){
    let largest=0;
    for(const p of activePersons){let expected=0,info=0;for(const i of activeItems){if(responses[p][i]===null)continue;const pr=logistic(theta[p]-b[i]);expected+=pr;info+=pr*(1-pr);}const step=Math.max(-1,Math.min(1,(personScore[p]-expected)/info));theta[p]+=step;largest=Math.max(largest,Math.abs(step));}
    for(const i of activeItems){let expected=0,info=0;for(const p of activePersons){if(responses[p][i]===null)continue;const pr=logistic(theta[p]-b[i]);expected+=pr;info+=pr*(1-pr);}const step=Math.max(-1,Math.min(1,(expected-itemScore[i])/info));b[i]+=step;largest=Math.max(largest,Math.abs(step));}
    const mean=activeItems.reduce((s,i)=>s+b[i],0)/activeItems.length;for(const i of activeItems)b[i]-=mean;for(const p of activePersons)theta[p]-=mean;
    converged=largest<tolerance;
  }
  const correction=(activeItems.length-1)/activeItems.length;
  const items=activeItems.map(i=>{
    let info=0,outfit=0,infitNum=0,infitDen=0,n=0;
    for(const p of activePersons){const x=responses[p][i];if(x===null)continue;const pr=logistic(theta[p]-b[i]),v=pr*(1-pr),res=x-pr;info+=v;outfit+=res*res/v;infitNum+=res*res;infitDen+=v;n++;}
    return {index:i,difficulty:b[i]*correction,standardError:1/Math.sqrt(info),infit:infitNum/infitDen,outfit:outfit/n};
  });
  const abilities=Array.from({length:persons},(_,p)=>excludedPersons.has(p)?null:theta[p]*correction);
  return {converged,iterations,items,abilities,excludedItems:[...excludedItems].sort((a,b)=>a-b),excludedPersons:[...excludedPersons].sort((a,b)=>a-b)};
}
