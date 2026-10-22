import {unstable_readConfig} from 'wrangler';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const config=fileURLToPath(new URL('../wrangler.toml',import.meta.url)),names=[];
for(const env of [undefined,'staging','production']){const value=unstable_readConfig({config,...(env?{env}:{})});assert.equal(value.workers_dev,false);assert.deepEqual(value.triggers.crons,['* * * * *']);assert.equal(Number(value.vars.WEBHOOK_BATCH_LIMIT),25);assert.equal(value.routes?.length??0,0);names.push(value.name);}
assert.equal(new Set(names).size,3);process.stdout.write('Passed isolated webhook delivery Worker configuration: cron only, no public route, separate dev/staging/production names.\n');
