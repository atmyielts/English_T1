import {
  type AnalyticsReport,
  metric,
} from "../../../../packages/assessment-web/src/analytics";
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
  return (
    <section aria-labelledby="item-diagnostics">
      <h2 id="item-diagnostics">Question quality diagnostics</h2>
      <p>
        Compare only candidates who received the same selected question versions
        and point weights. Shuffled order does not create a different group.
        Different groups are not equated.
      </p>
      <p>
        Corrected item-rest correlation requires at least five cases and nonzero
        variation in both the item and remaining score. “Not available” is not a
        zero correlation.
      </p>
      <label>
        Comparable form group<select
          disabled={disabled}
          value={report.selected_form ?? ""}
          onChange={(event) => selectForm(event.target.value || null)}
        >
          <option value="">All forms — descriptive totals only</option>
          {report.forms.map((form) => (
            <option key={form.form_key} value={form.form_key}>
              {form.item_count} questions · {form.sample_size} results ·{" "}
              {form.form_key.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      {moreForms && (
        <button className="quiet" disabled={disabled} onClick={loadForms}>
          Load more form groups
        </button>
      )}
      {!report.selected_form
        ? (
          <p>
            Choose one form group to view item statistics and internal
            consistency.
          </p>
        )
        : (
          <>
            <p>
              Raw coefficient alpha:{" "}
              <strong>{metric(report.reliability?.raw_alpha, 3)}</strong>. Based
              on {report.reliability?.sample_size} results and{" "}
              {report.reliability?.item_count}{" "}
              questions. At least five cases, two questions and nonzero total
              variance are required. Unequal point weights affect raw alpha; it
              is not a validity or fairness score.
            </p>
            {(report.reliability?.raw_alpha ?? 0) < 0 && (
              <p role="status">
                Negative internal consistency: investigate content/scoring and
                the sample. No scores or keys have been changed.
              </p>
            )}
            <ul className="records analytics-items">
              {report.items.map((item) => (
                <li key={item.id}>
                  <h3>{item.prompt}</h3>
                  <p>
                    {item.locale} · {item.type.replaceAll("_", " ")} ·{" "}
                    {item.sample_size} results
                  </p>
                  <dl>
                    <div>
                      <dt>Mean points earned</dt>
                      <dd>{metric(item.mean_percent)}%</dd>
                    </div>
                    <div>
                      <dt>Full-credit results</dt>
                      <dd>{item.full_credit} / {item.sample_size}</dd>
                    </div>
                    <div>
                      <dt>Response recorded</dt>
                      <dd>{item.recorded} / {item.sample_size}</dd>
                    </div>
                    <div>
                      <dt>Corrected item-rest correlation</dt>
                      <dd>{metric(item.item_rest_correlation, 3)}</dd>
                    </div>
                  </dl>
                  {(item.item_rest_correlation ?? 0) < 0 && (
                    <p role="status">
                      Negative relationship with the remaining test. Human
                      investigation is needed; this does not automatically
                      invalidate the question.
                    </p>
                  )}
                  {item.options.length > 0 && (
                    <table>
                      <caption>
                        Option selection counts, not answer-key disclosure.
                        Multiple-choice responses may select more than one
                        option.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Option</th>
                          <th scope="col">Selected</th>
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
                Load more question diagnostics
              </button>
            )}
          </>
        )}
    </section>
  );
}
