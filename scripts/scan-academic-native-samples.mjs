import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
/** Scan the exact generated native bytes recovered from encrypted IndexedDB.
 * No personal devices, URLs, authority credentials or production stores. */
export async function scanNativeSamples(samples, root) {
  assert.ok(Array.isArray(samples) && samples.length >= 2 && samples.length <= 3);
  const database=await realpath(process.env.ASSESSMENT_SCANNER_DATABASE ?? path.join(root,'output/assessment-scanner/signatures')),
    image=process.env.ASSESSMENT_SCANNER_IMAGE ?? 'schood-assessment-scanner-local',results=[];
  assert.ok(!database.includes(','));
  const directory=await mkdtemp(path.join(os.tmpdir(),'schood-native-answer-scan-'));
  try {
    for(const [index,sample] of samples.entries()) {
      assert.ok(['video/webm','audio/webm','audio/mp4'].includes(sample.mime));
      assert.ok(typeof sample.base64==='string' && sample.base64.length>0 && sample.base64.length<=8*1048576 && /^[a-zA-Z0-9+/]+={0,2}$/.test(sample.base64));
      const file=path.join(directory,`sample-${index}`);await writeFile(file,Buffer.from(sample.base64,'base64'));
      const args=['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--memory','4g','--cpus','2','--tmpfs','/tmp:rw,noexec,nosuid,size=256m','--mount',`type=bind,src=${database},dst=/signatures,readonly`,'--mount',`type=bind,src=${file},dst=/work/artifact,readonly`,'--entrypoint','python3',image,'/app/scanner.py','--inspect','/work/artifact','--mime',sample.mime,'--database','/signatures'];
      const output=await new Promise((resolve,reject)=>{const child=spawn('docker',args,{cwd:root,stdio:['ignore','pipe','pipe']});let out='',error='';child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve(out):reject(new Error(error||out||'Native recording scanner failed.')));});
      const receipt=JSON.parse(output);assert.equal(receipt.verdict,'clean',`${sample.mime}: ${receipt.reason}`);assert.equal(receipt.detected_mime,sample.mime);assert.equal(receipt.decoder_checked,true);
      results.push({mime:sample.mime,bytes:Buffer.from(sample.base64,'base64').length,verdict:receipt.verdict,decoder_checked:true});
    }
    return results;
  } finally {
    const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('schood-native-answer-scan-'));await rm(resolved,{recursive:true,force:true});
  }
}
