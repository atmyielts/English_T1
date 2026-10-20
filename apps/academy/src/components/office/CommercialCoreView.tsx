import {WalletPolicyPanel} from './WalletPolicyPanel';
import {staffRequest} from '../../lib/staffRequest';
import {financialMoney as money,financialTotals,exactUnits,sumCurrencies} from '../../lib/financialMoney';
import {FinancialBranchSelector,type FinancialBranch} from './FinancialBranchSelector';
import {hasPendingFinance} from '../../lib/staffRequest';
import {useFinancialAction} from '../../lib/useFinancialAction';
import {FinancialActionStatus} from './FinancialActionStatus';
import { translate } from '../../i18n';
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, CalendarClock, CreditCard, FileClock, Landmark, RefreshCw, ReceiptText, Scale, ShieldCheck } from "lucide-react";
import { teacherStudioAllocatePayment, teacherStudioCommercialCore, teacherStudioCreateCharge, teacherStudioCreatePricingPlan, teacherStudioCreateSubscription, teacherStudioManageSubscription, teacherStudioPostAccountAdjustment, teacherStudioRecordPaymentPromise, teacherStudioRecordPaymentReconciliation, type AcademyCommercialCore } from "../../lib/client";

type CommercialTab = "overview" | "plans" | "billing" | "debt" | "ledger";
type Props = {
  academyId: string;
  actorId: string;
  formatDate: (value: string | null | undefined) => string;
};

const label = (value: unknown) => translate(String(value ?? "").replaceAll("_", " "));
const localDate=(value:Date)=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
const today = () => localDate(new Date());
const nextMonth = () => {
  const value = new Date();
  value.setMonth(value.getMonth() + 1);
  return localDate(value);
};

export function CommercialCoreView(props:Props){
 const [branch,setBranch]=useState(''),[branches,setBranches]=useState<FinancialBranch[]>([]);
 return <><FinancialBranchSelector branches={branches} value={branch} disabled={hasPendingFinance(props.academyId,props.actorId)} onChange={id=>{if(!hasPendingFinance(props.academyId,props.actorId))setBranch(id);}}/><CommercialCoreViewContent key={branch} {...props} branchId={branch} onBranches={setBranches}/></>;
}
function CommercialCoreViewContent({academyId,actorId,formatDate,branchId,onBranches}:Props & {branchId:string;onBranches:(branches:FinancialBranch[])=>void}){
  const [data, setData] = useState<AcademyCommercialCore | null>(null);
  const [tab, setTab] = useState<CommercialTab>("overview");
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [plan, setPlan] = useState({
    plan_key: "",
    name: "",
    pricing_model: "monthly_fixed",
    billing_cycle: "monthly",
    base_amount: "",
    currency: "UZS",
    classroom_id: "",
    branch_id: "",
  });
  const [subscription, setSubscription] = useState({
    contact_id: "",
    pricing_plan_id: "",
    branch_id: "",
    classroom_id: "",
    starts_on: today(),
    ends_on: "",
    list_amount: "",
    discount_amount: "0",
    discount_type: "negotiated",
    discount_reason: "",
    auto_renew: false,
  });
  const [subscriptionAction, setSubscriptionAction] = useState<{
    subscription_id: string;
    operation: "freeze" | "resume" | "cancel" | "complete" | "renew";
    starts_on: string;
    ends_on: string;
    reason: string;
  }>({
    subscription_id: "",
    operation: "freeze",
    starts_on: today(),
    ends_on: nextMonth(),
    reason: "",
  });
  const [charge, setCharge] = useState({
    subscription_id: "",
    cycle_key: "",
    due_on: today(),
    service_period_start: today(),
    service_period_end: nextMonth(),
    description: "Tuition",
  });
  const [allocation, setAllocation] = useState({
    payment_id: "",
    charge_id: "",
    amount: "",
  });
  const [adjustment, setAdjustment] = useState({
    contact_id: "",
    entry_type: "account_credit",
    amount: "",
    currency: "UZS",
    reason: "",
    charge_id: "",
  });
  const [promise, setPromise] = useState({
    contact_id: "",
    subscription_id: "",
    branch_id: "",
    amount: "",
    currency: "UZS",
    promised_for: nextMonth(),
    restriction_state: "none",
    notes: "",
  });
  const [reconciliation, setReconciliation] = useState({
    payment_id: "",
    provider: "click",
    provider_transaction_id: "",
    provider_event_id: "",
    event_type: "status",
    amount: "",
    currency: "UZS",
    status: "matched",
    payload_hash: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await teacherStudioCommercialCore(academyId,actorId,branchId);
      setData(next);onBranches(next.branches);
      const contact = next.contacts[0];
      const pricingPlan = next.pricing_plans.find((item) => item.is_active);
      const activeSub = next.subscriptions.find((item) => ["active", "overdue", "paused"].includes(item.status));
      const openCharge = next.charges.find((item) => item.outstanding_amount > 0 && !["void", "written_off"].includes(item.status));
      const paidPayment = next.payments.find((item) => item.status === "paid");
      setSubscription((previous) => ({
        ...previous,
        contact_id: previous.contact_id || contact?.id || "",
        pricing_plan_id: previous.pricing_plan_id || pricingPlan?.id || "",
        branch_id: previous.branch_id || (branchId||next.branches[0]?.id) || "",
      }));
      setSubscriptionAction((previous) => ({
        ...previous,
        subscription_id: previous.subscription_id || activeSub?.id || next.subscriptions[0]?.id || "",
      }));
      setCharge((previous) => ({
        ...previous,
        subscription_id: previous.subscription_id || activeSub?.id || "",
      }));
      setAllocation((previous) => ({
        ...previous,
        payment_id: previous.payment_id || paidPayment?.id || "",
        charge_id: previous.charge_id || openCharge?.id || "",
      }));
      setAdjustment((previous) => ({
        ...previous,
        contact_id: previous.contact_id || contact?.id || "",
      }));
      setPromise((previous) => ({
        ...previous,
        contact_id: previous.contact_id || contact?.id || "",
        subscription_id: previous.subscription_id || activeSub?.id || "",
        branch_id: previous.branch_id || (branchId||next.branches[0]?.id) || "",
      }));
      setReconciliation((previous) => ({
        ...previous,
        payment_id: previous.payment_id || paidPayment?.id || "",
        provider_transaction_id: previous.provider_transaction_id || paidPayment?.provider_transaction_id || "",
      }));
    } catch (nextError) {
      setLoadError(nextError instanceof Error ? nextError.message : translate('Unable to load the commercial core.'));
    } finally {
      setLoading(false);
    }
  }, [academyId,actorId,branchId,onBranches]);

  useEffect(() => {
    void load();
  }, [load]);

  const action=useFinancialAction(academyId,actorId,load);const {busy,pending,run}=action;const error=action.error||loadError;

  const contactById = useMemo(() => new Map((data?.contacts ?? []).map((item) => [item.id, item])), [data?.contacts]);
  const planById = useMemo(() => new Map((data?.pricing_plans ?? []).map((item) => [item.id, item])), [data?.pricing_plans]);
  const overdueCharges=(data?.charges??[]).filter(item=>exactUnits(item.outstanding_amount)>0n&&Number(item.days_overdue)>0);


  const canManageFinance = data?.access?.permissions.manageFinance === true;
  const canCollectFinance = data?.access?.permissions.collectFinance === true;
  const canAdjustFinance = data?.access?.permissions.adjustFinance === true;
  const canReconcileFinance = data?.access?.permissions.reconcileFinance === true;
  const availableTabs = useMemo<Array<[CommercialTab, string]>>(() => [["overview", "Accounts"], ...(canManageFinance ? [["plans", "Plans & agreements"] as [CommercialTab, string]] : []), ...(canManageFinance || canCollectFinance ? [["billing", "Charges & allocation"] as [CommercialTab, string]] : []), ...(canCollectFinance ? [["debt", "Debt"] as [CommercialTab, string]] : []), ...(canAdjustFinance || canReconcileFinance ? [["ledger", "Ledger & reconciliation"] as [CommercialTab, string]] : [])], [canAdjustFinance, canCollectFinance, canManageFinance, canReconcileFinance]);
  const activeTab = availableTabs.some(([key]) => key === tab) ? tab : "overview";

  if (loading && !data)
    return (
      <section className="panel">
        <p>{translate("Loading commercial accounts…")}</p>
      </section>
    );

  return (
    <section className="commercial-core">
      <div className="section-heading commercial-core__heading">
        <div>
          <span className="eyebrow">{translate("Revenue engine")}</span>
          <h2>{translate("Commercial core")}</h2>
          <p>{translate("Separate agreements, charges, payments, allocations, balances, access, and debt.")}</p>
        </div>
        <button className="ghost-btn" type="button" onClick={() => void load()} disabled={loading || busy}>
          <RefreshCw size={16} /> {translate("Refresh")}{' '}</button>
      </div>
      {Object.values(data?.has_more??{}).some(Boolean)?<p role="status">{translate('Lists show the latest 500 records. Totals include all permitted records.')}</p>:null}
      <FinancialActionStatus busy={busy} error={error??''} notice={action.notice} review={action.review} pending={pending} onRetry={action.retry}/>
      <p>{translate('Wallet credit and receipts belong to the institution account. A branch filter selects its students; it does not attribute shared credit to branch revenue.')}</p>
      <div className="commercial-core__stats">
        <article>
          <ReceiptText size={18} />
          <span>{translate("Receivables")}</span>
          <strong>{financialTotals(data?.totals?.account_balances,'balance')}</strong>
        </article>
        <article>
          <FileClock size={18} />
          <span>{translate("Overdue")}</span>
          <strong>{financialTotals(data?.totals?.charges,'overdue_amount')}</strong>
        </article>
        <article>
          <CreditCard size={18} />
          <span>{translate("Payments received")}</span>
          <strong>{financialTotals(data?.totals?.payments,'paid_amount')}</strong>
        </article>
        <article>
          <Scale size={18} />
          <span>{translate("Account credit")}</span>
          <strong>{financialTotals(data?.totals?.account_balances,'available_credit')}</strong>
        </article>
      </div>
      <nav className="business-tabs" aria-label={translate("Commercial core sections")}>
        {availableTabs.map(([key, label]) => (
          <button key={key} type="button" className={activeTab === key ? "is-active" : ""} onClick={() => setTab(key)}>
            {translate(label)}
          </button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <div className="commercial-grid">
          {data?<WalletPolicyPanel data={data} disabled={busy||pending} canManage={canManageFinance} onSave={payload=>void run(()=>staffRequest(academyId,'set_wallet_policy',payload,actorId),translate('Wallet policy saved.'))}/>:null}
          <section className="panel commercial-span">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Student accounts")}</span>
                <h3>{translate("Balances and aging")}</h3>
              </div>
              <BadgeDollarSign size={18} />
            </div>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>{translate("Student")}</th>
                    <th>{translate("Balance")}</th>
                    <th>{translate("Debits")}</th>
                    <th>{translate("Credits")}</th>
                    <th>{translate("Last movement")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.account_balances.map((item) => {
                    const contact = contactById.get(item.contact_id);
                    return (
                      <tr key={`${item.contact_id}-${item.currency}`}>
                        <td>{contact ? `${contact.first_name} ${contact.last_name}` : item.contact_id}</td>
                        <td className={exactUnits(item.balance) > 0 ? "amount-due" : "amount-credit"}>{money(item.balance, item.currency)}</td>
                        <td>{money(item.debits, item.currency)}</td>
                        <td>{money(item.credits, item.currency)}</td>
                        <td>{formatDate(item.last_entry_at)}</td>
                      </tr>
                    );
                  })}
                  {!data?.account_balances.length ? (
                    <tr>
                      <td colSpan={5}>{translate("No financial history yet.")}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Aging")}</span>
                <h3>{translate("Overdue exposure")}</h3>
              </div>
            </div>
            <div className="aging-list">
              {["1-7", "8-14", "15-30", "31-60", "60+"].map((bucket) => {
                const amounts=sumCurrencies(overdueCharges.filter(item=>item.aging_bucket===bucket),'outstanding_amount');
                return (
                  <div key={bucket}>
                    <span>{bucket} {translate("days")}</span>
                    <strong>{financialTotals(amounts,'amount')}</strong>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "plans" ? (
        <div className="commercial-grid">
          <form
            className="panel compact-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void run(async () => {
                await teacherStudioCreatePricingPlan(academyId, {
                  ...plan,
                  base_amount: plan.base_amount,
                  branch_id: plan.branch_id || null,
                  classroom_id: plan.classroom_id || null,
                  idempotency_key: crypto.randomUUID(),
                },actorId);
                setPlan((previous) => ({
                  ...previous,
                  plan_key: "",
                  name: "",
                  base_amount: "",
                }));
              }, "Pricing plan created.");
            }}
          ><fieldset disabled={busy||pending} style={{border:0,padding:0,margin:0,minWidth:0,display:"contents"}}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Catalog")}</span>
                <h3>{translate("Create pricing plan")}</h3>
              </div>
              <Landmark size={18} />
            </div>
            <div className="form-grid two-col">
              <label>
                {translate("Key")}{' '}<input
                  className="input"
                  value={plan.plan_key}
                  onChange={(event) =>
                    setPlan((previous) => ({
                      ...previous,
                      plan_key: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                {translate("Name")}{' '}<input
                  className="input"
                  value={plan.name}
                  onChange={(event) =>
                    setPlan((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            </div>
            <div className="form-grid two-col">
              <label>
                {translate("Model")}{' '}<select
                  className="input"
                  value={plan.pricing_model}
                  onChange={(event) =>
                    setPlan((previous) => ({
                      ...previous,
                      pricing_model: event.target.value,
                    }))
                  }
                >
                  {["monthly_fixed", "calendar_month", "per_lesson", "per_teaching_hour", "lesson_package", "module_fee", "course_fee", "upfront_course", "installment_plan", "individual_lesson", "custom", "scholarship", "free"].map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate("Cycle")}{' '}<select
                  className="input"
                  value={plan.billing_cycle}
                  onChange={(event) =>
                    setPlan((previous) => ({
                      ...previous,
                      billing_cycle: event.target.value,
                    }))
                  }
                >
                  {["weekly", "monthly", "calendar_month", "quarterly", "term", "course", "package", "one_time", "custom"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {translate("Base amount")}{' '}<input
                className="input"
                type="number"
                min="0"
                value={plan.base_amount}
                onChange={(event) =>
                  setPlan((previous) => ({
                    ...previous,
                    base_amount: event.target.value,
                  }))
                }
                required
              />
            </label>
            <button className="primary-btn" disabled={busy||pending}>
              {translate("Create plan")}{' '}</button>
          </fieldset></form>
          <form
            className="panel compact-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void run(async () => {
                await teacherStudioCreateSubscription(academyId, {
                  ...subscription,
                  list_amount: subscription.list_amount ? subscription.list_amount : null,
                  discount_amount: subscription.discount_amount || '0',
                  branch_id: subscription.branch_id || null,
                  classroom_id: subscription.classroom_id || null,
                  ends_on: subscription.ends_on || null,
                  idempotency_key: crypto.randomUUID(),
                },actorId);
              }, "Commercial agreement created.");
            }}
          ><fieldset disabled={busy||pending} style={{border:0,padding:0,margin:0,minWidth:0,display:"contents"}}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Agreement")}</span>
                <h3>{translate("Create subscription")}</h3>
              </div>
              <ShieldCheck size={18} />
            </div>
            <label>
              {translate("Student")}{' '}<select
                className="input"
                value={subscription.contact_id}
                onChange={(event) =>
                  setSubscription((previous) => ({
                    ...previous,
                    contact_id: event.target.value,
                  }))
                }
                required
              >
                {data?.contacts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.first_name} {item.last_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {translate("Pricing plan")}{' '}<select
                className="input"
                value={subscription.pricing_plan_id}
                onChange={(event) =>
                  setSubscription((previous) => ({
                    ...previous,
                    pricing_plan_id: event.target.value,
                    list_amount: String(planById.get(event.target.value)?.base_amount ?? ""),
                  }))
                }
                required
              >
                <option value="">{translate("Choose plan")}</option>
                {data?.pricing_plans
                  .filter((item) => item.is_active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {money(item.base_amount, item.currency)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="form-grid two-col">
              <label>
                {translate("Starts")}{' '}<input
                  className="input"
                  type="date"
                  value={subscription.starts_on}
                  onChange={(event) =>
                    setSubscription((previous) => ({
                      ...previous,
                      starts_on: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                {translate("Ends")}{' '}<input
                  className="input"
                  type="date"
                  value={subscription.ends_on}
                  onChange={(event) =>
                    setSubscription((previous) => ({
                      ...previous,
                      ends_on: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="form-grid two-col">
              <label>
                {translate("List amount")}{' '}<input
                  className="input"
                  type="number"
                  min="0"
                  value={subscription.list_amount}
                  onChange={(event) =>
                    setSubscription((previous) => ({
                      ...previous,
                      list_amount: event.target.value,
                    }))
                  }
                  placeholder={translate("Use plan price")}
                />
              </label>
              <label>
                {translate("Discount")}{' '}<input
                  className="input"
                  type="number"
                  min="0"
                  value={subscription.discount_amount}
                  onChange={(event) =>
                    setSubscription((previous) => ({
                      ...previous,
                      discount_amount: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            {Number(subscription.discount_amount) > 0 ? (
              <label>
                {translate("Discount reason")}{' '}<textarea
                  className="input"
                  value={subscription.discount_reason}
                  onChange={(event) =>
                    setSubscription((previous) => ({
                      ...previous,
                      discount_reason: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            ) : null}
            <label className="check-row">
              <input
                type="checkbox"
                checked={subscription.auto_renew}
                onChange={(event) =>
                  setSubscription((previous) => ({
                    ...previous,
                    auto_renew: event.target.checked,
                  }))
                }
              />{" "}
              {translate("Auto-renew")}{' '}</label>
            <button className="primary-btn" disabled={busy||pending}>
              {translate("Create agreement")}{' '}</button>
          </fieldset></form>
          <form
            className="panel compact-form commercial-span"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void run(
                () =>
                  teacherStudioManageSubscription(academyId, {
                    ...subscriptionAction,
                    reason: subscriptionAction.reason || null,
                    starts_on: ["freeze", "renew"].includes(subscriptionAction.operation) ? subscriptionAction.starts_on : null,
                    ends_on: ["freeze", "renew"].includes(subscriptionAction.operation) ? subscriptionAction.ends_on : null,
                    idempotency_key: crypto.randomUUID(),
                  },actorId),
                `Agreement ${subscriptionAction.operation} recorded.`,
              );
            }}
          ><fieldset disabled={busy||pending} style={{border:0,padding:0,margin:0,minWidth:0,display:"contents"}}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Lifecycle control")}</span>
                <h3>{translate("Manage agreement")}</h3>
              </div>
              <CalendarClock size={18} />
            </div>
            <div className="form-grid two-col">
              <label>
                {translate("Agreement")}{' '}<select
                  className="input"
                  value={subscriptionAction.subscription_id}
                  onChange={(event) =>
                    setSubscriptionAction((previous) => ({
                      ...previous,
                      subscription_id: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">{translate("Choose agreement")}</option>
                  {data?.subscriptions.map((item) => {
                    const contact = contactById.get(item.contact_id);
                    return (
                      <option key={item.id} value={item.id}>
                        {contact?.first_name} {contact?.last_name} · {item.status}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label>
                {translate("Operation")}{' '}<select
                  className="input"
                  value={subscriptionAction.operation}
                  onChange={(event) =>
                    setSubscriptionAction((previous) => ({
                      ...previous,
                      operation: event.target.value as typeof previous.operation,
                    }))
                  }
                >
                  {["freeze", "resume", "cancel", "complete", "renew"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {["freeze", "renew"].includes(subscriptionAction.operation) ? (
              <div className="form-grid two-col">
                <label>
                  {subscriptionAction.operation === "freeze" ? "Freeze starts" : "Renewal starts"}
                  <input
                    className="input"
                    type="date"
                    value={subscriptionAction.starts_on}
                    onChange={(event) =>
                      setSubscriptionAction((previous) => ({
                        ...previous,
                        starts_on: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  {subscriptionAction.operation === "freeze" ? "Freeze ends" : "Renewal ends"}
                  <input
                    className="input"
                    type="date"
                    value={subscriptionAction.ends_on}
                    onChange={(event) =>
                      setSubscriptionAction((previous) => ({
                        ...previous,
                        ends_on: event.target.value,
                      }))
                    }
                    required={subscriptionAction.operation === "freeze"}
                  />
                </label>
              </div>
            ) : null}
            <label>
              {translate("Reason / note")}{' '}<textarea
                className="input"
                value={subscriptionAction.reason}
                onChange={(event) =>
                  setSubscriptionAction((previous) => ({
                    ...previous,
                    reason: event.target.value,
                  }))
                }
                required={["freeze", "cancel"].includes(subscriptionAction.operation)}
              />
            </label>
            <button className="primary-btn" disabled={busy||pending}>
              {translate("Apply agreement operation")}{' '}</button>
          </fieldset></form>
          <section className="panel commercial-span">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Active book")}</span>
                <h3>{translate("Plans and agreements")}</h3>
              </div>
            </div>
            <div className="subscription-cards">
              {data?.subscriptions.map((item) => {
                const contact = contactById.get(item.contact_id);
                const itemPlan = planById.get(item.pricing_plan_id);
                const freezes = data.subscription_freezes?.filter((entry) => entry.subscription_id === item.id) ?? [];
                return (
                  <article key={item.id}>
                    <header>
                      <strong>{contact ? `${contact.first_name} ${contact.last_name}` : "Student"}</strong>
                      <span className={`status-pill ${item.status === "active" ? "active" : ""}`}>{item.status}</span>
                    </header>
                    <p>
                      {itemPlan?.name ?? "Plan"} · {item.billing_cycle}
                    </p>
                    <strong>{money(item.agreed_amount, item.currency)}</strong>
                    {item.discount_amount > 0 ? <small>{translate("Discount")}{' '}{money(item.discount_amount, item.currency)}</small> : null}
                    {item.cancellation_reason ? <small>{translate("Cancelled:")}{' '}{item.cancellation_reason}</small> : null}
                    {freezes.map((entry) => (
                      <small key={entry.id}>
                        {translate("Freeze")}{' '}{entry.starts_on}–{entry.ends_on} · {entry.status}
                      </small>
                    ))}
                  </article>
                );
              })}
              {!data?.subscriptions.length ? <p className="empty-state">{translate("No commercial agreements yet.")}</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "billing" ? (
        <div className="commercial-grid">
          {canManageFinance ? (
            <form
              className="panel compact-form"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void run(
                  () =>
                    teacherStudioCreateCharge(academyId, {
                      ...charge,
                      idempotency_key: crypto.randomUUID(),
                    },actorId),
                  "Charge issued and posted to the ledger.",
                );
              }}
            ><fieldset disabled={busy||pending} style={{border:0,padding:0,margin:0,minWidth:0,display:"contents"}}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{translate("Invoice")}</span>
                  <h3>{translate("Issue charge")}</h3>
                </div>
                <ReceiptText size={18} />
              </div>
              <label>
                {translate("Agreement")}{' '}<select
                  className="input"
                  value={charge.subscription_id}
                  onChange={(event) =>
                    setCharge((previous) => ({
                      ...previous,
                      subscription_id: event.target.value,
                    }))
                  }
                  required
                >
                  {data?.subscriptions
                    .filter((item) => ["active", "overdue", "paused"].includes(item.status))
                    .map((item) => {
                      const contact = contactById.get(item.contact_id);
                      return (
                        <option key={item.id} value={item.id}>
                          {contact?.first_name} {contact?.last_name} · {money(item.agreed_amount, item.currency)}
                        </option>
                      );
                    })}
                </select>
              </label>
              <div className="form-grid two-col">
                <label>
                  {translate("Cycle key")}{' '}<input
                    className="input"
                    value={charge.cycle_key}
                    onChange={(event) =>
                      setCharge((previous) => ({
                        ...previous,
                        cycle_key: event.target.value,
                      }))
                    }
                    placeholder="2026-08"
                  />
                </label>
                <label>
                  {translate("Due date")}{' '}<input
                    className="input"
                    type="date"
                    value={charge.due_on}
                    onChange={(event) =>
                      setCharge((previous) => ({
                        ...previous,
                        due_on: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <label>
                {translate("Description")}{' '}<input
                  className="input"
                  value={charge.description}
                  onChange={(event) =>
                    setCharge((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <button className="primary-btn" disabled={busy||pending}>
                {translate("Issue charge")}{' '}</button>
            </fieldset></form>
          ) : null}
          {canCollectFinance ? (
            <form
              className="panel compact-form"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void run(
                  () =>
                    teacherStudioAllocatePayment(academyId, {
                      payment_id: allocation.payment_id,
                      charge_id: allocation.charge_id,
                      amount: allocation.amount,
                      idempotency_key: crypto.randomUUID(),
                    },actorId),
                  "Payment allocated without changing its original record.",
                );
              }}
            ><fieldset disabled={busy||pending} style={{border:0,padding:0,margin:0,minWidth:0,display:"contents"}}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{translate("Allocation")}</span>
                  <h3>{translate("Apply payment to charge")}</h3>
                </div>
                <CreditCard size={18} />
              </div>
              <label>
                {translate("Paid payment")}{' '}<select
                  className="input"
                  value={allocation.payment_id}
                  onChange={(event) =>
                    setAllocation((previous) => ({
                      ...previous,
                      payment_id: event.target.value,
                    }))
                  }
                  required
                >
                  {data?.payments
                    .filter((item) => item.status === "paid" && exactUnits(item.unallocated_amount)>0n)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.provider} · {money(exactUnits(item.unallocated_amount), item.currency)} {translate("available")}{' '}</option>
                    ))}
                </select>
              </label>
              <label>
                {translate("Open charge")}{' '}<select
                  className="input"
                  value={allocation.charge_id}
                  onChange={(event) =>
                    setAllocation((previous) => ({
                      ...previous,
                      charge_id: event.target.value,
                      amount: String(data?.charges.find((item) => item.id === event.target.value)?.outstanding_amount ?? ""),
                    }))
                  }
                  required
                >
                  {data?.charges
                    .filter((item) => exactUnits(item.outstanding_amount) > 0)
                    .map((item) => {
                      const contact = contactById.get(item.contact_id);
                      return (
                        <option key={item.id} value={item.id}>
                          {item.charge_number} · {contact?.first_name} · {money(item.outstanding_amount, item.currency)}
                        </option>
                      );
                    })}
                </select>
              </label>
              <label>
                {translate("Amount")}{' '}<input
                  className="input"
                  type="number"
                  min="1"
                  value={allocation.amount}
                  onChange={(event) =>
                    setAllocation((previous) => ({
                      ...previous,
                      amount: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <button className="primary-btn" disabled={busy||pending}>
                {translate("Allocate payment")}{' '}</button>
            </fieldset></form>
          ) : null}
          <section className="panel commercial-span">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Receivables")}</span>
                <h3>{translate("Charges")}</h3>
              </div>
            </div>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>{translate("Invoice")}</th>
                    <th>{translate("Student")}</th>
                    <th>{translate("Due")}</th>
                    <th>{translate("Net")}</th>
                    <th>{translate("Allocated")}</th>
                    <th>{translate("Outstanding")}</th>
                    <th>{translate("Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.charges.map((item) => {
                    const contact = contactById.get(item.contact_id);
                    return (
                      <tr key={item.id}>
                        <td>{item.charge_number}</td>
                        <td>
                          {contact?.first_name} {contact?.last_name}
                        </td>
                        <td>{item.due_on}</td>
                        <td>{money(item.net_amount, item.currency)}</td>
                        <td>{money(item.allocated_amount, item.currency)}</td>
                        <td className={item.outstanding_amount > 0 ? "amount-due" : ""}>{money(item.outstanding_amount, item.currency)}</td>
                        <td>
                          <span className={`status-pill ${item.calculated_status === "paid" ? "active" : ""}`}>{item.calculated_status}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {!data?.charges.length ? (
                    <tr>
                      <td colSpan={7}>{translate("No charges yet.")}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "debt" ? (
        <div className="commercial-grid">
          <form
            className="panel compact-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void run(
                () =>
                  teacherStudioRecordPaymentPromise(academyId, {
                    ...promise,
                    amount: promise.amount,
                    subscription_id: promise.subscription_id || null,
                    branch_id: promise.branch_id || null,
                    idempotency_key: crypto.randomUUID(),
                  },actorId),
                "Payment promise and collection history recorded.",
              );
            }}
          ><fieldset disabled={busy||pending} style={{border:0,padding:0,margin:0,minWidth:0,display:"contents"}}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Collections")}</span>
                <h3>{translate("Record payment promise")}</h3>
              </div>
              <FileClock size={18} />
            </div>
            <label>
              {translate("Student")}{' '}<select
                className="input"
                value={promise.contact_id}
                onChange={(event) =>
                  setPromise((previous) => ({
                    ...previous,
                    contact_id: event.target.value,
                  }))
                }
                required
              >
                {data?.contacts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.first_name} {item.last_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid two-col">
              <label>
                {translate("Amount")}{' '}<input
                  className="input"
                  type="number"
                  min="1"
                  value={promise.amount}
                  onChange={(event) =>
                    setPromise((previous) => ({
                      ...previous,
                      amount: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                {translate("Promised date")}{' '}<input
                  className="input"
                  type="date"
                  value={promise.promised_for}
                  onChange={(event) =>
                    setPromise((previous) => ({
                      ...previous,
                      promised_for: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            </div>
            <label>
              {translate("Notes")}{' '}<textarea
                className="input"
                value={promise.notes}
                onChange={(event) =>
                  setPromise((previous) => ({
                    ...previous,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
            <button className="primary-btn" disabled={busy||pending}>
              {translate("Record promise")}{' '}</button>
          </fieldset></form>
          <section className="panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Aging queue")}</span>
                <h3>{translate("Overdue students")}</h3>
              </div>
            </div>
            <div className="record-list">
              {overdueCharges.map((item) => {
                const contact = contactById.get(item.contact_id);
                return (
                  <article key={item.id} className="is-overdue">
                    <div>
                      <strong>
                        {contact?.first_name} {contact?.last_name}
                      </strong>
                      <p>
                        {item.charge_number} · {item.aging_bucket} {translate("days")}{' '}</p>
                    </div>
                    <strong>{money(item.outstanding_amount, item.currency)}</strong>
                  </article>
                );
              })}
              {!overdueCharges.length ? <p className="empty-state">{translate("No overdue charges.")}</p> : null}
            </div>
          </section>
          <section className="panel commercial-span">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Promises")}</span>
                <h3>{translate("Collection commitments")}</h3>
              </div>
            </div>
            <div className="record-list">
              {data?.payment_promises.map((item) => {
                const debt = data.debt_cases.find((entry) => entry.id === item.debt_case_id);
                const contact = debt ? contactById.get(debt.contact_id) : null;
                return (
                  <article key={item.id}>
                    <div>
                      <strong>
                        {contact?.first_name} {contact?.last_name}
                      </strong>
                      <p>
                        {item.status} {translate("· promised")}{' '}{item.promised_for}
                      </p>
                    </div>
                    <strong>{money(item.amount, item.currency)}</strong>
                  </article>
                );
              })}
              {!data?.payment_promises.length ? <p className="empty-state">{translate("No payment promises recorded.")}</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "ledger" ? (
        <div className="commercial-grid">
          {canAdjustFinance ? (
            <form
              className="panel compact-form"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void run(
                  () =>
                    teacherStudioPostAccountAdjustment(academyId, {
                      ...adjustment,
                      amount: adjustment.amount,
                      charge_id: adjustment.charge_id || null,
                      idempotency_key: crypto.randomUUID(),
                    },actorId),
                  "Immutable account adjustment posted.",
                );
              }}
            ><fieldset disabled={busy||pending} style={{border:0,padding:0,margin:0,minWidth:0,display:"contents"}}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{translate("Controlled journal")}</span>
                  <h3>{translate("Post adjustment")}</h3>
                </div>
                <Scale size={18} />
              </div>
              <label>
                {translate("Student")}{' '}<select
                  className="input"
                  value={adjustment.contact_id}
                  onChange={(event) =>
                    setAdjustment((previous) => ({
                      ...previous,
                      contact_id: event.target.value,
                      charge_id: "",
                    }))
                  }
                  required
                >
                  {data?.contacts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.first_name} {item.last_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate("Type")}{' '}<select
                  className="input"
                  value={adjustment.entry_type}
                  onChange={(event) =>
                    setAdjustment((previous) => ({
                      ...previous,
                      entry_type: event.target.value,
                    }))
                  }
                >
                  {["account_credit", "discount", "write_off", "refund", "debit_adjustment", "credit_adjustment", "transferred_credit"].map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate("Related charge (optional)")}{' '}<select
                  className="input"
                  value={adjustment.charge_id}
                  onChange={(event) => {
                    const selected = data?.charges.find((item) => item.id === event.target.value);
                    setAdjustment((previous) => ({
                      ...previous,
                      charge_id: event.target.value,
                      currency: selected?.currency ?? previous.currency,
                      amount: ["discount", "write_off"].includes(previous.entry_type) ? String(selected?.outstanding_amount ?? "") : previous.amount,
                    }));
                  }}
                >
                  <option value="">{translate("Account-level adjustment")}</option>
                  {data?.charges
                    .filter((item) => item.contact_id === adjustment.contact_id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.charge_number} · {money(item.outstanding_amount, item.currency)} {translate("outstanding")}{' '}</option>
                    ))}
                </select>
              </label>
              <div className="form-grid two-col">
                <label>
                  {translate("Amount")}{' '}<input
                    className="input"
                    type="number"
                    min="1"
                    value={adjustment.amount}
                    onChange={(event) =>
                      setAdjustment((previous) => ({
                        ...previous,
                        amount: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  {translate("Currency")}{' '}<input
                    className="input"
                    value={adjustment.currency}
                    onChange={(event) =>
                      setAdjustment((previous) => ({
                        ...previous,
                        currency: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <label>
                {translate("Reason")}{' '}<textarea
                  className="input"
                  value={adjustment.reason}
                  onChange={(event) =>
                    setAdjustment((previous) => ({
                      ...previous,
                      reason: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <button className="primary-btn" disabled={busy||pending}>
                {translate("Post adjustment")}{' '}</button>
            </fieldset></form>
          ) : null}
          {canReconcileFinance ? (
            <form
              className="panel compact-form"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void run(
                  () =>
                    teacherStudioRecordPaymentReconciliation(academyId, {
                      ...reconciliation,
                      payment_id: reconciliation.payment_id || null,
                      amount: reconciliation.amount ? reconciliation.amount : null,
                      idempotency_key: crypto.randomUUID(),
                    },actorId),
                  "Provider reconciliation evidence recorded.",
                );
              }}
            ><fieldset disabled={busy||pending} style={{border:0,padding:0,margin:0,minWidth:0,display:"contents"}}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{translate("Provider evidence")}</span>
                  <h3>{translate("Record reconciliation")}</h3>
                </div>
                <ShieldCheck size={18} />
              </div>
              <label>
                {translate("Payment")}{' '}<select
                  className="input"
                  value={reconciliation.payment_id}
                  onChange={(event) => {
                    const payment = data?.payments.find((item) => item.id === event.target.value);
                    setReconciliation((previous) => ({
                      ...previous,
                      payment_id: event.target.value,
                      provider: payment?.provider ?? previous.provider,
                      provider_transaction_id: payment?.provider_transaction_id ?? previous.provider_transaction_id,
                      amount: String(payment?.amount ?? ""),
                      currency: payment?.currency ?? previous.currency,
                    }));
                  }}
                >
                  <option value="">{translate("Unmatched event")}</option>
                  {data?.payments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.provider} · {item.provider_transaction_id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid two-col">
                <label>
                  {translate("Provider event ID")}{' '}<input
                    className="input"
                    value={reconciliation.provider_event_id}
                    onChange={(event) =>
                      setReconciliation((previous) => ({
                        ...previous,
                        provider_event_id: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  {translate("Status")}{' '}<select
                    className="input"
                    value={reconciliation.status}
                    onChange={(event) =>
                      setReconciliation((previous) => ({
                        ...previous,
                        status: event.target.value,
                      }))
                    }
                  >
                    {["matched", "unmatched", "duplicate", "amount_mismatch", "currency_mismatch", "ignored"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                {translate("Payload SHA-256")}{' '}<input
                  className="input"
                  value={reconciliation.payload_hash}
                  onChange={(event) =>
                    setReconciliation((previous) => ({
                      ...previous,
                      payload_hash: event.target.value,
                    }))
                  }
                  placeholder={translate("Store the hash, never provider secrets")}
                  required
                />
              </label>
              <button className="primary-btn" disabled={busy||pending}>
                {translate("Record reconciliation")}{' '}</button>
            </fieldset></form>
          ) : null}
          <section className="panel commercial-span">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Append-only history")}</span>
                <h3>{translate("Account ledger")}</h3>
              </div>
            </div>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>{translate("When")}</th>
                    <th>{translate("Student")}</th>
                    <th>{translate("Type")}</th>
                    <th>{translate("Reason")}</th>
                    <th>{translate("Amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.ledger_entries.map((item) => {
                    const contact = contactById.get(item.contact_id);
                    return (
                      <tr key={item.id}>
                        <td>{formatDate(item.effective_at)}</td>
                        <td>
                          {contact?.first_name} {contact?.last_name}
                        </td>
                        <td>{label(item.entry_type)}</td>
                        <td>{item.reason ?? "—"}</td>
                        <td className={exactUnits(item.amount) > 0 ? "amount-due" : "amount-credit"}>{money(item.amount, item.currency)}</td>
                      </tr>
                    );
                  })}
                  {!data?.ledger_entries.length ? (
                    <tr>
                      <td colSpan={5}>{translate("No ledger entries yet.")}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
