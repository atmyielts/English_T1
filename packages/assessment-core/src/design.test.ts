import {blankAssessment,buildAssessment,editAssessment,restoreAssessment,moveDesignEntry} from './design.ts';
import {buildManifest,canonicalJson,validateDefinition,type Item} from './mod.ts';
const id=(n:number)=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function eq(a:unknown,b:unknown){if(canonicalJson(a)!==canonicalJson(b))throw new Error(`${JSON.stringify(a)} differs from ${JSON.stringify(b)}`);}
function rejects(fn:()=>unknown){try{fn();}catch{return;}throw new Error('Expected invalid design to be rejected.');}
Deno.test('structured design roundtrips pinned sections, timing, language and independent shuffle switches',()=>{
 const definition=validateDefinition({schema_version:'assessment.definition.v1',title:'Placement',locale:'uz',duration_seconds:600,shuffle_items:false,shuffle_options:true,sections:[{id:id(1),title:'Math',duration_seconds:300,item_version_ids:[id(2),id(3)],draw_count:1},{id:id(4),title:'Writing',item_version_ids:[id(5)]}]});
 eq(buildAssessment(restoreAssessment(editAssessment(definition))),definition);eq(editAssessment(definition).sections[0].selection,'pool');eq(editAssessment(definition).sections[1].selection,'fixed');
});
Deno.test('incomplete encrypted designs restore but cannot be submitted as complete definitions',()=>{const draft=blankAssessment();eq(restoreAssessment(draft),draft);rejects(()=>buildAssessment(draft));rejects(()=>restoreAssessment({...draft,sections:[draft.sections[0],draft.sections[0]]}));rejects(()=>restoreAssessment({...draft,seconds:600}));});
Deno.test('design prevents duplicate question versions across sections and impossible timers and draws',()=>{
 const draft=blankAssessment();draft.title='Test';draft.sections[0]={id:id(1),title:'Part',seconds:'30',selection:'fixed',draw:'1',items:[id(2)]};draft.seconds='60';
 rejects(()=>buildAssessment({...draft,seconds:'60.5'}));rejects(()=>buildAssessment({...draft,sections:[{...draft.sections[0],seconds:'61'}]}));rejects(()=>buildAssessment({...draft,sections:[{...draft.sections[0],selection:'pool',draw:'2'}]}));rejects(()=>buildAssessment({...draft,sections:[draft.sections[0],{...draft.sections[0],id:id(3)}]}));
});
Deno.test('keyboard reorder helpers preserve pinned identifiers and reject out-of-bounds operations',()=>{eq(moveDesignEntry([1,2,3],0,2),[2,3,1]);eq(moveDesignEntry([1,2],0,-1),[1,2]);eq(moveDesignEntry([1,2],.5,1),[1,2]);});
Deno.test('random pool selection preserves author order unless item shuffling is enabled',()=>{
 const definition=validateDefinition({schema_version:'assessment.definition.v1',title:'Pool',locale:'en',duration_seconds:60,shuffle_items:false,shuffle_options:false,sections:[{id:id(8),title:'Part',item_version_ids:[id(1),id(2),id(3)],draw_count:2}]});
 const item:Item={schema_version:'assessment.item.v1',type:'numeric',prompt:'Number?',locale:'en',max_score:1,tags:[]};const approved=[1,2,3].map(n=>({id:id(n),item,key:{numeric:{value:n,tolerance:0}},approved_by:id(9),created_by:id(10)}));
 eq(buildManifest(id(7),definition,approved,()=>1).sections[0].items.map(v=>v.item_version_id),[id(1),id(3)]);eq(buildManifest(id(7),{...definition,shuffle_items:true},approved,()=>0).sections[0].items.map(v=>v.item_version_id),[id(3),id(2)]);
});
