import {spawn,spawnSync} from 'node:child_process';
import {access} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const child=spawn(process.execPath,['workers/assessment-media/scripts/browser-stack.mjs'],{cwd:root,stdio:['ignore','pipe','pipe','ipc']});
let resources,diagnostic='',timer;
child.stdout.on('data',()=>{});child.stderr.on('data',data=>diagnostic=(diagnostic+data).slice(-2000));
child.on('message',message=>{
  if(message?.type!=='assessment.fixture.database')return;
  assert.match(message.container,/^schood-media-browser-[a-f0-9]{8}$/);
  assert.equal(path.dirname(path.resolve(message.directory)),path.resolve(tmpdir()));
  assert.ok(path.basename(message.directory).startsWith('schood-media-browser-'));
  resources=message;child.send({type:'assessment.fixture.stop'});
});
try{
  await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Startup cancellation did not clean up within 60 seconds.')),60000);child.once('error',reject);child.once('close',code=>resources&&code!==0?resolve():reject(new Error(diagnostic||'Startup cancellation was not exercised.')));});
  assert.notEqual(spawnSync('docker',['inspect',resources.container],{encoding:'utf8'}).status,0,'Cancelled startup left its generated database behind');
  await assert.rejects(access(resources.directory),{code:'ENOENT'});
  console.log(JSON.stringify({event:'media.browser.startup.cleanup',cancelledBeforeReadiness:true,databaseRemoved:true,temporaryBuildsRemoved:true,externalResourcesTouched:false}));
}finally{clearTimeout(timer);if(child.exitCode===null&&child.connected)child.send({type:'assessment.fixture.stop'});}
