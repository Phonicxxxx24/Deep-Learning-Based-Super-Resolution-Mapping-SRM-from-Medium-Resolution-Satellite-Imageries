"""Dual-path Super-Resolution pipeline for Sentinel-2 multispectral imagery.

Combines Latent Diffusion (opensr-model) for visible & NIR bands with
SEN2SRLite CNN (sen2sr) for full 10-band spectral coverage, applying
Fourier HardConstraints to prevent spectral hallucination.
"""

import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import mlstac
from omegaconf import OmegaConf
import opensr_model
from sen2sr.models.tricks import HardConstraint, gaussian_filter, ideal_filter
import torch

logger = logging.getLogger(__name__)


class ModelLoadingError(Exception):
    """Raised when pretrained weights or model architecture fails to load."""


class InferenceError(Exception):
    """Raised when model inference fails or produces corrupt (NaN/Inf) values."""


class DualPathSRPipeline:
    """Manages dual-model execution, multimodal fusion, and frequency filtering."""

    def __init__(
        self,
        opensr_ckpt: str = "opensr-ldsrs2_v1_0_0.ckpt",
        opensr_config_name: str = "config_10m.yaml",
        sen2sr_model_dir: str = "model/SEN2SRLite",
        device: str = "cuda",
        sampling_steps: int = 100,
        enable_hard_constraint: bool = True,
        filter_type: str = "ideal",
        filter_cutoff: int = 32,
        use_referencex4: bool = True,
        use_tta: bool = False,
    ) -> None:
        """Initialize models and configurations on target device.

        Args:
            opensr_ckpt: Path to local LDSR-S2 checkpoint file.
            opensr_config_name: Name of config file inside opensr_model/configs.
            sen2sr_model_dir: Directory containing SEN2SRLite mlm.json.
            device: Compute device ('cuda' or 'cpu').
            sampling_steps: DDIM sampling steps for diffusion path (100 for full quality).
            enable_hard_constraint: Whether to apply Fourier HardConstraint.
            filter_type: Frequency filter profile ('ideal' or 'gaussian').
            filter_cutoff: Radius in pixels for the low-pass cutoff.
            use_referencex4: Whether to attempt loading the referencex4 SWIR
                fusion pipeline (x2 + x4 RSWIR models). Falls back to direct
                SEN2SRLite if the x4 weights are unavailable.
            use_tta: Whether to run Test-Time Augmentation (4-fold dihedral ensembling)
                for the diffusion path to max out sharpness and cancel noise.

        Raises:
            ModelLoadingError: If any model fails to instantiate or load weights.
        """
        self.device = torch.device(
            device if (device == "cuda" and torch.cuda.is_available()) else "cpu"
        )
        self.sampling_steps = sampling_steps
        self.enable_hard_constraint = enable_hard_constraint
        self.filter_type = filter_type
        self.filter_cutoff = filter_cutoff
        self.use_tta = use_tta

        logger.info(
            "Initializing DualPathSRPipeline on device: %s (sampling_steps=%d, TTA=%s)",
            self.device,
            self.sampling_steps,
            self.use_tta,
        )

        # 1. Load opensr-model (Path A)
        try:
            cfg_dir = Path(opensr_model.__file__).parent / "configs"
            cfg_path = cfg_dir / opensr_config_name
            if not cfg_path.is_file():
                raise FileNotFoundError(f"Config not found at {cfg_path}")
            self.diffusion_config = OmegaConf.load(str(cfg_path))
            self.model_diffusion = opensr_model.SRLatentDiffusion(
                self.diffusion_config, device=self.device
            )
            self.model_diffusion.load_pretrained(opensr_ckpt)
            self.model_diffusion.eval()
            logger.info("Loaded opensr-model SRLatentDiffusion successfully.")
        except Exception as exc:
            raise ModelLoadingError(
                f"Failed to load opensr-model from ckpt '{opensr_ckpt}': {exc}"
            ) from exc

        # 2. Load SEN2SRLite (Path B)
        try:
            loader = mlstac.load(sen2sr_model_dir)
            self.model_sen2sr = loader.compiled_model(device=self.device)
            self.model_sen2sr.eval()
            logger.info("Loaded SEN2SRLite via mlstac from '%s'.", sen2sr_model_dir)
        except Exception as exc:
            raise ModelLoadingError(
                f"Failed to load SEN2SRLite from '{sen2sr_model_dir}': {exc}"
            ) from exc

        # 3. Load referencex4 SWIR fusion pipeline (optional — graceful fallback)
        # Hardware note: all four models are loaded to the same device as the main model.
        # The x4 RSWIR model is not published on HuggingFace; the except block catches
        # that and falls back to direct SEN2SRLite for Path B.
        self.referencex4_pipeline = None
        if use_referencex4:
            try:
                from sen2sr import referencex4

                # f2 model: 20m SWIR bands → 10m (x2 RSWIR)
                f2_dir = os.path.join(
                    os.path.dirname(sen2sr_model_dir), "SEN2SRLite_Reference_RSWIR_x2"
                )
                f2_compiled = mlstac.load(f2_dir).compiled_model(device=str(self.device))

                # f4 fusion model: SWIR 10m → 2.5m (x4 RSWIR)
                f4_dir = os.path.join(
                    os.path.dirname(sen2sr_model_dir), "SEN2SRLite_Reference_RSWIR_x4"
                )
                f4_compiled = mlstac.load(f4_dir).compiled_model(device=str(self.device))

                # compiled_model() returns SRModelWithConstraint with:
                #   .sr_model        — raw nn.Module
                #   .hard_constraint — HardConstraint nn.Module
                self.referencex4_pipeline = referencex4.srmodel(
                    sr_model=self.model_sen2sr.sr_model,
                    f2_model=f2_compiled.sr_model,
                    reference_model_x4=f4_compiled.sr_model,
                    reference_model_hard_constraint_x4=f4_compiled.hard_constraint,
                    device=str(self.device),
                )
                logger.info("referencex4 pipeline loaded successfully.")
            except Exception as exc:
                logger.warning(
                    "referencex4 load failed — falling back to direct SEN2SRLite: %s", exc
                )
                self.referencex4_pipeline = None

    def _extract_rgbn(self, tensor_10b: torch.Tensor) -> torch.Tensor:
        """Extract and reorder 10-band tensor to [B04, B03, B02, B08] for opensr-model.

        Input 10-band ordering:
            0: B02 (Blue)
            1: B03 (Green)
            2: B04 (Red)
            3: B05
            4: B06
            5: B07
            6: B08 (NIR)
            7: B8A
            8: B11 (SWIR1)
            9: B12 (SWIR2)

        Target ordering for opensr-model linear_transform_4b:
            0: B04 (Red)
            1: B03 (Green)
            2: B02 (Blue)
            3: B08 (NIR)
        """
        b04 = tensor_10b[:, 2:3]
        b03 = tensor_10b[:, 1:2]
        b02 = tensor_10b[:, 0:1]
        b08 = tensor_10b[:, 6:7]
        return torch.cat([b04, b03, b02, b08], dim=1)

    def run_inference(
        self,
        lr_10b: torch.Tensor,
        aoi_name: str = "custom_aoi",
        use_tta: Optional[bool] = None,
    ) -> Dict[str, torch.Tensor]:
        """Execute dual-path SR, multimodal fusion, and frequency filtering.

        Args:
            lr_10b: Normalized low-resolution input tensor of shape (1, 10, H, W).
            aoi_name: Identifier for structured logging.
            use_tta: Optional override for Test-Time Augmentation ensembling.

        Returns:
            Dict[str, torch.Tensor]: Dictionary containing:
                - 'sr_diffusion': Raw 4-band diffusion output (1, 4, 4H, 4W)
                - 'sr_sen2sr': Raw 10-band SEN2SRLite output (1, 10, 4H, 4W)
                - 'sr_fused': 10-band fused output prior to hard constraint (1, 10, 4H, 4W)
                - 'sr_final': Final 10-band output with HardConstraint applied (1, 10, 4H, 4W)

        Raises:
            InferenceError: If input shape is invalid or model produces NaNs/Infs.
        """
        if lr_10b.ndim != 4 or lr_10b.shape[1] != 10:
            raise ValueError(
                f"[{aoi_name}] Input must be a 4D tensor with 10 channels, got shape {lr_10b.shape}"
            )

        lr_gpu = lr_10b.to(self.device)
        logger.info(
            "[%s] Starting SR inference on input shape: %s",
            aoi_name,
            tuple(lr_gpu.shape),
        )

        # -------------------------------------------------------------
        # Path A: opensr-model Diffusion (RGB+NIR 4x)
        # -------------------------------------------------------------
        lr_rgbn = self._extract_rgbn(lr_gpu)
        run_tta = self.use_tta if use_tta is None else use_tta
        logger.info(
            "[%s] Path A (LDSR-S2): Running %d sampling steps (TTA=%s)...",
            aoi_name,
            self.sampling_steps,
            run_tta,
        )
        sr_diffusion = None  # may remain None on OOM — handled in band fusion below
        try:
            with torch.no_grad():
                if run_tta:
                    # 4-fold dihedral ensembling: identity, hflip, vflip, hvflip
                    preds = []
                    # 0: identity
                    p0 = self.model_diffusion.forward(
                        lr_rgbn, sampling_steps=self.sampling_steps
                    )
                    preds.append(p0)

                    # 1: horizontal flip
                    p_h = self.model_diffusion.forward(
                        torch.flip(lr_rgbn, dims=[-1]), sampling_steps=self.sampling_steps
                    )
                    preds.append(torch.flip(p_h, dims=[-1]))

                    # 2: vertical flip
                    p_v = self.model_diffusion.forward(
                        torch.flip(lr_rgbn, dims=[-2]), sampling_steps=self.sampling_steps
                    )
                    preds.append(torch.flip(p_v, dims=[-2]))

                    # 3: both flips (180-deg rotation)
                    p_hv = self.model_diffusion.forward(
                        torch.flip(lr_rgbn, dims=[-2, -1]), sampling_steps=self.sampling_steps
                    )
                    preds.append(torch.flip(p_hv, dims=[-2, -1]))

                    sr_diffusion = torch.stack(preds, dim=0).mean(dim=0)
                else:
                    sr_diffusion = self.model_diffusion.forward(
                        lr_rgbn, sampling_steps=self.sampling_steps
                    )
        except RuntimeError as exc:
            if "out of memory" in str(exc).lower():
                logger.warning(
                    "[%s] CUDA OOM in LDSR-S2 — skipping diffusion, "
                    "using SEN2SRLite output for RGB+NIR",
                    aoi_name,
                )
                torch.cuda.empty_cache()
                sr_diffusion = None   # handled below in band fusion
            else:
                raise InferenceError(
                    f"[{aoi_name}] Path A (LDSR-S2) execution failed: {exc}"
                ) from exc
        except Exception as exc:
            raise InferenceError(
                f"[{aoi_name}] Path A (LDSR-S2) execution failed: {exc}"
            ) from exc

        # Always clear cache after diffusion inference on 6GB GPU
        if self.device.type != "cpu":
            torch.cuda.empty_cache()

        if sr_diffusion is not None and (
            torch.isnan(sr_diffusion).any() or torch.isinf(sr_diffusion).any()
        ):
            raise InferenceError(f"[{aoi_name}] Path A produced NaN or Inf values.")

        if sr_diffusion is not None:
            logger.info(
                "[%s] Path A complete: shape=%s, min=%.4f, max=%.4f",
                aoi_name,
                tuple(sr_diffusion.shape),
                float(sr_diffusion.min()),
                float(sr_diffusion.max()),
            )
        else:
            logger.info("[%s] Path A skipped (OOM) — will use SEN2SRLite bands for RGB+NIR.", aoi_name)

        # -------------------------------------------------------------
        # Path B: SEN2SRLite 10-Band SR (4x)
        # Routes through referencex4 SWIR fusion pipeline when available,
        # with OOM guard falling back to direct SEN2SRLite on CPU.
        # -------------------------------------------------------------
        logger.info(
            "[%s] Path B (SEN2SRLite%s): Running 10-band CNN inference...",
            aoi_name,
            "+referencex4" if self.referencex4_pipeline is not None else "",
        )
        try:
            with torch.no_grad():
                if self.referencex4_pipeline is not None:
                    sr_sen2sr = self.referencex4_pipeline(lr_gpu)
                else:
                    sr_sen2sr = self.model_sen2sr(lr_gpu)
        except RuntimeError as exc:
            if "out of memory" in str(exc).lower():
                logger.warning(
                    "[%s] CUDA OOM in SEN2SRLite path — clearing cache and retrying on CPU",
                    aoi_name,
                )
                torch.cuda.empty_cache()
                with torch.no_grad():
                    sr_sen2sr = self.model_sen2sr.cpu()(lr_gpu.cpu())
                sr_sen2sr = sr_sen2sr.to(self.device)
            else:
                raise InferenceError(
                    f"[{aoi_name}] Path B (SEN2SRLite) execution failed: {exc}"
                ) from exc
        except Exception as exc:
            raise InferenceError(
                f"[{aoi_name}] Path B (SEN2SRLite) execution failed: {exc}"
            ) from exc

        # Always clear cache after inference on 6GB GPU
        if self.device.type != "cpu":
            torch.cuda.empty_cache()

        if torch.isnan(sr_sen2sr).any() or torch.isinf(sr_sen2sr).any():
            raise InferenceError(f"[{aoi_name}] Path B produced NaN or Inf values.")

        logger.info(
            "[%s] Path B complete: shape=%s, min=%.4f, max=%.4f",
            aoi_name,
            tuple(sr_sen2sr.shape),
            float(sr_sen2sr.min()),
            float(sr_sen2sr.max()),
        )

        # -------------------------------------------------------------
        # Multimodal Band Fusion
        # -------------------------------------------------------------
        # Map Path A channels: 0:B04, 1:B03, 2:B02, 3:B08
        # Into 10-band tensor: [B02, B03, B04, B05, B06, B07, B08, B8A, B11, B12]
        # If Path A was skipped (CUDA OOM), keep SEN2SRLite bands for RGB+NIR.
        sr_fused = sr_sen2sr.clone()
        if sr_diffusion is not None:
            sr_fused[:, 0:1] = sr_diffusion[:, 2:3]  # B02 (Blue)
            sr_fused[:, 1:2] = sr_diffusion[:, 1:2]  # B03 (Green)
            sr_fused[:, 2:3] = sr_diffusion[:, 0:1]  # B04 (Red)
            sr_fused[:, 6:7] = sr_diffusion[:, 3:4]  # B08 (NIR)

        # Ensure reflectance remains non-negative and physically valid
        sr_fused = torch.clamp(sr_fused, min=0.0, max=1.0)

        # -------------------------------------------------------------
        # HardConstraint Frequency Filtering
        # -------------------------------------------------------------
        if self.enable_hard_constraint:
            logger.info(
                "[%s] Applying HardConstraint (%s filter, cutoff=%d)...",
                aoi_name,
                self.filter_type,
                self.filter_cutoff,
            )
            sr_h, sr_w = sr_fused.shape[-2], sr_fused.shape[-1]
            if self.filter_type == "gaussian":
                filter_mask = gaussian_filter((sr_h, sr_w), cutoff=self.filter_cutoff)
            else:
                filter_mask = ideal_filter((sr_h, sr_w), cutoff=self.filter_cutoff)

            filter_mask = filter_mask.to(self.device)
            hc = HardConstraint(
                low_pass_mask=filter_mask, bands="all", device=str(self.device)
            )
            sr_final = hc(lr=lr_gpu, sr=sr_fused)
            sr_final = torch.clamp(sr_final, min=0.0, max=1.0)
        else:
            sr_final = sr_fused

        logger.info(
            "[%s] SRM inference complete: final shape=%s, min=%.4f, max=%.4f",
            aoi_name,
            tuple(sr_final.shape),
            float(sr_final.min()),
            float(sr_final.max()),
        )

        return {
            "sr_diffusion": sr_diffusion,
            "sr_sen2sr": sr_sen2sr,
            "sr_fused": sr_fused,
            "sr_final": sr_final,
        }
