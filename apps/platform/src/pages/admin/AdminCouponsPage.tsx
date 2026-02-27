import React, { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { supabase } from '../../lib/supabase';
import {
  adminBillingPlansList,
  adminCouponCreate,
  adminCouponUpdate,
  adminCouponsList,
  type AdminCoupon,
  type BillingPlan,
} from '../../lib/platformClient';

type ProductRow = { id: string; name: string; status: string };

export const AdminCouponsPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productId, setProductId] = useState<string>('');
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newCoupon, setNewCoupon] = useState({
    code: '',
    description: '',
    discount_type: 'percent' as 'percent' | 'fixed',
    value: 10,
    currency: 'UZS',
    plan_id: '',
    is_active: true,
    status: 'active',
    max_redemptions: '',
    max_per_user: '',
    min_amount: '',
    first_purchase_only: false,
    stacking_policy: 'none',
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!accessToken) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error: prodErr } = await supabase
          .from('products')
          .select('id,name,status')
          .eq('status', 'active')
          .order('name', { ascending: true });
        if (prodErr) throw prodErr;
        const list = (data ?? []) as ProductRow[];
        setProducts(list);
        if (!productId && list.length > 0) setProductId(list[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load products');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [accessToken, productId]);

  const loadCoupons = async (pid: string) => {
    if (!accessToken || !pid) return;
    setLoading(true);
    setError(null);
    try {
      const [plansRes, couponsRes] = await Promise.all([
        adminBillingPlansList(accessToken, pid),
        adminCouponsList(accessToken, pid),
      ]);
      setPlans(plansRes.plans ?? []);
      setCoupons(couponsRes.coupons ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load coupons');
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  };
  const toOptionalNumber = (value: string | number): number | null => {
    if (value === '' || value === null || value === undefined) return null;
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : null;
  };

  useEffect(() => {
    if (productId) void loadCoupons(productId);
  }, [productId]);

  const createCoupon = async () => {
    if (!accessToken || !productId) return;
    setSaving(true);
    setError(null);
    try {
      const maxRedemptions = toOptionalNumber(newCoupon.max_redemptions);
      const maxPerUser = toOptionalNumber(newCoupon.max_per_user);
      const minAmount = toOptionalNumber(newCoupon.min_amount);
      const res = await adminCouponCreate(accessToken, {
        product_id: productId,
        plan_id: newCoupon.plan_id || null,
        code: newCoupon.code.trim().toUpperCase(),
        description: newCoupon.description.trim() || null,
        discount_type: newCoupon.discount_type,
        value: Number(newCoupon.value),
        currency: newCoupon.currency,
        is_active: newCoupon.is_active,
        status: newCoupon.status,
        max_redemptions: maxRedemptions,
        max_per_user: maxPerUser,
        min_amount: minAmount,
        first_purchase_only: newCoupon.first_purchase_only,
        stacking_policy: newCoupon.stacking_policy,
        starts_at: null,
        ends_at: null,
        effects: [],
        constraints: {},
        metadata: {},
      });
      if (res.coupon) setCoupons((prev) => [res.coupon as AdminCoupon, ...prev]);
      setNewCoupon({
        code: '',
        description: '',
        discount_type: 'percent',
        value: 10,
        currency: 'UZS',
        plan_id: '',
        is_active: true,
        status: 'active',
        max_redemptions: '',
        max_per_user: '',
        min_amount: '',
        first_purchase_only: false,
        stacking_policy: 'none',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create coupon');
    } finally {
      setSaving(false);
    }
  };

  const updateCoupon = async (couponId: string, patch: Partial<AdminCoupon>) => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const res = await adminCouponUpdate(accessToken, couponId, patch as any);
      if (res.coupon) setCoupons((prev) => prev.map((c) => (c.id === couponId ? { ...c, ...res.coupon } : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update coupon');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coupons</h1>
          <p className="text-sm text-gray-600">Create and manage discount codes.</p>
        </div>

        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <label className="text-xs font-semibold text-gray-600">Product</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="text-sm font-semibold text-gray-900">Create coupon</div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={newCoupon.code}
              onChange={(e) => setNewCoupon((prev) => ({ ...prev, code: e.target.value }))}
              placeholder="CODE10"
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
            />
            <input
              value={newCoupon.description}
              onChange={(e) => setNewCoupon((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Description (optional)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
            />
            <select
              value={newCoupon.discount_type}
              onChange={(e) => setNewCoupon((prev) => ({ ...prev, discount_type: e.target.value as any }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed</option>
            </select>
            <input
              type="number"
              value={newCoupon.value}
              onChange={(e) => setNewCoupon((prev) => ({ ...prev, value: Number(e.target.value) }))}
              placeholder="Value"
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
            />
            <select
              value={newCoupon.currency}
              onChange={(e) => setNewCoupon((prev) => ({ ...prev, currency: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
            >
              <option value="UZS">UZS</option>
              <option value="USD">USD</option>
            </select>
            <select
              value={newCoupon.plan_id}
              onChange={(e) => setNewCoupon((prev) => ({ ...prev, plan_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
            >
              <option value="">All plans</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={newCoupon.max_redemptions}
              onChange={(e) => setNewCoupon((prev) => ({ ...prev, max_redemptions: e.target.value }))}
              placeholder="Max redemptions (global)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
            />
            <input
              type="number"
              value={newCoupon.max_per_user}
              onChange={(e) => setNewCoupon((prev) => ({ ...prev, max_per_user: e.target.value }))}
              placeholder="Max per user"
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
            />
            <input
              type="number"
              value={newCoupon.min_amount}
              onChange={(e) => setNewCoupon((prev) => ({ ...prev, min_amount: e.target.value }))}
              placeholder="Minimum amount"
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
            />
            <select
              value={newCoupon.status}
              onChange={(e) => setNewCoupon((prev) => ({ ...prev, status: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="expired">Expired</option>
            </select>
            <select
              value={newCoupon.stacking_policy}
              onChange={(e) => setNewCoupon((prev) => ({ ...prev, stacking_policy: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
            >
              <option value="none">No stacking</option>
              <option value="allow_with_same_type">Stack same type</option>
              <option value="allow">Allow stacking</option>
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={newCoupon.first_purchase_only}
                onChange={(e) => setNewCoupon((prev) => ({ ...prev, first_purchase_only: e.target.checked }))}
              />
              First purchase only
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={newCoupon.is_active}
                onChange={(e) => setNewCoupon((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              Active
            </label>
          </div>
          <button
            onClick={createCoupon}
            disabled={saving || !productId}
            className="mt-4 px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold"
          >
            Create coupon
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">Coupons</div>
          {loading ? <div className="p-4 text-sm text-gray-500">Loading…</div> : null}
          {!loading && coupons.length === 0 ? <div className="p-4 text-sm text-gray-500">No coupons yet.</div> : null}
          {coupons.map((c) => (
            <div key={c.id} className="p-4 grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-3 items-center border-t border-gray-100">
              <input
                defaultValue={c.code}
                onBlur={(e) => updateCoupon(c.id, { code: e.target.value.toUpperCase() })}
                className="border border-gray-200 rounded-xl px-3 py-2"
              />
              <input
                defaultValue={c.discount_type}
                onBlur={(e) => updateCoupon(c.id, { discount_type: e.target.value as any })}
                className="border border-gray-200 rounded-xl px-3 py-2"
              />
              <input
                type="number"
                defaultValue={c.value}
                onBlur={(e) => updateCoupon(c.id, { value: Number(e.target.value) })}
                className="border border-gray-200 rounded-xl px-3 py-2"
              />
              <input
                defaultValue={c.currency}
                onBlur={(e) => updateCoupon(c.id, { currency: e.target.value })}
                className="border border-gray-200 rounded-xl px-3 py-2"
              />
              <select
                defaultValue={c.plan_id ?? ''}
                onChange={(e) => updateCoupon(c.id, { plan_id: e.target.value || null })}
                className="border border-gray-200 rounded-xl px-3 py-2"
              >
                <option value="">All plans</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                defaultValue={c.max_redemptions ?? ''}
                onBlur={(e) => updateCoupon(c.id, { max_redemptions: toOptionalNumber(e.target.value) })}
                placeholder="Max global"
                className="border border-gray-200 rounded-xl px-3 py-2"
              />
              <input
                type="number"
                defaultValue={c.max_per_user ?? ''}
                onBlur={(e) => updateCoupon(c.id, { max_per_user: toOptionalNumber(e.target.value) })}
                placeholder="Max per user"
                className="border border-gray-200 rounded-xl px-3 py-2"
              />
              <input
                type="number"
                defaultValue={c.min_amount ?? ''}
                onBlur={(e) => updateCoupon(c.id, { min_amount: toOptionalNumber(e.target.value) })}
                placeholder="Min amount"
                className="border border-gray-200 rounded-xl px-3 py-2"
              />
              <select
                defaultValue={c.status ?? 'active'}
                onChange={(e) => updateCoupon(c.id, { status: e.target.value })}
                className="border border-gray-200 rounded-xl px-3 py-2"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="expired">Expired</option>
              </select>
              <select
                defaultValue={c.stacking_policy ?? 'none'}
                onChange={(e) => updateCoupon(c.id, { stacking_policy: e.target.value })}
                className="border border-gray-200 rounded-xl px-3 py-2"
              >
                <option value="none">No stacking</option>
                <option value="allow_with_same_type">Stack same type</option>
                <option value="allow">Allow stacking</option>
              </select>
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  defaultChecked={Boolean(c.first_purchase_only)}
                  onChange={(e) => updateCoupon(c.id, { first_purchase_only: e.target.checked })}
                />
                First purchase
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  defaultChecked={c.is_active}
                  onChange={(e) => updateCoupon(c.id, { is_active: e.target.checked })}
                />
                Active
              </label>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};






