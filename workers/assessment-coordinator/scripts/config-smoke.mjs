import {unstable_readConfig} from 'wrangler';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const configPath=fileURLToPath(new URL('../wrangler.toml',import.meta.url)),names=[],queues=[],deadLetters=[];
for(const environment of [undefined,'staging','production']){
 const config=unstable_readConfig({config:configPath,...(environment?{env:environment}:{})});
 assert.equal(config.workers_dev,false);assert.deepEqual(config.triggers.crons,['* * * * *']);
 assert.equal(config.durable_objects.bindings.length,1);assert.equal(config.durable_objects.bindings[0].name,'ATTEMPTS');assert.equal(config.durable_objects.bindings[0].class_name,'AttemptCoordinator');
 const producer=config.queues.producers.find(row=>row.binding==='RECOVERY_QUEUE');assert.ok(producer);
 const consumer=config.queues.consumers.find(row=>row.queue===producer.queue);assert.ok(consumer);assert.equal(consumer.max_batch_size,25);assert.equal(consumer.max_concurrency,8);assert.equal(consumer.max_retries,5);assert.ok(consumer.dead_letter_queue);
 assert.notEqual(consumer.dead_letter_queue,consumer.queue);assert.equal(Number(config.vars.RECOVERY_BATCH_LIMIT),200);
 names.push(config.name);queues.push(producer.queue);deadLetters.push(consumer.dead_letter_queue);
}
const production=unstable_readConfig({config:configPath,env:'production'});assert.equal(production.vars.ALLOWED_ORIGINS,'https://exam.schood.online');assert.match(String(production.vars.SUPABASE_URL),/^https:\/\/[a-z0-9]+\.supabase\.co$/);assert.equal(JSON.stringify(production.routes),JSON.stringify([{pattern:'exam-api.schood.online',custom_domain:true}]));
assert.equal(new Set(names).size,3);assert.equal(new Set([...queues,...deadLetters]).size,6);
process.stdout.write('Passed local Wrangler config validation: separate dev/staging/production Workers, recovery queues and DLQs, bounded consumers and owned minute cron. No provider resource was created.\n');
