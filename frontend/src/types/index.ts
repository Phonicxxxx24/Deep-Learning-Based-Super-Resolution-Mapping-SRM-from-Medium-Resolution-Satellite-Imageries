export type JobStatus = "queued" | "running" | "done" | "error";

export interface SubmitResponse {
  job_id: string;
  status: JobStatus;
  queue_position: number | null;
  progress_msg: string | null;
  progress_pct?: number | null;
  stage?: string | null;
  elapsed_s?: number | null;
}

export interface StatusResponse {
  job_id: string;
  status: JobStatus;
  queue_position: number | null;
  progress_msg: string | null;
  progress_pct?: number | null;
  stage?: string | null;
  elapsed_s?: number | null;
}

export interface BandMetrics {
  psnr_db:  number | null;
  ssim:     number | null;
  sam_deg:  number | null;
  ergas:    number | null;
  lpips:    number | null;
}

export interface BandPreservationStat {
  band:             string;
  name:             string;
  wavelength_nm:    number;
  lr_mean:          number;
  sr_mean:          number;
  lr_std:           number;
  sr_std:           number;
  abs_diff:         number;
  preservation_pct: number;
}

export type ModelChoice = "able" | "diffusion" | "both";

export interface SRResult {
  job_id:              string;
  lat:                 number;
  lon:                 number;
  sr_rgb_url:          string;
  lr_rgb_url:          string;
  uncertainty_url:     string;
  spectral_chart_url?: string | null;
  lam_url:             string | null;
  ndvi_url:            string | null;
  lr_ndvi_url?:        string | null;
  mndwi_url:           string | null;
  lr_mndwi_url?:       string | null;
  ndbi_url:            string | null;
  lr_ndbi_url?:        string | null;
  metrics:             BandMetrics;
  band_stats?:         BandPreservationStat[] | null;
  patch_size_px:       number;
  output_size_px:      number;
  lr_resolution_m:     number;
  sr_resolution_m:     number;
  processing_time_s:   number;
  sampling_steps_used: number;
  scale_factor?:       number;
  model_choice?:       ModelChoice;
  sr_able_url?:        string | null;
  sr_diffusion_url?:   string | null;
  band_stats_able?:    BandPreservationStat[] | null;
  band_stats_diffusion?: BandPreservationStat[] | null;
}

export interface SubmitPayload {
  lat:              number;
  lon:              number;
  n_uncertainty?:   number;
  sampling_steps?:  number;
  run_lam?:         boolean;
  scale_factor?:    number;
  model_choice?:    ModelChoice;
}

export interface ScanRecord {
  job_id:              string;
  lat:                 number;
  lon:                 number;
  location_name?:      string | null;
  event_category?:     string | null;
  sampling_steps:      number;
  status:              JobStatus;
  created_at:          string;
  completed_at?:       string | null;
  processing_time_s?:  number | null;
  psnr_db?:            number | null;
  ssim?:               number | null;
  sam_deg?:            number | null;
  ergas?:              number | null;
  preservation_pct?:   number | null;
  thumbnail_url?:      string | null;
  lr_rgb_url?:         string | null;
  sr_rgb_url?:         string | null;
  sr_able_url?:        string | null;
  sr_diffusion_url?:   string | null;
  model_choice?:       string | null;
  uncertainty_url?:    string | null;
  spectral_chart_url?: string | null;
  ndvi_url?:           string | null;
  mndwi_url?:          string | null;
  ndbi_url?:           string | null;
}

export interface ScansResponse {
  scans: ScanRecord[];
  total: number;
}
