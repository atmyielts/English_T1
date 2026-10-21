import {alphaInterval,correlationInterval,facilityInterval,fCdf,fQuantile,incompleteBeta,normalQuantile,standardErrorOfMeasurement} from './psychometrics.ts';
const near=(actual:number|null,expected:number,tolerance:number,label:string)=>{if(actual===null||Math.abs(actual-expected)>tolerance)throw new Error(`${label}: expected ${expected}±${tolerance}, got ${actual}`);};
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};

Deno.test('distribution functions match published table values',()=>{
 // Standard normal and F critical values from printed statistical tables.
 near(normalQuantile(0.975),1.959964,1e-6,'z .975');near(normalQuantile(0.95),1.644854,1e-6,'z .95');near(normalQuantile(0.005),-2.575829,1e-6,'z .005');
 near(fQuantile(0.95,5,10),3.3258,1e-3,'F .95(5,10)');near(fQuantile(0.975,10,20),2.7737,1e-3,'F .975(10,20)');near(fQuantile(0.975,20,10),3.4185,1e-3,'F .975(20,10)');near(fQuantile(0.99,1,30),7.5625,1e-3,'F .99(1,30)');
 // Reciprocal identity F_p(a,b)=1/F_{1-p}(b,a).
 near(fQuantile(0.025,10,20),1/fQuantile(0.975,20,10),1e-9,'F reciprocal');
 near(incompleteBeta(0.5,2,2),0.5,1e-12,'I(.5;2,2)');near(fCdf(fQuantile(0.9,7,13),7,13),0.9,1e-9,'F round trip');
});
Deno.test('alpha interval follows Feldt and warns instead of inventing values',()=>{
 const ci=alphaInterval(0.8,100,20);
 // Hand computation: 1-(1-.8)·F.975(99,1881) and 1-(1-.8)·F.025(99,1881).
 near(ci.lower,1-0.2*fQuantile(0.975,99,1881),1e-12,'lower');near(ci.upper,1-0.2*fQuantile(0.025,99,1881),1e-12,'upper');
 if(!(ci.lower!<0.8&&ci.upper!>0.8&&ci.lower!>0.73&&ci.upper!<0.86))throw new Error('Feldt interval outside expected band '+JSON.stringify(ci));
 equal(ci.warnings,[]);
 equal(alphaInterval(0.7,12,10).warnings,['small_sample']);
 equal(alphaInterval(0.7,100,1),{estimate:null,lower:null,upper:null,level:0.95,warnings:['too_few_items']});
 equal(alphaInterval(null,100,10).warnings,['no_score_variance']);
 equal(alphaInterval(-0.2,100,10).warnings,['negative_reliability']);
 const wide=alphaInterval(0.8,10,20),narrow=alphaInterval(0.8,1000,20);
 if(!((wide.upper!-wide.lower!)>(narrow.upper!-narrow.lower!)))throw new Error('Interval does not narrow with sample size');
});
Deno.test('standard error of measurement is SD·√(1−reliability)',()=>{
 near(standardErrorOfMeasurement(10,0.91).estimate,3,1e-12,'SEM');equal(standardErrorOfMeasurement(10,null).estimate,null);equal(standardErrorOfMeasurement(10,-0.1).warnings,['negative_reliability']);
});
Deno.test('Wilson facility interval matches the worked 8/10 example',()=>{
 const ci=facilityInterval(8,10);near(ci.estimate,0.8,1e-12,'p');near(ci.lower,0.4902,1e-4,'lower');near(ci.upper,0.9433,1e-4,'upper');equal(ci.warnings,['small_sample']);
 const all=facilityInterval(40,40);near(all.upper,1,1e-12,'ceiling');equal(all.warnings,['no_item_variance']);if(all.lower!>=1)throw new Error('All-correct item still needs a lower bound');
 equal(facilityInterval(5,0).estimate,null);
});
Deno.test('Fisher z correlation interval matches the r=.5, n=30 example',()=>{
 const ci=correlationInterval(0.5,30);near(ci.lower,0.1704,1e-3,'lower');near(ci.upper,0.7296,1e-3,'upper');equal(ci.warnings,[]);
 equal(correlationInterval(null,50).warnings,['no_item_variance']);equal(correlationInterval(0.4,3).lower,null);
});
