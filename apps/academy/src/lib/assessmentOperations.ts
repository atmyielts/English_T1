export type AssessmentCertificate = {
  id?: string;
  candidate_id: string;
  public_token: string;
  version: number;
  issued_at: string;
  revoked_at: string | null;
  public_consent: boolean;
};
export type AssessmentOperations = {
  current_user_id: string;
  reviews: Array<
    {
      id: string;
      paper_id: string;
      decision: string;
      evidence: string;
      created_at: string;
    }
  >;
  rules: Array<
    {
      id: string;
      paper_id: string;
      course_name: string;
      minimum_percent: number;
      maximum_percent: number;
      required_skills: Array<{ skill: string; minimum: number }>;
      evidence: string;
      status: string;
    }
  >;
  incidents: Array<
    {
      id: string;
      candidate_id: string;
      kind: string;
      note: string;
      status: string;
      resolution: string;
      created_at: string;
    }
  >;
  certificates: AssessmentCertificate[];
  support: Array<
    {
      id: string;
      candidate_id: string;
      assigned_to: string;
      goal: string;
      due_on: string;
      status: string;
      outcome: string;
    }
  >;
  orders: Array<
    {
      id: string;
      run_id: string;
      status: string;
      brief: string;
      due_at: string;
      provider_name: string;
      agreed_amount: number;
      coordinator_id: string | null;
      acceptance_note: string;
      delivery_note: string;
    }
  >;
  staff: Array<
    { user_id: string; display_name: string; classroom_ids: string[] }
  >;
  packages: Array<
    {
      id: string;
      name: string;
      assessments: number;
      price: number;
      valid_days: number;
    }
  >;
  allowances: Array<
    {
      id: string;
      contact_id: string;
      package_id: string;
      assessments: number;
      used: number;
      expires_at: string;
      charge_id: string | null;
    }
  >;
  uses: Array<{ candidate_id: string; allowance_id: string }>;
  subscriptions: Array<
    {
      id: string;
      contact_id: string;
      starts_on: string;
      ends_on: string | null;
      status: string;
    }
  >;
  branches: Array<{ id: string; name: string }>;
  suggestions: Array<
    {
      candidate_id: string;
      rules: Array<{ id: string; course_name: string; evidence: string }>;
    }
  >;
  permissions: { finance: boolean; certificates: boolean; support: boolean };
  limited: boolean;
};
export const certificateUrl = (token: string) =>
  `${window.location.origin}/verify-assessment?token=${
    encodeURIComponent(token)
  }`;
