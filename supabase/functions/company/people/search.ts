// One search over a workspace (Ctrl+K). HR finds everyone, a manager only their departments,
// an employee only learning content. Results carry names and titles, never levels or learning
// detail, so a person who has not agreed to share shows nothing they have not shared.
import { check, type Route } from '../types.ts';
import { IDS_PER_REQUEST } from '../util.ts';
import { TRACKS } from '../training/tracks/index.ts';
import { isHr } from './shared.ts';
import { managedDepartments } from './bulk.ts';

const LIMIT = 8;
const SHORTEST = 2;
const UNSAFE = /\u0000|[\uD800-\uDFFF]/;

/** Literal text for an ilike pattern: % and _ in what was typed are just those characters. */
export const likePattern = (value: string): string => `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

const LOCALES = ['en', 'ru', 'uz'] as const;
type Locale = (typeof LOCALES)[number];

export const searchRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/search', access: 'org', allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const org = ctx.org!, q = (query.get('q') ?? '').trim().slice(0, 80);
      const asked = query.get('locale');
      const locale: Locale = (LOCALES as readonly string[]).includes(asked ?? '') ? asked as Locale : 'ru';
      const empty = { q, people: [], departments: [], tests: [], courses: [] };
      if (q.length < SHORTEST || UNSAFE.test(q)) return empty;
      const hr = isHr(ctx), lead = hr || ctx.member?.role === 'manager';
      const pattern = likePattern(q), needle = q.toLowerCase();

      let people: { id: string; name: string | null; email: string | null; role: string; status: string; department_id: string | null }[] = [];
      let departments: { id: string; name: string }[] = [];
      let tests: { id: string; title: string; kind: string; status: string }[] = [];
      if (lead) {
        const scope = hr ? null : await managedDepartments(ctx);
        const allDepartments = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id).order('name'));
        const visible = scope ? allDepartments.filter((row) => scope.has(row.id)) : allDepartments;
        departments = visible.filter((row) => row.name.toLowerCase().includes(needle)).slice(0, LIMIT);
        const read = (column: 'full_name' | 'email') => {
          let builder = ctx.db.from('company_members').select('id,full_name,email,role,status,department_id').eq('org_id', org.id).neq('status', 'removed').ilike(column, pattern);
          // The filter is in the query, so a manager's page of results is not eaten by people they cannot see.
          if (scope) builder = builder.in('department_id', [...scope].slice(0, IDS_PER_REQUEST));
          return builder.order('full_name').limit(LIMIT);
        };
        if (!scope || scope.size) {
          const [byName, byEmail] = await Promise.all([read('full_name'), read('email')]);
          const seen = new Set<string>();
          for (const row of [...check<{ id: string; full_name: string | null; email: string | null; role: string; status: string; department_id: string | null }[]>(byName), ...check<{ id: string; full_name: string | null; email: string | null; role: string; status: string; department_id: string | null }[]>(byEmail)]) {
            if (seen.has(row.id) || seen.size >= LIMIT) continue;
            seen.add(row.id);
            people.push({ id: row.id, name: row.full_name, email: row.email, role: row.role, status: row.status, department_id: row.department_id });
          }
        }
        // Hiring tests are HR's; managers open placement and progress checks.
        let testQuery = ctx.db.from('company_assessments').select('id,title,kind,status').eq('org_id', org.id).ilike('title', pattern);
        if (!hr) testQuery = testQuery.in('kind', ['placement', 'progress']);
        tests = check<typeof tests>(await testQuery.order('created_at', { ascending: false }).limit(LIMIT));
      }

      // Job-role tracks and their lessons, in the language of the page.
      const courses: { track: string; lesson: string | null; title: string; level: string | null }[] = [];
      for (const track of TRACKS) {
        if (courses.length >= LIMIT) break;
        if (track.title[locale].toLowerCase().includes(needle)) courses.push({ track: track.code, lesson: null, title: track.title[locale], level: null });
      }
      for (const track of TRACKS) {
        for (const lesson of track.lessons) {
          if (courses.length >= LIMIT) break;
          if (lesson.title[locale].toLowerCase().includes(needle)) courses.push({ track: track.code, lesson: lesson.code, title: lesson.title[locale], level: lesson.level });
        }
      }
      return { q, people, departments, tests, courses };
    },
  },
];
