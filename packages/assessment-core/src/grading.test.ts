import {gradeBundle,rubricScore,scoreUnits,validateRubric} from './grading.ts';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
const fails=(work:()=>unknown)=>{let failed=false;try{work();}catch{failed=true;}if(!failed)throw new Error('Invalid grading input accepted');};
const id='20000000-0000-4000-8000-000000000001',rubric={title:'Writing',criteria:[{id:'a',title:'Accuracy',max_score:9,descriptor:'Accuracy criteria'},{id:'b',title:'Content',max_score:9,descriptor:'Content criteria'}]};
const objective={schema_version:'assessment.item.v1',type:'single_choice',prompt:'2 + 2?',locale:'en',max_score:1,tags:[],options:[{id:'a',text:'4'},{id:'b',text:'5'}]};
Deno.test('deterministic grade reports use latest supplied canonical response and strip private material',()=>{
 const report=gradeBundle({input_hash:'a'.repeat(64),candidate_id:'PRIVATE',items:[{item_version_id:id,item:objective,key:{correct:'a'},response:'a',score:999}]});equal(report.scores[0].score,1);equal(JSON.stringify(report).includes('correct'),false);equal(JSON.stringify(report).includes('PRIVATE'),false);equal(JSON.stringify(report).includes('2 + 2'),false);
});
Deno.test('unanswered objective items score zero, while even blank subjective responses need humans',()=>{
 const report=gradeBundle({input_hash:'a'.repeat(64),items:[{item_version_id:id,item:objective,key:{correct:'a'}},{item_version_id:'20000000-0000-4000-8000-000000000002',item:{...objective,type:'essay',rubric_id:id},key:{},rubric,response:''}]});equal(report.scores.map(row=>[row.score,row.status]),[[0,'scored'],[null,'needs_human']]);
});
Deno.test('grading rejects duplicate form items, missing rubrics and unsupported precision',()=>{
 const row={item_version_id:id,item:objective,key:{correct:'a'}};fails(()=>gradeBundle({input_hash:'a'.repeat(64),items:[row,row]}));fails(()=>gradeBundle({input_hash:'a'.repeat(64),items:[{...row,item:{...objective,type:'essay',rubric_id:id}}]}));fails(()=>scoreUnits(0.1234567));fails(()=>scoreUnits(-1));
});
Deno.test('rubric criteria normalize deterministically to the item scale using exact integer arithmetic',()=>{equal(rubricScore(rubric,{a:6,b:9},9),7.5);equal(rubricScore(rubric,{a:1,b:0},1),0.055556);equal(rubricScore(rubric,{a:9,b:9},9),9);});
Deno.test('human marks require every unique criterion and bounded values',()=>{fails(()=>rubricScore(rubric,{a:8},9));fails(()=>rubricScore(rubric,{a:8,b:8,c:1},9));fails(()=>rubricScore(rubric,{a:10,b:8},9));fails(()=>validateRubric({...rubric,criteria:[rubric.criteria[0],rubric.criteria[0]]}));});
