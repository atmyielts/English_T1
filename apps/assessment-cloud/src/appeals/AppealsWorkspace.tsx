import { useAppeals } from "../../../../packages/assessment-web/src/use-appeals";
import { AppealList } from "../../../../packages/assessment-web/src/AppealList";
import { AppealView } from "../../../../packages/assessment-web/src/AppealView";
import "../../../../packages/assessment-web/src/appeals.css";
import { useAppT } from "../i18n/index.ts";
export function AppealsWorkspace(
  { tenant, actor }: { tenant: string; actor: string },
) {
  const t = useAppT();
  const state = useAppeals(tenant, actor, "queue");
  return (
    <section
      className="appeals-panel"
      aria-labelledby="appeals-title"
      aria-busy={state.loading || state.busy}
    >
      <h2 id="appeals-title">{t("appeals.title")}</h2>
      <p>
        {t("appeals.lead")}
      </p>
      <AppealList state={state} />
      {state.detail && (
        <AppealView
          key={`${state.detail.id}:${state.detail.revision}`}
          appeal={state.detail}
          busy={state.busy}
          blocked={!!state.pending || !state.commandReady}
          send={state.send}
        />
      )}
    </section>
  );
}
