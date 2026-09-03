const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
export class ApiError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code; } }
async function api(path, options = {}, session) {
  const response = await fetch(`${API_URL}${path}`, { headers: { "Content-Type": "application/json", ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}), ...(options.headers ?? {}) }, ...options });
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error?.message ?? "Something went wrong.", response.status, body.error?.code);
  return body;
}
export const login = (credentials) => api("/api/login", { method: "POST", body: JSON.stringify(credentials) });
export const health = () => api("/api/health");
export const submitFeedback = (session, feedback) => api("/api/feedback", { method: "POST", body: JSON.stringify(feedback) }, session);
export const getFeedback = (session, filters = {}) => api(`/api/feedback?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "" && value != null))}`, {}, session);
export const updateStatus = (session, id, status) => api(`/api/feedback/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }, session);
export const action = (session, id, type, method = "POST", body) => api(`/api/feedback/${id}/${type}`, { method, body: body ? JSON.stringify(body) : undefined }, session);
export const exportUrl = (filters) => `${API_URL}/api/feedback/export?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value))}`;
