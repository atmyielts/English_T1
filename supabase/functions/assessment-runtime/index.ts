import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import {createRuntimeHandler} from './handler.ts';
import {createRuntimeRepository} from './repository.ts';
const required=(name:string)=>{const value=Deno.env.get(name);if(!value)throw new Error(`Missing ${name}`);return value;};
const auth=createClient(required('SUPABASE_URL'),required('SUPABASE_ANON_KEY'),{auth:{persistSession:false}});
const service=createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
const repository=createRuntimeRepository(auth,service);
Deno.serve(createRuntimeHandler(repository,required('ASSESSMENT_COORDINATOR_SECRET')));
