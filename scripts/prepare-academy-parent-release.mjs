// Prepare a parent-only overlay on an immutable capture of installed Academy
// source. Never deploys, changes production or replaces unrelated modules.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,realpathSync,existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const option=name=>process.argv.find(v=>v.startsWith(name+'='))?.slice(name.length+1);
const commit=option('--reviewed-commit'),captureOption=option('--capture-root'),outputOption=option('--output-dir');
assert(/^[a-f0-9]{40}$/.test(commit??'')&&captureOption&&outputOption,'Explicit reviewed commit, capture and fresh output required');
const workspace=realpathSync('.'),capture=realpathSync(captureOption),output=path.resolve(outputOption);
const reserved=path.join(workspace,'supabase','.temp','parent-release')+path.sep;
assert(capture.startsWith(reserved)&&output.startsWith(reserved)&&!existsSync(output),'Use owned parent-release directories');
let ancestor=path.dirname(output);while(!existsSync(ancestor))ancestor=path.dirname(ancestor);
assert(realpathSync(ancestor).startsWith(reserved),'Output parent must remain in the owned release directory');
const hash=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
function command(name,args){const result=spawnSync(name,args,{encoding:'utf8',windowsHide:true,maxBuffer:16777216,timeout:30000});assert.equal(result.status,0,'Read-only release source/identity command failed');return result.stdout;}
const reviewed=file=>command('git',['show',commit+':'+file]).replaceAll('\r\n','\n');
const baseline=JSON.parse(readFileSync(path.join(capture,'baseline.json'),'utf8'));
assert.equal(baseline.projectRef,'bbjawctnqrufvnesdsel');assert.equal(baseline.name,'academy');
assert.equal(baseline.productionChanged,false);assert.equal(baseline.customerRowsRead,false);
const inventory=JSON.parse(command('supabase',['functions','list','--project-ref',baseline.projectRef,'--output','json']));
const installed=inventory.find(f=>f.name==='academy');
assert(installed?.status==='ACTIVE'&&installed.id===baseline.id&&installed.version===baseline.version&&installed.verify_jwt===baseline.verifyJwt,'Installed source drift requires a fresh capture');
const files=new Map();
for(const file of baseline.files){
 assert(/^supabase\/functions\/[a-z0-9_-]+\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.ts$/.test(file.path)&&!file.path.split('/').some(p=>p==='.'||p==='..')&&!files.has(file.path),'Invalid captured runtime path');
 const full=realpathSync(path.join(capture,file.path));assert(full.startsWith(capture+path.sep),'Capture escapes owned directory');
 const source=readFileSync(full,'utf8');assert.equal(hash(source),file.sha256LF,'Captured source changed');
 files.set(file.path,{source,baselineSha256LF:file.sha256LF,kind:'retained-installed'});
}
const gateway='supabase/functions/academy/index.ts',original=files.get(gateway)?.source.replaceAll('\r\n','\n');assert(original);
const next=reviewed(gateway);let source=original;const replacements=[];
function section(text,start,end){assert.equal(text.split(start).length,2,'Unique parent start required');const a=text.indexOf(start),b=text.indexOf(end,a);assert(a>=0&&b>a,'Parent route boundary missing');return text.slice(a,b);}
function replace(start,end,newStart=start){const old=section(source,start,end),updated=section(next,newStart,end);source=source.replace(old,updated);replacements.push({old,updated});}
replace('    const actionBody = normalizeText(body?.action, 64).toLowerCase();','    if (requestedAction === "invitation_status")','    const rawActionBody =');
replace('    if (requestedAction === "guardian_claim_link"','    if (requestedAction === "guardian_update_preferences"');
replace('    if (requestedAction === "guardian_service_requests")','    if (requestedAction === "guardian_service_request_create"');
const parentImport=next.split('\n').find(line=>line.includes("from './guardian-portal.ts'"));assert(parentImport&&!source.includes(parentImport));source=parentImport+'\n'+source;
const catcher='  } catch (err) {',at=source.lastIndexOf(catcher);assert(at>=0);
const errorLine='\n    if(err instanceof GuardianPortalError)return json(err.status,{error:err.message,retryable:err.retryable});';
source=source.slice(0,at)+source.slice(at).replace(catcher,catcher+errorLine);
// Reversing exactly the reviewed edits must reconstruct the entire installed
// gateway. This proves preservation of unrelated and concurrent proctor code.
let restored=source.replace(parentImport+'\n','').replace(catcher+errorLine,catcher);
for(const {old,updated} of replacements.toReversed())restored=restored.replace(updated,old);
assert.equal(restored,original,'Unreviewed gateway change detected');
files.set(gateway,{source,baselineSha256LF:hash(original),kind:'reviewed-parent-overlay'});
for(const file of ['supabase/functions/academy/guardian-portal.ts','supabase/functions/_shared/telegram-init-data.ts']){
 const source=reviewed(file),existing=files.get(file);assert(!existing||hash(existing.source)===hash(source),'Existing shared source differs; review it rather than overwrite');
 if(!existing)files.set(file,{source,baselineSha256LF:null,kind:'reviewed-parent-dependency'});
}
for(const [file,{source}] of files)for(const match of source.matchAll(/(?:from|import)\s*["'](\.{1,2}\/[^"']+)["']/g))assert(files.has(path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]))),'Runtime dependency missing');
mkdirSync(output,{recursive:true});
for(const [file,{source}] of files){const dest=path.join(output,file);mkdirSync(path.dirname(dest),{recursive:true});writeFileSync(dest,source);}
writeFileSync(path.join(output,'supabase/config.toml'),`project_id = "schood-parent-release"\n\n[functions.academy]\nverify_jwt = ${baseline.verifyJwt}\n`);
const proof={status:'prepared_not_deployed',preparedAt:new Date().toISOString(),productionChanged:false,reviewedCommit:commit,projectRef:baseline.projectRef,previousVersion:baseline.version,verifyJwt:baseline.verifyJwt,retainedInstalledGateway:true,files:[...files].map(([file,item])=>({path:file,sha256LF:hash(item.source),baselineSha256LF:item.baselineSha256LF,kind:item.kind}))};
writeFileSync(path.join(output,'prepared-bundle.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({prepared:true,previousVersion:baseline.version,modules:files.size,unrelatedGatewayPreserved:true,productionChanged:false}));
