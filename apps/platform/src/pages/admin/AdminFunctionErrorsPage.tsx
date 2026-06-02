import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import { adminFunctionErrors, type FunctionErrorLogRow } from '../../lib/platformClient';

// Admin-only surface for recent edge function errors. Reads from
// public.app_function_error_log via supabase/functions/admin-function-errors.
// Built because we were debugging prod 500s blind — Supabase's built-in
// function logs are only available via the management API which needs a PAT.

const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

const ErrorRow: React.FC<{ row: FunctionErrorLogRow }> = ({ row }) => {
  const [open, setOpen] = useState(false);
  return (
    <article className="bg-white border border-gray-200 rounded-xl p-4 hover:border-red-300 transition-colors">
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            {row.function_name}
          </span>
          {row.route ? (
            <code className="text-xs text-gray-600">{row.route}</code>
          ) : null}
          {row.http_status ? (
            <span className="text-xs text-gray-500">HTTP {row.http_status}</span>
          ) : null}
          <span className="ml-auto text-xs text-gray-500">{formatTime(row.occurred_at)}</span>
        </div>
        <p className="mt-2 text-sm text-gray-900 font-medium">
          {truncate(row.error_message, 200)}
        </p>
        {row.user_id ? (
          <p className="mt-1 text-xs text-gray-500">
            user: <code>{row.user_id.slice(0, 8)}…</code>
          </p>
        ) : null}
      </button>
      {open ? (
        <div className="mt-3 space-y-3 text-xs">
          {row.error_message ? (
            <div>
              <div className="font-semibold text-gray-700 mb-1">Full message</div>
              <pre className="whitespace-pre-wrap break-words bg-gray-50 border border-gray-200 rounded p-2 text-gray-900">
                {row.error_message}
              </pre>
            </div>
          ) : null}
          {row.error_stack ? (
            <div>
              <div className="font-semibold text-gray-700 mb-1">Stack</div>
              <pre className="whitespace-pre-wrap break-words bg-gray-50 border border-gray-200 rounded p-2 text-gray-700 max-h-64 overflow-auto">
                {row.error_stack}
              </pre>
            </div>
          ) : null}
          {row.request_summary && Object.keys(row.request_summary).length > 0 ? (
            <div>
              <div className="font-semibold text-gray-700 mb-1">Request</div>
              <pre className="whitespace-pre-wrap break-words bg-gray-50 border border-gray-200 rounded p-2 text-gray-700">
                {JSON.stringify(row.request_summary, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
};

const AdminFunctionErrorsPage: React.FC = () => {
  const [rows, setRows] = useState<FunctionErrorLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await adminFunctionErrors(token, { limit: 100, function_name: filter || undefined });
      setRows(res.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load errors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <AdminLayout>
      <section className="space-y-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Operations</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Function errors</h1>
          <p className="text-sm text-gray-600 mt-1">
            Recent failures across edge functions. Each function calls <code>logFunctionError</code> on a caught
            exception; the row appears here within seconds.
          </p>
        </header>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Filter by function_name (e.g. ielts-practice)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <span className="ml-auto text-xs text-gray-500">
            {rows.length} {rows.length === 1 ? 'row' : 'rows'}
          </span>
        </div>

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800 flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        ) : null}

        {rows.length === 0 && !loading && !error ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-6 text-center text-sm text-gray-600">
            No function errors recorded for the selected filter.
            <div className="mt-1 text-xs text-gray-500">
              Functions need to call <code>logFunctionError</code> from <code>_shared/error-log.ts</code> for entries to appear here.
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {rows.map((row) => (
            <ErrorRow key={row.id} row={row} />
          ))}
        </div>
      </section>
    </AdminLayout>
  );
};

export default AdminFunctionErrorsPage;
