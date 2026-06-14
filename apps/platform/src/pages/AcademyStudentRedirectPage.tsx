import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

const fallbackAcademyUrl = 'https://academy.schood.online';
const academyAppUrl = (String(import.meta.env.VITE_ACADEMY_URL ?? '').trim() || fallbackAcademyUrl).replace(/\/+$/, '');

const studentPathForLegacyRoute = (pathname: string, search: string): { path: string; params: URLSearchParams } => {
  const normalized = pathname.replace(/\/+$/, '') || '/academy/student';
  const params = new URLSearchParams(search);

  if (normalized === '/my-academy') {
    const classroomId = params.get('classroom_id')?.trim();
    params.delete('classroom_id');
    const tab = params.get('tab')?.trim();
    if (classroomId) return { path: `/academy/student/classrooms/${encodeURIComponent(classroomId)}`, params };
    if (tab === 'billing') {
      params.delete('tab');
      return { path: '/academy/student/access', params };
    }
    if (tab === 'chat') {
      params.delete('tab');
      return { path: '/academy/student/messages', params };
    }
    return { path: '/academy/student', params };
  }

  if (normalized.startsWith('/academy/student')) {
    return { path: normalized, params };
  }

  return { path: '/academy/student', params };
};

const academyStudentUrl = (pathname: string, search: string): string => {
  const { path, params } = studentPathForLegacyRoute(pathname, search);
  const target = new URL(path, academyAppUrl);
  params.forEach((value, key) => target.searchParams.set(key, value));
  return target.toString();
};

export const AcademyStudentRedirectPage = () => {
  const location = useLocation();
  const targetUrl = useMemo(
    () => academyStudentUrl(location.pathname, location.search),
    [location.pathname, location.search],
  );

  useEffect(() => {
    window.location.replace(targetUrl);
  }, [targetUrl]);

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-16">
      <section className="mx-auto max-w-xl rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase text-emerald-700">Academy LMS</p>
        <h1 className="mt-3 text-2xl font-bold text-gray-950">Opening Academy Workspace</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Student classrooms, assignments, attendance, payments, and chat now live in the role-based Academy LMS.
        </p>
        <a
          href={targetUrl}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Continue to Academy Workspace
        </a>
      </section>
    </main>
  );
};
