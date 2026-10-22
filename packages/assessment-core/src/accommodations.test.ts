import {breakPolicy,NO_BREAKS} from './accommodations.ts';
function assert(value:unknown){if(!value)throw new Error('Assertion failed');}
Deno.test('Break limits are strict, explicit and support both clock policies',()=>{
 assert(breakPolicy(NO_BREAKS).max_breaks===0);
 for(const clock of ['running','stopped'])assert(breakPolicy({...NO_BREAKS,clock,max_breaks:3,max_seconds:300,total_seconds:700}).clock===clock);
});
Deno.test('Invalid, coerced, unbounded and contradictory policies are rejected',()=>{
 for(const changes of [{max_breaks:'1'},{clock:['stopped']},{clock:'paused'},{max_breaks:21},{max_seconds:1},{total_seconds:1},{max_breaks:1},{max_breaks:1,max_seconds:300,total_seconds:200},{max_breaks:1,max_seconds:0.5,total_seconds:10},{max_breaks:1,max_seconds:3601,total_seconds:4000},{max_breaks:1,max_seconds:300,total_seconds:14401},{diagnosis:'not accepted'}]){
  let denied=false;try{breakPolicy({...NO_BREAKS,...changes});}catch{denied=true;}assert(denied);
 }
});
