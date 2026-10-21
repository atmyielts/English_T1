import {
  type AnalyticsReport,
  metric as metricText,
} from "../../../../packages/assessment-web/src/analytics";
import { INTL, useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "../i18n/index.ts";
export function ItemDiagnostics({
  report,
  disabled,
  selectForm,
  loadForms,
  moreForms,
  loadItems,
  moreItems,
}: {
  report: AnalyticsReport;
  disabled: boolean;
  selectForm: (form: string | null) => void;
  loadForms: () => void;
  moreForms: boolean;
  loadItems: () => void;
  moreItems: boolean;
}) {
  const t = useAppT(), { locale } = useI18n();
  const metric = (value: number | null | undefined, digits = 1) => metricText(value, digits, t, INTL[locale]);
  return (
    <section aria-labelledby="item-diagnostics">
      <h2 id="item-diagnostics">{t("diagnostics.title")}</h2>
      <p>
        {t("diagnostics.lead")}
      </p>
      <p>
        {t("diagnostics.correlationHint")}
      </p>
      <label>
        {t("diagnostics.form")}<select
          disabled={disabled}
          value={report.selected_form ?? ""}
          onChange={(event) => selectForm(event.target.value || null)}
        >
          <option value="">{t("diagnostics.allForms")}</option>
          {report.forms.map((form) => (
            <option key={form.form_key} value={form.form_key}>
              {t("diagnostics.formOption", { questions: String(form.item_count), results: String(form.sample_size), key: form.form_key.slice(0, 8) })}
            </option>
          ))}
        </select>
      </label>
      {moreForms && (
        <button className="quiet" disabled={disabled} onClick={loadForms}>
          {t("diagnostics.moreForms")}
        </button>
      )}
      {!report.selected_form
        ? (
          <p>
            {t("diagnostics.chooseForm")}
          </p>
        )
        : (
          <>
            <p>
              {t("diagnostics.alpha")}{" "}
              <strong>{metric(report.reliability?.raw_alpha, 3)}</strong>{t("diagnostics.alphaDetail", { results: String(report.reliability?.sample_size ?? ""), questions: String(report.reliability?.item_count ?? "") })}
            </p>
            {(report.reliability?.raw_alpha ?? 0) < 0 && (
              <p role="status">
                {t("diagnostics.negativeAlpha")}
              </p>
            )}
            <ul className="records analytics-items">
              {report.items.map((item) => (
                <li key={item.id}>
                  <h3>{item.prompt}</h3>
                  <p>
                    {t("diagnostics.itemMeta", { locale: item.locale, type: item.type.replaceAll("_", " "), results: String(item.sample_size) })}
                  </p>
                  <dl>
                    <div>
                      <dt>{t("diagnostics.mean")}</dt>
                      <dd>{metric(item.mean_percent)}%</dd>
                    </div>
                    <div>
                      <dt>{t("diagnostics.fullCredit")}</dt>
                      <dd>{item.full_credit} / {item.sample_size}</dd>
                    </div>
                    <div>
                      <dt>{t("diagnostics.recorded")}</dt>
                      <dd>{item.recorded} / {item.sample_size}</dd>
                    </div>
                    <div>
                      <dt>{t("diagnostics.correlation")}</dt>
                      <dd>{metric(item.item_rest_correlation, 3)}</dd>
                    </div>
                  </dl>
                  {(item.item_rest_correlation ?? 0) < 0 && (
                    <p role="status">
                      {t("diagnostics.negativeItem")}
                    </p>
                  )}
                  {item.options.length > 0 && (
                    <table>
                      <caption>
                        {t("diagnostics.optionsCaption")}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">{t("diagnostics.option")}</th>
                          <th scope="col">{t("diagnostics.selected")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.options.map((option) => (
                          <tr key={option.id}>
                            <th scope="row">{option.text}</th>
                            <td>{option.selected} / {item.sample_size}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              ))}
            </ul>
            {moreItems && (
              <button className="quiet" disabled={disabled} onClick={loadItems}>
                {t("diagnostics.moreItems")}
              </button>
            )}
          </>
        )}
    </section>
  );
}
