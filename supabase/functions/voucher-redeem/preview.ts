export const productView = (product: any) => ({
  id: product?.id ?? null,
  name: product?.name ?? null,
  slug: product?.metadata?.slug ?? null,
  app_url: product?.metadata?.app_url ?? null,
});

const classroomView = (voucher: any) => {
  const rawClassroom = Array.isArray(voucher?.academy_classrooms)
    ? voucher.academy_classrooms[0]
    : voucher?.academy_classrooms;
  const id = rawClassroom?.id ?? voucher?.classroom_id ?? null;
  if (!id) return null;
  return {
    id,
    name: rawClassroom?.name ?? null,
    academy_id: rawClassroom?.academy_id ?? null,
  };
};

export const voucherPreview = (voucher: any, center: any) => {
  const expiresAt = voucher?.expires_at ? Date.parse(voucher.expires_at) : null;
  const computedStatus = expiresAt && Date.now() > expiresAt && voucher.status === 'unused'
    ? 'expired'
    : voucher.status;
  return {
    id: voucher.id,
    code: voucher.code,
    access_kind: voucher.access_kind,
    status: computedStatus,
    expires_at: voucher.expires_at,
    assigned_name: null,
    assigned_email: null,
    center,
    product: productView(voucher.products),
    experience: voucher.experiences ? { id: voucher.experience_id, name: voucher.experiences.name } : null,
    plan: voucher.plans
      ? { id: voucher.plan_id, name: voucher.plans.name, duration_days: voucher.plans.duration_days }
      : null,
    classroom: classroomView(voucher),
  };
};
