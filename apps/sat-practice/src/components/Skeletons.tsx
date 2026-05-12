export const PageLoading = (props: { label?: string }) => (
  <div className="page-loading">
    <span className="skeleton-line long" />
    <span className="skeleton-line medium" />
    <p>{props.label ?? 'Loading SAT Practice Lab...'}</p>
  </div>
);
