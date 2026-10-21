import {unstable_readConfig} from 'wrangler';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const config=fileURLToPath(new URL('../wrangler.toml',import.meta.url)),names=[],queues=[];
for(const env of [undefined,'staging','production']){const value=unstable_readConfig({config,...(env?{env}:{})});assert.equal(value.workers_dev,false);assert.deepEqual(value.triggers.crons,['* * * * *']);const producer=value.queues.producers.find(row=>row.binding==='ROSTER_QUEUE'),consumer=value.queues.consumers.find(row=>row.queue===producer?.queue);assert.ok(consumer);assert.equal(consumer.max_concurrency,5);assert.equal(consumer.max_retries,5);assert.equal(Number(value.vars.ROSTER_BATCH_LIMIT),20);names.push(value.name);queues.push(producer.queue,consumer.dead_letter_queue);}
assert.equal(new Set(names).size,3);assert.equal(new Set(queues).size,6);process.stdout.write('Passed isolated roster Worker/queue/DLQ configuration, no public HTTP service or provider creation.\n');
