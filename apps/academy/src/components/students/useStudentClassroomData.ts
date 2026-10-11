import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  teacherStudioClassroomChat, teacherStudioStudentAssignments,
  teacherStudioStudentAttendance, teacherStudioStudentBilling,
  type TeacherStudioClassroom,
} from '../../lib/client';

export type StudentClassroomSection = 'overview' | 'course' | 'curriculum' | 'resources' | 'live' | 'assignments' | 'progress' | 'grades' | 'attendance' | 'people' | 'chat' | 'account' | 'billing';
type Data = {
  room: Awaited<ReturnType<typeof teacherStudioClassroomChat>>;
  assignments: Awaited<ReturnType<typeof teacherStudioStudentAssignments>>;
  attendance: Awaited<ReturnType<typeof teacherStudioStudentAttendance>>;
  billing: Awaited<ReturnType<typeof teacherStudioStudentBilling>>;
};
type Key = keyof Data;
const required: Record<StudentClassroomSection, Key[]> = {
  overview: ['room', 'assignments', 'attendance', 'billing'],
  course: ['room'], curriculum: [], resources: ['room'], live: [],
  assignments: ['assignments'], progress: ['assignments', 'attendance'],
  grades: ['assignments'], attendance: ['attendance'],
  people: ['room'], chat: ['room'], account: ['billing'], billing: ['billing'],
};

export const useStudentClassroomData = (classroom: TeacherStudioClassroom | null, section: StudentClassroomSection | null) => {
  // This hook lives inside the actor/Academy/classroom-keyed learner boundary.
  const cache = useRef(new Map<Key, Promise<Data[Key]>>());
  const epoch = useRef(0);
  const request = useRef(0);
  const [data, setData] = useState<Partial<Data>>({});
  const [loaded, setLoaded] = useState<Key[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useLayoutEffect(() => {
    // Parent Refresh replaces its classroom snapshot, invalidating cached reads.
    cache.current.clear();
    setData({});
    setLoaded([]);
  }, [classroom]);

  useLayoutEffect(() => {
    epoch.current += 1;
    setError('');
    setLoading(false);
    return () => { epoch.current += 1; };
  }, [classroom, section]);

  const invalidate = useCallback((keys: Key[]) => {
    for (const key of keys) cache.current.delete(key);
    setLoaded(previous => previous.filter(key => !keys.includes(key)));
    setRevision(previous => previous + 1);
  }, []);

  const load = useCallback(async (force = false) => {
    if (!classroom || !section) return;
    const keys = required[section];
    const visit = epoch.current;
    const read = ++request.current;
    const isCurrent = () => visit === epoch.current && read === request.current;
    const readData = <K extends Key>(key: K, loader: () => Promise<Data[K]>) => {
      const existing = cache.current.get(key) as Promise<Data[K]> | undefined;
      if (existing && !force) return existing;
      const pending = loader().catch(reason => {
        if (cache.current.get(key) === pending) cache.current.delete(key);
        throw reason;
      });
      cache.current.set(key, pending);
      return pending;
    };
    setError('');
    setLoading(keys.length > 0);
    try {
      const [room, assignments, attendance, billing] = await Promise.all([
        keys.includes('room') ? readData('room', () => teacherStudioClassroomChat(classroom.academy_id, classroom.id)) : null,
        keys.includes('assignments') ? readData('assignments', () => teacherStudioStudentAssignments(classroom.academy_id, classroom.id)) : null,
        keys.includes('attendance') ? readData('attendance', () => teacherStudioStudentAttendance(classroom.academy_id, classroom.id)) : null,
        keys.includes('billing') ? readData('billing', () => teacherStudioStudentBilling(classroom.academy_id)) : null,
      ]);
      if (!isCurrent()) return;
      setData(previous => ({ ...previous, ...(room ? { room } : {}), ...(assignments ? { assignments } : {}), ...(attendance ? { attendance } : {}), ...(billing ? { billing } : {}) }));
      setLoaded(previous => [...new Set([...previous, ...keys])]);
    } catch (reason) {
      if (isCurrent()) setError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [classroom, section]);

  useEffect(() => { void load().catch(() => { /* The current view presents the error and Retry. */ }); }, [load, revision]);
  const refresh = useCallback(() => load(true), [load]);
  return {
    room: data.room ?? null,
    assignments: data.assignments?.assignments ?? [],
    attendance: data.attendance?.attendance ?? [],
    billingItems: (data.billing?.items ?? []).filter(item => item.classroom_id === classroom?.id),
    billingAccounts: data.billing?.accounts ?? [],
    ready: Boolean(classroom && section && required[section].every(key => loaded.includes(key))),
    loading, error, refresh, invalidate,
  };
};
