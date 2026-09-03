import { useCallback, useEffect, useMemo, useState } from "react";
import { action, exportFeedback, getFeedback, getFeedbackDetail, updateStatus } from "../api";

const statuses = ["New", "In review", "Closed"];
const categories = ["Estate", "Transport", "Environment", "Other"];
const mask = (id) => id ? `${id[0]}••••••${id.slice(-2)}` : "";

export function AdminPage({ session }) {
  const [feedback, setFeedback] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [filters, setFilters] = useState({ category: "", status: "", page: 1 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await getFeedback(session, filters); setFeedback(result.feedback); setPagination(result.pagination); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [session, filters]);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => feedback.filter((item) => `${item.name} ${item.message}`.toLowerCase().includes(search.toLowerCase())), [feedback, search]);
  const counts = Object.fromEntries(["Total", ...statuses].map((status) => [status, status === "Total" ? feedback.length : feedback.filter((item) => item.status === status).length]));
  const setFilter = (next) => setFilters({ ...filters, ...next, page: 1 });
  const clear = () => { setFilters({ category: "", status: "", page: 1 }); setSearch(""); };
  const update = async (id, status) => { try { await updateStatus(session, id, status); load(); } catch (requestError) { setError(requestError.message); } };
  const openDetail = async (id) => { try { setError(""); setDetail((await getFeedbackDetail(session, id)).feedback); } catch (requestError) { setError(requestError.message); } };
  const ai = async (id, type, method, body) => {
    try {
      const result = await action(session, id, type, method, body);
      if (result.feedback) setDetail(result.feedback);
      else if (result.summary) setDetail((item) => ({ ...item, summary: result.summary }));
      else if (result.translation) setDetail((item) => ({ ...item, translation: result.translation }));
      else if (result.suggestion) setDetail((item) => ({ ...item, routingSuggestion: result.suggestion }));
      load();
    } catch (requestError) { setError(requestError.message); }
  };
  const download = async () => {
    try {
      const blob = await exportFeedback(session, { ...filters, search });
      const url = URL.createObjectURL(blob); const link = Object.assign(document.createElement("a"), { href: url, download: "civicvoice-feedback.csv" }); link.click(); URL.revokeObjectURL(url);
    } catch (requestError) { setError(requestError.message); }
  };

  return <main className="page-shell admin-shell">
    <div className="page-heading"><div className="eyebrow">Admin workspace</div><h1>Feedback inbox</h1></div>
    <div className="summary-cards">{Object.entries(counts).map(([label, value]) => <div className="summary-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <section className="feedback-list">
      <div className="inbox-controls">
        <input aria-label="Search feedback" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages or names" />
        <select value={filters.category} onChange={(event) => setFilter({ category: event.target.value })}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={filters.status} onChange={(event) => setFilter({ status: event.target.value })}><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
        <button className="text-button" onClick={clear}>Clear</button><button className="text-button" onClick={download}>Export CSV</button>
      </div>
      {error && <p className="error-message" role="alert">{error} <button onClick={load}>Retry</button></p>}
      {loading ? <p role="status">Loading feedback…</p> : error ? null : detail ? <article className="detail">
        <button className="text-button" onClick={() => setDetail(null)}>← Back to inbox</button><h2>{detail.name}</h2>
        <p className="muted">{mask(detail.nric)} · {detail.reference}</p><p className="muted">{detail.category} · {detail.status} · {new Date(detail.createdAt).toLocaleString()}</p><p>{detail.message}</p>
        {detail.summary && <p><strong>Summary:</strong> {detail.summary}</p>}{detail.translation && <p><strong>English translation:</strong> {detail.translation}</p>}{detail.urgency && <p><strong>Routing:</strong> {detail.urgency} — {detail.responsibleTeam}</p>}
        {detail.routingSuggestion && <p><strong>Suggested:</strong> {detail.routingSuggestion.urgency} — {detail.routingSuggestion.team} <button onClick={() => ai(detail.id, "routing-suggestion", "PATCH", { action: "accept" })}>Accept</button><button onClick={() => ai(detail.id, "routing-suggestion", "PATCH", { action: "dismiss" })}>Dismiss</button></p>}
        <button onClick={() => ai(detail.id, "summary")}>Summarize</button><button onClick={() => ai(detail.id, "translation")}>Translate to English</button><button onClick={() => ai(detail.id, "routing-suggestion")}>Suggest routing</button>
      </article> : visible.length ? visible.map((item) => <article className="feedback-row" key={item.id}>
        <div><button className="feedback-link" onClick={() => openDetail(item.id)}>{item.name}</button><div className="feedback-meta">{mask(item.nric)} · {item.category} · {new Date(item.createdAt).toLocaleDateString()}</div><p>{item.message}</p></div>
        <select className="status-pill" value={item.status} onChange={(event) => update(item.id, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
      </article>) : <p>{feedback.length ? "No feedback matches your search." : "No feedback has been submitted yet."}</p>}
      <div className="pagination"><button disabled={pagination.page <= 1} onClick={() => setFilters({ ...filters, page: pagination.page - 1 })}>Previous</button><span>Page {pagination.page} of {pagination.pages}</span><button disabled={pagination.page >= pagination.pages} onClick={() => setFilters({ ...filters, page: pagination.page + 1 })}>Next</button></div>
    </section>
  </main>;
}
