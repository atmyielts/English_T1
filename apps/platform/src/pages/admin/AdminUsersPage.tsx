import React, { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  adminUsersGrantProduct,
  adminUsersList,
  adminUsersRevokeProduct,
  adminUsersSearch,
  adminUsersSetRole,
  type AdminEntitlementProductRow,
  type AdminEntitlementRow,
  type AdminMembershipRow,
  type AdminTenantRow,
  type AdminUserRow,
} from '../../lib/platformClient';

type ProductRow = { id: string; name: string; status: string; metadata?: Record<string, unknown> | null };

const formatDate = (value: string | null | undefined): string => {
  if (!value) return 'N/A';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString();
};

export const AdminUsersPage: React.FC = () => {
  const roleOptions = ['user', 'admin', 'admin_readonly', 'admin_ops', 'admin_commerce', 'admin_content'] as const;
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [listQuery, setListQuery] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [user, setUser] = useState<AdminUserRow | null>(null);
  const [memberships, setMemberships] = useState<AdminMembershipRow[]>([]);
  const [tenants, setTenants] = useState<AdminTenantRow[]>([]);
  const [entitlements, setEntitlements] = useState<AdminEntitlementRow[]>([]);
  const [entitlementProducts, setEntitlementProducts] = useState<AdminEntitlementProductRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [grantProductId, setGrantProductId] = useState('');
  const [grantDays, setGrantDays] = useState<number>(30);
  const [roleDraft, setRoleDraft] = useState<string>('user');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadProducts = async () => {
      if (!accessToken) return;
      const { data } = await supabase.from('products').select('id,name,status,metadata').order('name', { ascending: true });
      setProducts((data ?? []) as ProductRow[]);
    };
    void loadProducts();
  }, [accessToken]);

  const loadUsers = async (query?: string) => {
    if (!accessToken) return;
    const res = await adminUsersList(accessToken, { query, limit: 100 });
    setUsers(res.users ?? []);
  };

  useEffect(() => {
    if (!accessToken) return;
    void loadUsers();
  }, [accessToken]);

  const runSearch = async (targetEmail?: string) => {
    const emailToUse = (targetEmail ?? email).trim();
    if (!accessToken || !emailToUse) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminUsersSearch(accessToken, emailToUse);
      setUser(res.user ?? null);
      setMemberships(res.memberships ?? []);
      setTenants(res.tenants ?? []);
      setEntitlements(res.entitlements ?? []);
      setEntitlementProducts(res.products ?? []);
      setEmail(emailToUse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to search');
    } finally {
      setLoading(false);
    }
  };

  const setRole = async (role: string) => {
    if (!accessToken || !user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminUsersSetRole(accessToken, { user_id: user.id, role });
      if (res.user) setUser(res.user);
      await loadUsers(listQuery.trim() || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set role');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setRoleDraft(String(user?.role ?? 'user').toLowerCase());
  }, [user?.id, user?.role]);

  const grantProduct = async () => {
    if (!accessToken || !user || !grantProductId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminUsersGrantProduct(accessToken, {
        product_id: grantProductId,
        user_id: user.id,
        days: grantDays,
      });
      if (res.entitlement) setEntitlements((prev) => [res.entitlement as AdminEntitlementRow, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to grant');
    } finally {
      setLoading(false);
    }
  };

  const revokeProduct = async (productId: string, tenantId: string) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminUsersRevokeProduct(accessToken, { product_id: productId, tenant_id: tenantId });
      if (res.entitlement) setEntitlements((prev) => prev.filter((entry) => entry.id !== res.entitlement?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke');
    } finally {
      setLoading(false);
    }
  };

  const productInfoById = useMemo(() => {
    const map = new Map<string, { name: string; slug?: string; status?: string }>();
    products.forEach((p) => {
      const metadata = (p.metadata ?? {}) as Record<string, unknown>;
      const slug = typeof metadata.slug === 'string' ? metadata.slug : undefined;
      map.set(p.id, { name: p.name, slug, status: p.status });
    });
    entitlementProducts.forEach((p) => {
      const metadata = (p.metadata ?? {}) as Record<string, unknown>;
      const slug = typeof metadata.slug === 'string' ? metadata.slug : undefined;
      map.set(p.id, { name: p.name, slug, status: p.status });
    });
    return map;
  }, [products, entitlementProducts]);

  const tenantById = useMemo(() => {
    const map = new Map<string, AdminTenantRow>();
    tenants.forEach((tenant) => map.set(tenant.id, tenant));
    return map;
  }, [tenants]);

  const sortedEntitlements = useMemo(
    () => [...entitlements].sort((a, b) => Number(new Date(b.created_at)) - Number(new Date(a.created_at))),
    [entitlements],
  );

  const grantableProducts = useMemo(() => products.filter((p) => String(p.status).toLowerCase() === 'active'), [products]);

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-600">Browse users, then open details to manage role, memberships, and entitlements.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2"
          />
          <button onClick={() => void runSearch()} className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold">
            Search details
          </button>
        </div>

        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden order-2 xl:order-1">
            <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <span>Users list</span>
              <div className="flex gap-2">
                <input
                  value={listQuery}
                  onChange={(e) => setListQuery(e.target.value)}
                  placeholder="Filter by email or role"
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
                <button
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    try {
                      await loadUsers(listQuery.trim() || undefined);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed to load users');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
                >
                  Apply
                </button>
              </div>
            </div>

            {users.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No users found.</div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[640px] overflow-auto">
                {users.map((u) => {
                  const selected = user?.id === u.id;
                  return (
                    <div key={u.id} className={`px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 ${selected ? 'bg-indigo-50/40' : ''}`}>
                      <div className="text-sm">
                        <div className="font-semibold text-gray-900">{u.email ?? u.id}</div>
                        <div className="text-xs text-gray-500">
                          Role: {u.role ?? 'user'} - Joined: {new Date(u.created_at).toLocaleString()}
                        </div>
                      </div>
                      {u.email ? (
                        <button
                          onClick={() => {
                            setEmail(u.email ?? '');
                            void runSearch(u.email ?? '');
                          }}
                          className={`px-3 py-2 rounded-xl border text-sm ${selected ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200'}`}
                        >
                          {selected ? 'Opened' : 'Open details'}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {user ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4 order-1 xl:order-2 xl:sticky xl:top-6">
              <div className="text-sm font-semibold">User details</div>
              <div className="text-sm text-gray-700">{user.email ?? user.id}</div>
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2">
                <select value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button onClick={() => void setRole(roleDraft)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm">
                  Set role
                </button>
              </div>

              <div className="text-sm font-semibold">Grant product</div>
              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-1 gap-3">
                <select value={grantProductId} onChange={(e) => setGrantProductId(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2">
                  <option value="">Select product</option>
                  {grantableProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={grantDays}
                  onChange={(e) => setGrantDays(Number(e.target.value))}
                  className="border border-gray-200 rounded-xl px-3 py-2"
                  placeholder="Days"
                />
                <button onClick={() => void grantProduct()} className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold">
                  Grant
                </button>
              </div>

              <div className="text-sm font-semibold">Entitlements</div>
              {sortedEntitlements.length === 0 ? (
                <div className="text-sm text-gray-500">No entitlements.</div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                  {sortedEntitlements.map((entry) => {
                    const isProduct = entry.resource_type === 'product';
                    const productInfo = isProduct && entry.resource_id ? productInfoById.get(entry.resource_id) : null;
                    const tenant = tenantById.get(entry.tenant_id);
                    return (
                      <div key={entry.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                        <div className="text-sm font-semibold text-gray-900">
                          {isProduct ? productInfo?.name ?? 'Unknown product' : entry.resource_type}
                          {entry.is_active ? (
                            <span className="ml-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">active</span>
                          ) : (
                            <span className="ml-2 text-xs text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">inactive</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600">Resource: {entry.resource_type}:{entry.resource_id ?? 'N/A'}</div>
                        {isProduct && productInfo ? (
                          <div className="text-xs text-gray-600">
                            Product label: {productInfo.name}
                            {productInfo.slug ? <span className="text-gray-500"> ({productInfo.slug})</span> : null}
                            {productInfo.status ? <span className="text-gray-500"> - {productInfo.status}</span> : null}
                          </div>
                        ) : null}
                        <div className="text-xs text-gray-600">Tenant: {tenant ? `${tenant.name} (${tenant.slug})` : entry.tenant_id}</div>
                        <div className="text-xs text-gray-600">
                          Starts: {formatDate(entry.starts_at)} - Ends: {formatDate(entry.ends_at)}
                        </div>
                        {isProduct && entry.resource_id ? (
                          <button onClick={() => void revokeProduct(entry.resource_id as string, entry.tenant_id)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm">
                            Revoke
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="text-sm font-semibold">Memberships</div>
              {memberships.length === 0 ? (
                <div className="text-sm text-gray-500">No memberships.</div>
              ) : (
                <div className="space-y-2">
                  {memberships.map((m) => {
                    const tenant = tenantById.get(m.tenant_id);
                    return (
                      <div key={`${m.tenant_id}:${m.role}:${m.created_at}`} className="border border-gray-200 rounded-xl p-2.5 text-sm">
                        <div className="font-medium text-gray-900">{tenant ? tenant.name : m.tenant_id}</div>
                        <div className="text-xs text-gray-600">Role: {m.role} - Status: {m.status}</div>
                        {tenant ? <div className="text-xs text-gray-500">Slug: {tenant.slug}</div> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-500 order-1 xl:order-2 xl:sticky xl:top-6">
              Open a user to see memberships and entitlements.
            </div>
          )}
        </div>

        {loading ? <div className="text-sm text-gray-500">Loading...</div> : null}
      </div>
    </AdminLayout>
  );
};
