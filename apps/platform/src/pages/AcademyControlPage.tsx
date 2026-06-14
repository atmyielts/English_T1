import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

const fallbackAcademyUrl = 'https://academy.schood.online';
const academyAppUrl = (String(import.meta.env.VITE_ACADEMY_URL ?? '').trim() || fallbackAcademyUrl).replace(/\/+$/, '');

const officePathForLegacyRoute = (pathname: string, search: string): string => {
  const normalized = pathname.replace(/\/+$/, '') || '/academy';
  const roleBase = normalized === '/academy/office' || normalized.startsWith('/academy/office/')
    ? '/academy/office'
    : normalized === '/academy/admin' || normalized.startsWith('/academy/admin/')
      ? '/academy/admin'
      : normalized === '/academy/teacher' || normalized.startsWith('/academy/teacher/')
        ? '/academy/teacher'
        : normalized === '/academy/center' || normalized.startsWith('/academy/center/')
          ? '/academy/center'
          : null;

  if (roleBase && normalized !== roleBase) return normalized;
  if (roleBase) return roleBase;
  if (normalized.startsWith('/academy/classrooms/')) return normalized;
  if (normalized === '/academy/classrooms') return '/academy/teacher/classrooms';
  if (normalized === '/academy-control') return '/academy/admin';

  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'classrooms') return '/academy/teacher/classrooms';
  if (tab === 'students') return '/academy/admin/contacts';
  if (tab === 'announcements') return '/academy/teacher/announcements';
  if (tab === 'director') return '/academy/admin/os';
  return '/academy/office';
};

const academyOfficeUrl = (pathname: string, search: string): string => {
  const params = new URLSearchParams(search);
  params.delete('tab');

  const target = new URL(officePathForLegacyRoute(pathname, search), academyAppUrl);
  params.forEach((value, key) => target.searchParams.set(key, value));
  return target.toString();
};

export const AcademyControlPage = () => {
  const location = useLocation();
  const targetUrl = useMemo(
    () => academyOfficeUrl(location.pathname, location.search),
    [location.pathname, location.search],
  );

  useEffect(() => {
    window.location.replace(targetUrl);
  }, [targetUrl]);

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-16">
      <section className="mx-auto max-w-xl rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase text-emerald-700">Academy LMS</p>
        <h1 className="mt-3 text-2xl font-bold text-gray-950">Opening Academy Office</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Academy control now lives in the role-based Academy LMS. This keeps center owners, administrators, counselors,
          teachers, and assistants on one production surface.
        </p>
        <a
          href={targetUrl}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Continue to Academy Office
        </a>
      </section>
    </main>
  );
};
