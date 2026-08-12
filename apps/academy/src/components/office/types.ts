export type StatusMetrics = {
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  paidAmount: number;
  pendingAmount: number;
  activeStudents: number;
  paidShare: number;
  pendingShare: number;
  failedShare: number;
};

export type ContactFormState = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

export type ContactEnrichmentKey = 'classrooms' | 'memberships' | 'alerts' | 'payments' | 'educationOS';
export type ContactEnrichmentStatus = 'idle' | 'loading' | 'success' | 'error';
export type ContactEnrichmentState = Record<ContactEnrichmentKey, ContactEnrichmentStatus>;

export type ClassroomFormState = {
  name: string;
  description: string;
};

export type ClassroomMembershipFormState = {
  classroom_id: string;
  contact_id: string;
  role: string;
};

export type AnnouncementFormState = {
  classroom_id: string;
  title: string;
  content: string;
};

export type AlertFormState = {
  contact_id: string;
  type: string;
  severity: string;
  content: string;
};

export type OfferFormState = {
  name: string;
  type: string;
  price_amount: string;
  currency: string;
  duration_days: string;
  description: string;
};

export type GrantFormState = {
  offer_id: string;
  grant_type: string;
  resource_type: string;
  resource_id: string;
  capability_key: string;
  quantity: string;
  duration_days: string;
};

export type PaymentFormState = {
  contact_id: string;
  offer_id: string;
};
