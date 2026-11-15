import {
  API_ACTIONS,
  MEDIA_TYPES,
  PROVIDER_NAMES,
} from "../constants/appConstants.js";
import { ProviderFilters } from "./MediaComponents.jsx";

export function ApiConsole({
  action,
  setAction,
  query,
  setQuery,
  kind,
  setKind,
  providers,
  onToggleProvider,
  locale,
  run,
  result,
  route,
  json,
  copied,
  copyJson,
  logs,
  clearLogs,
}) {
  return (
    <div className="api-console">
      <div className="section-heading api-heading">
        <div>
          <p className="eyebrow dark-eyebrow">CLIENT-SIDE API PLAYGROUND</p>
          <h2>Requests &amp; traces</h2>
        </div>
        <span className="static-badge">STATIC · NO SERVER API</span>
      </div>
      <div className="api-notice">
        <strong>These are request previews, not live REST routes.</strong>
        <span>This GitHub Pages app calls each provider directly from your browser. A reusable <code>/api/…</code> endpoint requires a separately hosted server.</span>
      </div>
      <div className="api-controls">
        <label>
          <span>OPERATION</span>
          <select value={action} onChange={(event) => setAction(event.target.value)}>
            {API_ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {action === "search" && (
          <label className="api-query-control">
            <span>SEARCH QUERY</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. hello" />
          </label>
        )}
        {(action === "search" || action === "trending" || action === "categories") && (
          <label>
            <span>MEDIA TYPE</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              {MEDIA_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        )}
        <button
          className="api-run"
          onClick={run}
          disabled={!providers.length || (action === "search" && !query.trim()) || result.isFetching}
        >{result.isFetching ? "Requesting…" : "Run requests"} <span>↗</span></button>
      </div>
      <ProviderFilters providers={providers} onToggle={onToggleProvider} className="light-provider-filters" />

      <div className="route-preview">
        <span>ROUTE PREVIEW</span>
        <code>{route}</code>
        <small>Locale: {locale}</small>
      </div>

      {result.isError && <div className="provider-error">{result.error.message}</div>}
      {json && (
        <section className="json-panel">
          <div className="console-panel-heading">
            <div><span className="status-live" /> <strong>Response payloads</strong></div>
            <button onClick={copyJson} type="button">{copied ? "Copied" : "Copy JSON"}</button>
          </div>
          <pre>{JSON.stringify(json, null, 2)}</pre>
        </section>
      )}

      <section className="log-panel">
        <div className="console-panel-heading">
          <div><strong>Request log</strong><span className="log-count">{logs.length} / 100</span></div>
          <button onClick={clearLogs} type="button" disabled={!logs.length}>Clear logs</button>
        </div>
        {logs.length ? (
          <div className="log-list">
            {logs.map((entry) => (
              <article className="log-entry" key={entry.requestId}>
                <div className="log-entry-top">
                  <code>{entry.requestId.slice(0, 12)}</code>
                  <span className={`log-status ${typeof entry.status === "number" && entry.status < 400 ? "ok" : ""}`}>
                    {entry.status}
                  </span>
                  <span className={`provider-dot ${entry.provider}`} />
                  <strong>{PROVIDER_NAMES[entry.provider]}</strong>
                  <span>{entry.durationMs} ms</span>
                  <time>{new Date(entry.time).toLocaleTimeString()}</time>
                </div>
                <code className="log-route">{entry.route}</code>
                {entry.endpoint && <code className="log-endpoint">{entry.endpoint}</code>}
                <div className="log-summary">
                  {entry.itemCount} items
                  {entry.error && <span className="log-error">{entry.error}</span>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="log-empty">No requests yet. Run an operation to start a trace.</div>
        )}
      </section>
    </div>
  );
}
