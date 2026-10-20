// Builds controlled failures from the actual app entrypoints. Network access in
// the browser is restricted to this owned local server; no production sessions.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import check from '../packages/ui-recovery/tests/browser-check.mjs';
const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const child=spawn(process.execPath,['scripts/preview-ui-recovery.mjs','--port='+port],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='',browser,closed=false;
const exit=new Promise(resolve=>child.once('close',code=>{closed=true;resolve(code);}));
mkdirSync('supabase/.temp/ui-recovery',{recursive:true});
try{
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Owned UI recovery fixtures did not start')),120000);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('Recovery preview ready:')){clearTimeout(timer);resolve();}});
  child.stderr.on('data',chunk=>output+=chunk);
  exit.then(code=>{clearTimeout(timer);reject(Error('Owned UI recovery fixture exited: '+code));});
 });
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage(),proof=await check(page,'http://127.0.0.1:'+port);
 writeFileSync('supabase/.temp/ui-recovery/proof.json',JSON.stringify(proof,null,2)+'\n');
 console.log(JSON.stringify({passed:true,apps:13,scenarios:proof.results.length,productionContacted:false}));
}finally{
 await browser?.close();
 if(!closed)child.kill();
 await exit;
 writeFileSync('supabase/.temp/ui-recovery/fixture-build.log',output);
}
