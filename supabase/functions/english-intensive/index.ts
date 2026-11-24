import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authUser, corsHeaders, extractRoute, getEnv, json, parseBody, resolveEnglishProducts } from '../_shared/english-learning.ts';
import { requireEnglishSuiteAccess } from '../_shared/english-access.ts';
import { isServicePaused, loadEnglishSettings } from '../_shared/english-settings.ts';
import {
  coreUnitMinutes, emptyProgress, gradeIntensive, intensiveSkills, materialFor, questionsFor, workFields,
  type IntensiveSkill, type Progress, type SaveAction, type Unit,
} from '../_shared/english-intensive.ts';

const progressColumns = 'revision,answers,work,feedback,completed';
const unitColumns = 'slug,level,title,summary,listening_ready';
const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validActions: readonly SaveAction[] = ['save', 'check', 'complete'];
const draftLimit = 6_000;

const result = (status: number, body: Record<string, unknown>) => {
  const response = json(status, body);
  response.headers.set('Cache-Control', 'no-store');
  return response;
};

const conflict = () => result(409, { error: 'This activity was updated in another tab or device.', code: 'draft_conflict' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!['GET', 'POST'].includes(req.method)) return result(405, { error: 'Method not allowed' });

  try {
    const sb = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const user = await authUser(sb, req);
    if (!user) return result(401, { error: 'Unauthorized' });

    const route = extractRoute(new URL(req.url), '/english-intensive');
    if (req.method === 'GET' && route === '/availability') {
      const { data, error } = await sb.from('english_intensive_units').select('slug').limit(1);
      if (error) throw error;
      return result(200, { ready: Boolean(data?.length) });
    }
    const products = await resolveEnglishProducts(sb);
    const [access, settings] = await Promise.all([
      requireEnglishSuiteAccess(sb, user.userId, products),
      loadEnglishSettings(sb),
    ]);
    const hasSkill = (skill: IntensiveSkill) => access.admin || access.entitlementProductIds.includes(String(products[skill]?.productId ?? ''));
    const paused = (skill: IntensiveSkill) => !access.admin && isServicePaused(settings, skill);
    if (req.method === 'GET' && (route === '' || route === '/')) {
      const [library, progress] = await Promise.all([
        sb.from('english_intensive_units').select(unitColumns).order('level').order('position'),
        sb.from('english_intensive_progress').select('unit_slug,skill,completed').eq('user_id', user.userId),
      ]);
      if (library.error) throw library.error;
      if (progress.error) throw progress.error;
      return result(200, {
        units: library.data, progress: progress.data, core_unit_minutes: coreUnitMinutes,
        available_skills: intensiveSkills.filter((skill) => hasSkill(skill) && !paused(skill)),
        paused_skills: intensiveSkills.filter(paused),
      });
    }

    const [slug, skill, extra] = route.substring(1).split('/');
    if (!slug || slug.length > 120 || !validSlug.test(slug) || !skill || extra !== undefined ||
      !intensiveSkills.includes(skill as IntensiveSkill)) return result(404, { error: 'Activity not found' });
    const key = skill as IntensiveSkill;

    if (paused(key)) return result(403, { error: 'This skill is paused.', code: 'service_paused' });
    if (!hasSkill(key)) {
      return result(403, { error: 'This intensive session is available with the skill in your plan.', code: 'intensive_entitlement' });
    }

    const [storedUnit, storedProgress] = await Promise.all([
      sb.from('english_intensive_units').select(`${unitColumns},packet`).eq('slug', slug).maybeSingle(),
      sb.from('english_intensive_progress').select(progressColumns).eq('user_id', user.userId)
        .eq('unit_slug', slug).eq('skill', key).maybeSingle(),
    ]);
    if (storedUnit.error) throw storedUnit.error;
    if (storedProgress.error) throw storedProgress.error;
    if (!storedUnit.data) return result(404, { error: 'Activity not found' });
    if (key === 'listening' && !storedUnit.data.listening_ready) {
      return result(409, { error: 'Recorded audio is coming soon.', code: 'intensive_audio_soon' });
    }
    const { packet, ...overview } = storedUnit.data;
    const unit = packet as Unit;
    const current = (storedProgress.data as Progress | null) ?? emptyProgress;
    if (req.method === 'GET') return result(200, { unit: overview, material: materialFor(unit, key), guide: unit.guide?.[key] ?? null, progress: current });

    const body = await parseBody(req);
    if (typeof body.revision !== 'number' || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
      !validActions.includes(body.action as SaveAction) || !Array.isArray(body.answers) ||
      !body.work || typeof body.work !== 'object' || Array.isArray(body.work)) {
      return result(422, { error: 'Invalid activity draft', code: 'intensive_draft' });
    }
    if (body.revision !== current.revision) return conflict();
    const questions = questionsFor(unit, key);
    const incoming = body.answers;
    if (incoming.length !== questions.length || incoming.some((choice, index) => choice !== null &&
      (!Number.isInteger(choice) || choice < 0 || choice >= questions[index].options.length))) {
      return result(422, { error: 'Invalid answer selections', code: 'intensive_draft' });
    }
    const answers = incoming as Progress['answers'];

    const notes = body.work as Record<string, unknown>;
    const fields: readonly string[] = workFields[key];
    if (Object.keys(notes).some((field) => !fields.includes(field) || typeof notes[field] !== 'string' || notes[field].length > draftLimit)) {
      return result(422, { error: 'Invalid work fields', code: 'intensive_draft' });
    }
    const work = notes as Progress['work'];
    if (body.action !== 'save' && answers.some((choice) => choice === null)) {
      return result(422, { error: 'Choose an answer for every question.', code: 'intensive_answers' });
    }
    if (body.action === 'complete' && fields.some((field) => !work[field]?.trim())) {
      return result(422, { error: 'Add your work in each section first.', code: 'intensive_work' });
    }
    const sameAnswers = answers.every((choice, index) => choice === current.answers[index]);
    const next: Progress = {
      revision: current.revision + 1,
      answers,
      work,
      feedback: body.action !== 'save' ? gradeIntensive(questions, answers) : sameAnswers ? current.feedback : [],
      completed: current.completed || body.action === 'complete',
    };

    if (current.revision === 0) {
      const { error } = await sb.from('english_intensive_progress').insert({ ...next, user_id: user.userId, unit_slug: slug, skill: key });
      if (error?.code === '23505') return conflict();
      if (error) throw error;
    } else {
      const { data, error } = await sb.from('english_intensive_progress').update({ ...next, updated_at: new Date().toISOString() })
        .eq('user_id', user.userId).eq('unit_slug', slug).eq('skill', key).eq('revision', current.revision).select('revision').maybeSingle();
      if (error) throw error;
      if (!data) return conflict();
    }
    return result(200, { progress: next });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'internal';
    console.error('English intensive request failed', code);
    return result(500, { error: 'The intensive practice service is temporarily unavailable.' });
  }
});
