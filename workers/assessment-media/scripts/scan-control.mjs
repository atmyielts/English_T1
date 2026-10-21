import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
/** Fixture observation only. Every accepted job still runs the actual broker,
 * leased PostgreSQL job, encrypted R2 retrieval and isolated native scanner. */
export function scanControl(countReady,runOne){
  const jobs=new Map();let active=null,work=Promise.resolve();
  const view=job=>({...job});
  return {
    start(key,target){
      assert.match(key,/^[a-zA-Z0-9-]{8,80}$/);assert.ok(Number.isSafeInteger(target)&&target>0);
      if(jobs.has(key))return view(jobs.get(key));
      if(active?.state==='running')throw new Error('A different scanner job is still running');
      assert.ok(jobs.size<20,'Fixture scan catalogue exceeded its safety bound');
      const before=countReady(),job={id:randomUUID(),state:'running',scanned:before,remaining:target-before};
      assert.ok(before<target);jobs.set(key,job);active=job;
      work=(async()=>{
        try{await runOne();const scanned=countReady();assert.equal(scanned,before+1);Object.assign(job,{state:'complete',scanned,remaining:target-scanned});}
        catch{job.state='failed';}
      })();
      return view(job);
    },
    status(id){const job=[...jobs.values()].find(job=>job.id===id);assert.ok(job,'Unknown fixture scanner job');return view(job);},
    drain(){return work;},
  };
}
