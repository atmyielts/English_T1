import {mantelHaenszel,type Stratum} from './dif.ts';
import {calibrateRasch} from './rasch.ts';
import {equipercentileEquating,linearEquating} from './equating.ts';
const near=(a:number|null,b:number,tol:number,label:string)=>{if(a===null||Math.abs(a-b)>tol)throw new Error(`${label}: expected ${b}±${tol}, got ${a}`);};
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
const strata=(rc:number,ri:number,fc:number,fi:number,k=3):Stratum[]=>Array.from({length:k},()=>({referenceCorrect:rc,referenceIncorrect:ri,focalCorrect:fc,focalIncorrect:fi}));

Deno.test('Mantel–Haenszel matches hand computation and ETS categories',()=>{
 const none=mantelHaenszel(strata(60,40,60,40,3));near(none.alpha,1,1e-12,'alpha');near(none.deltaDif,0,1e-12,'delta');equal([none.category,none.favours],['A','neither']);
 // Per stratum R=80·60/200=24, S=20·40/200=4 → α=6, D=−2.35·ln 6.
 const strong=mantelHaenszel(strata(80,20,40,60,3));near(strong.alpha,6,1e-12,'alpha');near(strong.deltaDif,-2.35*Math.log(6),1e-12,'delta');equal([strong.category,strong.favours,strong.significant],['C','reference',true]);
 // α=(70·40)/(30·60)=1.556, |D|≈1.04: significant with large groups, but under 1.5 → B.
 const moderate=mantelHaenszel(strata(700,300,600,400,3));near(moderate.deltaDif,-2.35*Math.log(2800/1800),1e-9,'delta');equal(moderate.category,'B');
 // Small but permitted groups (minimum lowered explicitly): a modest difference is not significant → A.
 equal(mantelHaenszel(strata(7,3,6,4,3),20).category,'A');
});
Deno.test('small groups are not analysed and nothing is disclosed',()=>{
 const small=mantelHaenszel(strata(20,10,15,15,3));
 equal([small.status,small.alpha,small.deltaDif,small.category],['insufficient_sample',null,null,null]);
 equal(mantelHaenszel([{referenceCorrect:-1,referenceIncorrect:0,focalCorrect:0,focalIncorrect:0}]).status,'undefined');
});
Deno.test('Rasch calibration recovers known difficulties from seeded simulated data',()=>{
 let seed=20261022;const random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
 const normal=()=>Math.sqrt(-2*Math.log(1-random()))*Math.cos(2*Math.PI*random());
 const truth=Array.from({length:20},(_,i)=>-2+4*i/19),persons=Array.from({length:2000},normal);
 const data=persons.map(theta=>truth.map(b=>(random()<1/(1+Math.exp(-(theta-b)))?1:0) as 0|1));
 const result=calibrateRasch(data);
 if(!result.converged)throw new Error('Calibration did not converge');
 const estimated=result.items.map(item=>item.difficulty),rmse=Math.sqrt(estimated.reduce((s,b,i)=>s+(b-truth[i])**2,0)/truth.length);
 if(rmse>0.12)throw new Error('Difficulty recovery RMSE '+rmse);
 if(result.items.some(item=>item.infit<0.85||item.infit>1.15||item.standardError<=0))throw new Error('Fit or standard errors implausible for model-generated data');
});
Deno.test('extreme items and persons are excluded and reported, never given infinite estimates',()=>{
 const data:(0|1|null)[][]=[[1,1,0,1],[0,1,0,1],[1,1,1,0],[0,1,0,0],[0,0,0,0],[1,1,0,1]];
 const result=calibrateRasch(data);
 // Removing the all-wrong person 4 makes item 1 all-correct; removing item 1 makes person 3 all-wrong.
 equal(result.excludedItems,[1]);equal(result.excludedPersons,[3,4]);equal([result.abilities[3],result.abilities[4]],[null,null]);
 if(result.items.some(item=>!Number.isFinite(item.difficulty)))throw new Error('Infinite estimate');
 const allCorrect=calibrateRasch([[1,1,0],[1,0,1],[1,1,1],[1,0,0]]);equal(allCorrect.excludedItems.includes(0),true);
});
Deno.test('equating reproduces exact shifts and scales and is the identity for equal forms',()=>{
 const x=[2,4,4,5,6,7,8,9,10,12],shifted=x.map(s=>s+2),doubled=x.map(s=>2*s);
 near(linearEquating(x,shifted)(10),12,1e-12,'shift');near(linearEquating(x,doubled)(7),14,1e-12,'scale');
 const equal_=equipercentileEquating(x,15,x,15);for(const s of [2,5,9,12])near(equal_(s),s,1e-12,'identity '+s);
 const up=equipercentileEquating(x,15,shifted,17);near(up(6),8,1e-12,'equipercentile shift');
 const values=[...Array(16).keys()].map(up);if(values.some((v,i)=>i&&v<values[i-1]))throw new Error('Equipercentile function not monotone');
});
