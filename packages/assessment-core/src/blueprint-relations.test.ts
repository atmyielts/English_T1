import {blueprint,BLUEPRINT_PROTOCOL,BLUEPRINT_PROTOCOL_V2,BlueprintError,satisfiesBlueprint,selectBlueprint,type BlueprintCandidate} from './blueprint.ts';
import {ITEM_TYPES} from './mod.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
const rejects=(fn:()=>unknown,code:string)=>{try{fn();}catch(cause){if(cause instanceof BlueprintError&&cause.code===code)return;throw cause;}throw new Error('Accepted invalid input: '+code);};
const pool=[1,2,3,4,5,6].map(n=>id(n));
const items:BlueprintCandidate[]=pool.map(value=>({id:value,item:{type:'numeric',max_score:1,classification:{topics:['Algebra']}}}));
let seed=7;const next=(max:number)=>{seed=(seed*1103515245+12345)%2147483648;return seed%max;};

Deno.test('v2 accepts normalised enemies, families and exposure only for questions in the section',()=>{
 const parsed=blueprint({schema_version:BLUEPRINT_PROTOCOL_V2,rules:[],enemies:[[id(2),id(1)]],families:[{id:id(90),label:' Reading passage A ',item_version_ids:[id(3),id(4),id(5)],maximum:1}],exposure:{maximum_per_sitting:50}},3,ITEM_TYPES,pool);
 equal(parsed.enemies,[[id(1),id(2)]]);equal(parsed.families?.[0].label,'Reading passage A');equal(parsed.exposure,{maximum_per_sitting:50});
 rejects(()=>blueprint({schema_version:BLUEPRINT_PROTOCOL_V2,rules:[],enemies:[[id(1),id(99)]]},3,ITEM_TYPES,pool),'invalid_blueprint');
 rejects(()=>blueprint({schema_version:BLUEPRINT_PROTOCOL_V2,rules:[],enemies:[[id(1),id(1)]]},3,ITEM_TYPES,pool),'invalid_blueprint');
 rejects(()=>blueprint({schema_version:BLUEPRINT_PROTOCOL_V2,rules:[],families:[{id:id(90),label:'x',item_version_ids:[id(1),id(2)],maximum:4}]},3,ITEM_TYPES,pool),'invalid_blueprint');
 rejects(()=>blueprint({schema_version:BLUEPRINT_PROTOCOL_V2,rules:[],exposure:{maximum_per_sitting:0}},3,ITEM_TYPES,pool),'invalid_blueprint');
 rejects(()=>blueprint({schema_version:BLUEPRINT_PROTOCOL_V2,rules:[]},3,ITEM_TYPES,pool),'invalid_blueprint');
 rejects(()=>blueprint({schema_version:BLUEPRINT_PROTOCOL,rules:[],enemies:[[id(1),id(2)]],minimum_points:0},3,ITEM_TYPES,pool),'invalid_blueprint');
});
Deno.test('assembly never delivers enemies together or exceeds a family maximum',()=>{
 const rules=blueprint({schema_version:BLUEPRINT_PROTOCOL_V2,rules:[],enemies:[[id(1),id(2)],[id(1),id(3)]],families:[{id:id(90),label:'Passage',item_version_ids:[id(4),id(5),id(6)],maximum:1}]},3,ITEM_TYPES,pool);
 for(let run=0;run<200;run++){
  const chosen=selectBlueprint(items,3,rules,next).map(item=>item.id);
  if(chosen.includes(id(1))&&(chosen.includes(id(2))||chosen.includes(id(3))))throw new Error('Enemies delivered together: '+chosen);
  if(chosen.filter(value=>[id(4),id(5),id(6)].includes(value)).length>1)throw new Error('Family maximum exceeded: '+chosen);
  if(!satisfiesBlueprint(items.filter(item=>chosen.includes(item.id)),rules))throw new Error('Chosen form fails its own check');
 }
 // Five draws need at least two passage questions, which the family forbids.
 rejects(()=>selectBlueprint(items,5,blueprint({schema_version:BLUEPRINT_PROTOCOL_V2,rules:[],families:[{id:id(90),label:'Passage',item_version_ids:[id(4),id(5),id(6)],maximum:1}]},5,ITEM_TYPES,pool),next),'blueprint_infeasible');
});
Deno.test('saturated questions are not drawn and exhaustion is reported without relaxing rules',()=>{
 const rules=blueprint({schema_version:BLUEPRINT_PROTOCOL_V2,rules:[],enemies:[[id(1),id(2)]],exposure:{maximum_per_sitting:10}},3,ITEM_TYPES,pool);
 const unavailable=new Set([id(3),id(4)]);
 for(let run=0;run<100;run++){const chosen=selectBlueprint(items,3,rules,next,{remaining:100000},unavailable).map(item=>item.id);if(chosen.some(value=>unavailable.has(value)))throw new Error('Saturated question drawn');}
 // Remaining open questions: 1,2,5,6 with 1–2 enemies → 3 still possible (1,5,6 or 2,5,6).
 rejects(()=>selectBlueprint(items,3,rules,next,{remaining:100000},new Set([id(3),id(4),id(5)])),'blueprint_exposure_exhausted');
 rejects(()=>selectBlueprint(items,3,rules,next,{remaining:100000},new Set([id(1),id(3),id(4),id(5)])),'blueprint_exposure_exhausted');
});
