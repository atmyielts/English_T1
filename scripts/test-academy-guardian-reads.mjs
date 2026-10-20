import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const files=['scripts/fixtures/academy-guardian-schema.sql','supabase/migrations/20261020120000_academy_guardian_portal_reads.sql','supabase/migrations/20261020121000_academy_guardian_binding_identity.sql','supabase/migrations/20261020150000_academy_parent_write_commands.sql','supabase/migrations/20261020151000_academy_parent_history_paging.sql','supabase/migrations/20261020152000_academy_parent_delivery_claims.sql','scripts/fixtures/academy-guardian-portal.sql'];
const sources=files.map(file=>({file,source:readFileSync(file,'utf8')}));
const db=new PGlite({extensions:{btree_gist,pgcrypto}});
try{
 await db.exec('create extension if not exists btree_gist;create schema extensions;create extension if not exists pgcrypto with schema extensions;');
 for(const source of sources.slice(0,-1))await db.exec(source.source);
 const results=await db.exec(sources.at(-1).source);
 const marker=results.flatMap(result=>result.rows??[]).flatMap(row=>Object.values(row)).find(value=>typeof value==='string'&&value.startsWith('guardian-captured-schema-ok:'));
 assert.ok(marker,'Owned fixture must finish every assertion');
 const checks=Number(marker.split(':')[1]);assert.ok(checks>=36);
 assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,0,'Fixture rollback must remove owned accounts');
 console.log(JSON.stringify({suite:'parent-portal-current-consent-and-child-projection',checks,productionTouched:false,sources:sources.map(({file,source})=>({file,sha256LF:createHash('sha256').update(source.replaceAll('\r\n','\n')).digest('hex')}))}));
}catch(error){console.error(JSON.stringify({suite:'parent-portal-current-consent-and-child-projection',message:error.message,code:error.code}));process.exitCode=1;}
finally{await db.close();}
