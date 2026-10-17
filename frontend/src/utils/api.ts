/**
 * Centralised API client for the SRM FastAPI backend.
 * All fetch calls live here — components never call fetch() directly.
 */
import { API_BASE } from "@/lib/constants";
import type {
  SubmitPayload, SubmitResponse, StatusResponse, SRResult, ScansResponse, ScanRecord,
} from "@/types";

function getFullUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  let base = (API_BASE || "").trim().replace(/\/+$/, "");
  if (!base.startsWith("http://") && !base.startsWith("https://")) {
    base = `https://${base.replace(/^\/+/, "")}`;
  }
  return `${base}${cleanPath}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = getFullUrl(path);
  const res = await fetch(url, {
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

/** Resolve a static PNG URL from the API base. */
export const staticUrl = (relPath: string | null | undefined): string => {
  if (!relPath) return "";
  if (relPath.startsWith("http://") || relPath.startsWith("https://")) {
    return relPath;
  }
  return getFullUrl(relPath);
};

/** Fetch full result after status === 'done'. */
export const getJobResult = async (jobId: string): Promise<SRResult> => {
  const result = await apiFetch<SRResult>(`/api/sr/result/${jobId}`);
  const keys: (keyof SRResult)[] = [
    "sr_rgb_url", "lr_rgb_url", "uncertainty_url", "spectral_chart_url",
    "lam_url", "ndvi_url", "lr_ndvi_url", "mndwi_url", "lr_mndwi_url",
    "ndbi_url", "lr_ndbi_url", "sr_able_url", "sr_diffusion_url",
  ];
  for (const k of keys) {
    if (typeof result[k] === "string" && (result[k] as string).startsWith("/")) {
      (result[k] as any) = staticUrl(result[k] as string);
    }
  }
  return result;
};

/** Query past scans history from SQLite database. */
export const getPastScans = async (params?: {
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
  const resp = await apiFetch<ScansResponse>(`/api/scans${queryString}`);
  if (resp.scans) {
    for (const scan of resp.scans) {
      if (scan.thumbnail_url?.startsWith("/")) scan.thumbnail_url = staticUrl(scan.thumbnail_url);
      if (scan.lr_rgb_url?.startsWith("/")) scan.lr_rgb_url = staticUrl(scan.lr_rgb_url);
      if (scan.sr_rgb_url?.startsWith("/")) scan.sr_rgb_url = staticUrl(scan.sr_rgb_url);
    }
  }
  return resp;
};

/** Fetch individual scan details from SQLite. */
export const getScanRecord = async (jobId: string): Promise<ScanRecord> => {
  const scan = await apiFetch<ScanRecord>(`/api/scans/${jobId}`);
  if (scan.thumbnail_url?.startsWith("/")) scan.thumbnail_url = staticUrl(scan.thumbnail_url);
  if (scan.lr_rgb_url?.startsWith("/")) scan.lr_rgb_url = staticUrl(scan.lr_rgb_url);
  if (scan.sr_rgb_url?.startsWith("/")) scan.sr_rgb_url = staticUrl(scan.sr_rgb_url);
  return scan;
};

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

