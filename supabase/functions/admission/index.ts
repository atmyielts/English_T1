import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { createAdmissionHandler } from './handler.ts';
import { createAdmissionRepository, type AdmissionDatabase } from './repository.ts';

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const auth = createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
const service = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
// Off until both the flag and the Schood content workspace are set.
const contentTenant = Deno.env.get('ADMISSION_CONTENT_TENANT_ID') ?? '';
const enabled = Deno.env.get('ADMISSION_ENABLED') === 'true' && /^[0-9a-f-]{36}$/i.test(contentTenant);
const origins = (Deno.env.get('ADMISSION_ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
const repository = createAdmissionRepository(async (token) => {
  const { data, error } = await auth.auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}, service as unknown as AdmissionDatabase, contentTenant);

Deno.serve(createAdmissionHandler(repository, origins, { enabled }));
