import { useState } from "react";
import type { Row } from "../../../../packages/assessment-web/src/client";
import { joinUrl } from "../../../../packages/assessment-web/src/account-links";
import { useAppT } from "../i18n/index.ts";

/** A sitting's join link: staff share it, candidates register themselves with it. */
export function JoinLinkPanel({ sitting, links, busy, act }: {
  sitting: Row;
  links: Row[];
  busy: boolean;
  act: (action: string, data: Record<string, unknown>, notice: string) => void;
}) {
  const t = useAppT();
  const [limit, setLimit] = useState(""),
    [copied, setCopied] = useState(false);
  const active = links.find((row) => row.window_id === sitting.id && !row.revoked_at);
  const closed = Date.parse(String(sitting.closes_at)) <= Date.now();
  const url = active ? joinUrl(String(active.id), String(active.code)) : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  const create = () => act("join_link.create", { window_id: sitting.id, ...(limit.trim() ? { max_joins: Number(limit) } : {}) }, active ? t("join.replaced") : t("join.created"));
  return (
    <div className="join-link">
      {active ? (
        <>
          <label>
            {t("join.label")}
            <input readOnly value={url} onFocus={(event) => event.target.select()} />
          </label>
          <p className="hint">
            {active.max_joins
              ? t("join.countLimited", { joined: Number(active.joined), limit: Number(active.max_joins) })
              : t("join.count", { joined: Number(active.joined) })}
          </p>
          <div className="actions">
            <button type="button" onClick={() => void copy()}>{copied ? t("join.copied") : t("join.copy")}</button>
            <button type="button" className="quiet" disabled={busy || closed} onClick={create}>{t("join.replace")}</button>
            <button type="button" className="quiet" disabled={busy} onClick={() => act("join_link.revoke", { id: active.id }, t("join.revoked"))}>{t("join.revoke")}</button>
          </div>
        </>
      ) : closed ? (
        <p className="hint">{t("join.closed")}</p>
      ) : (
        <div className="actions">
          <button type="button" disabled={busy} onClick={create}>{t("join.create")}</button>
          {/* A place limit is optional and rarely needed, so it stays folded away. */}
          <details className="join-limit">
            <summary>{t("join.limit")}</summary>
            <input type="number" min={1} max={10000} inputMode="numeric" aria-label={t("join.limit")} value={limit} placeholder={t("join.noLimit")} onChange={(event) => setLimit(event.target.value)} />
          </details>
        </div>
      )}
    </div>
  );
}
