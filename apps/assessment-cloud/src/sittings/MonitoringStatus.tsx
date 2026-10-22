import type { Row } from "../../../../packages/assessment-web/src/client";
import { proctorLink } from "../../../../packages/assessment-web/src/account-links";
import { useAppT } from "../i18n/index.ts";

/** Whether a sitting is monitored, with a way into Proctor to set it up or watch it. */
export function MonitoringStatus({ sitting, tenant }: { sitting: Row; tenant: string }) {
  const t = useAppT();
  const monitored = Array.isArray(sitting.required_services) && sitting.required_services.includes("proctor");
  return (
    <p className="monitoring-status">
      <span className={monitored ? "badge monitored" : "badge"}>{monitored ? t("monitoring.on") : t("monitoring.off")}</span>
      <a href={proctorLink(tenant, monitored ? "workload" : "policies")}>{monitored ? t("monitoring.open") : t("monitoring.setup")}</a>
    </p>
  );
}
