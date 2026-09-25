/**
 * Centralised API client for the SRM FastAPI backend.
 * All fetch calls live here — components never call fetch() directly.
 */
import { API_BASE } from "@/lib/constants";
import type {
  SubmitPayload, SubmitResponse, StatusResponse, SRResult, ScansResponse, ScanRecord,
} from "@/types";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Submit a new SR job. Returns immediately with job_id. */
export const submitSRJob = (payload: SubmitPayload): Promise<SubmitResponse> =>
  apiFetch<SubmitResponse>("/api/sr/submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });

/** Poll job status (call every POLL_INTERVAL_MS). */
export const getJobStatus = (jobId: string): Promise<StatusResponse> =>
  apiFetch<StatusResponse>(`/api/sr/status/${jobId}`);

/** Fetch full result after status === 'done'. */
export const getJobResult = (jobId: string): Promise<SRResult> =>
  apiFetch<SRResult>(`/api/sr/result/${jobId}`);

/** Query past scans history from SQLite database. */
export const getPastScans = (params?: {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ScansResponse> => {
  const q = new URLSearchParams();
  if (params?.category) q.set("category", params.category);
  if (params?.search) q.set("search", params.search);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  const queryString = q.toString() ? `?${q.toString()}` : "";
  return apiFetch<ScansResponse>(`/api/scans${queryString}`);
};

/** Fetch individual scan details from SQLite. */
export const getScanRecord = (jobId: string): Promise<ScanRecord> =>
  apiFetch<ScanRecord>(`/api/scans/${jobId}`);

/** Delete an individual scan record and its artifacts from backend. */
export const deleteScanRecord = (jobId: string): Promise<{ status: string; job_id: string; deleted: boolean }> =>
  apiFetch(`/api/scans/${jobId}`, {
    method: "DELETE",
  });

/** Clear all scan records and past history. */
export const clearAllScans = (): Promise<{ status: string; deleted_count: number }> =>
  apiFetch("/api/scans", {
    method: "DELETE",
  });

/** Health check. */
export const healthCheck = (): Promise<{ status: string; queue_depth: number }> =>
  apiFetch("/api/health");

/** Resolve a static PNG URL from the API base. */
export const staticUrl = (relPath: string): string =>
  `${API_BASE}${relPath}`;

