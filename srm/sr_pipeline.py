"""Dual-path Super-Resolution pipeline for Sentinel-2 multispectral imagery.

Combines custom 4-band Sen2SR-RRDB CNN (from the Able project) for visible & NIR bands with
SEN2SRLite CNN (sen2sr) for full 10-band spectral coverage, applying
Fourier HardConstraints to prevent spectral hallucination.
"""

import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple, TypedDict
import mlstac
from sen2sr.models.tricks import HardConstraint, gaussian_filter, ideal_filter
import torch

from srm.able import Sen2SRModel

logger = logging.getLogger(__name__)


class InferenceOutput(TypedDict, total=False):
    sr_diffusion: Optional[torch.Tensor]
    sr_able: Optional[torch.Tensor]
    sr_final_able: Optional[torch.Tensor]
    sr_final_diffusion: Optional[torch.Tensor]
    sr_sen2sr: torch.Tensor
    sr_fused: torch.Tensor
    sr_final: torch.Tensor


class ModelLoadingError(Exception):
    """Raised when pretrained weights or model architecture fails to load."""


class InferenceError(Exception):
    """Raised when model inference fails or produces corrupt (NaN/Inf) values."""


class DualPathSRPipeline:
    """Manages dual-model execution, multimodal fusion, and frequency filtering."""

    def __init__(
        self,
        able_weights: str = "model/Sen2SR_Able/final_weights.pth",
        opensr_ckpt: Optional[str] = None,
        opensr_config_name: Optional[str] = None,
        sen2sr_model_dir: str = "model/SEN2SRLite",
        device: str = "cuda",
        sampling_steps: int = 50,
        enable_hard_constraint: bool = True,
        filter_type: str = "ideal",
        filter_cutoff: int = 32,
        use_referencex4: bool = True,
        use_tta: bool = False,
    ) -> None:
        """Initialize models and configurations on target device.

        Args:
            able_weights: Path to local Sen2SR-RRDB checkpoint file.
            opensr_ckpt: Path to local LDSR-S2 checkpoint file.
            opensr_config_name: Filename of the LDSR-S2 config YAML.
            sen2sr_model_dir: Directory containing SEN2SRLite mlm.json.
            device: Compute device ('cuda' or 'cpu').
            sampling_steps: Sampling steps parameter.
            enable_hard_constraint: Whether to apply Fourier HardConstraint.
            filter_type: Frequency filter profile ('ideal' or 'gaussian').
            filter_cutoff: Radius in pixels for the low-pass cutoff.
            use_referencex4: Whether to attempt loading referencex4 SWIR fusion pipeline.
            use_tta: Whether to run Test-Time Augmentation (4-fold dihedral ensembling).
        """
        self.device = torch.device(
            device if (device == "cuda" and torch.cuda.is_available()) else "cpu"
        )
        self.sampling_steps = sampling_steps
        self.enable_hard_constraint = enable_hard_constraint
        self.filter_type = filter_type
        self.filter_cutoff = filter_cutoff
        self.use_tta = use_tta

        self.able_weights = able_weights
        self.opensr_ckpt = opensr_ckpt or "opensr-ldsrs2_v1_0_0.ckpt"
        self.opensr_config_name = opensr_config_name or "config_10m.yaml"
        self._model_diffusion_instance = None

        logger.info(
            "Initializing DualPathSRPipeline on device: %s (TTA=%s)",
            self.device,
            self.use_tta,
        )

        # 1. Load Sen2SR-RRDB Model (Path A - Default Native Model)
        try:
            self.model_able = Sen2SRModel(
                weights_path=able_weights,
                device=self.device,
            )
            # Backward compatibility alias
            self.model_diffusion = self.model_able
            logger.info("Loaded Sen2SR-RRDB model from '%s' successfully.", able_weights)
        except Exception as exc:
            raise ModelLoadingError(
                f"Failed to load Sen2SR-RRDB model from '{able_weights}': {exc}"
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
        self.referencex4_pipeline = None
        if use_referencex4:
            try:
                from sen2sr import referencex4

                f2_dir = os.path.join(
                    os.path.dirname(sen2sr_model_dir), "SEN2SRLite_Reference_RSWIR_x2"
                )
                f2_compiled = mlstac.load(f2_dir).compiled_model(device=str(self.device))

                f4_dir = os.path.join(
                    os.path.dirname(sen2sr_model_dir), "SEN2SRLite_Reference_RSWIR_x4"
                )
                f4_compiled = mlstac.load(f4_dir).compiled_model(device=str(self.device))

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

    def get_diffusion_model(self):
        """Lazy loader for opensr-model Latent Diffusion (LDSR-S2)."""
        if self._model_diffusion_instance is None:
            try:
                import opensr_model
                from omegaconf import OmegaConf

                cfg_dir = Path(opensr_model.__file__).parent / "configs"
                cfg_path = cfg_dir / self.opensr_config_name
                if not cfg_path.is_file():
                    raise FileNotFoundError(f"Config not found at {cfg_path}")
                diff_config = OmegaConf.load(str(cfg_path))
                logger.info("Instantiating opensr-model SRLatentDiffusion on %s...", self.device)
                self._model_diffusion_instance = opensr_model.SRLatentDiffusion(
                    diff_config, device=self.device
                )
                self._model_diffusion_instance.load_pretrained(self.opensr_ckpt)
                self._model_diffusion_instance.eval()
                logger.info("Loaded opensr-model SRLatentDiffusion successfully from '%s'.", self.opensr_ckpt)
            except Exception as exc:
                raise ModelLoadingError(
                    f"Failed to load opensr-model from '{self.opensr_ckpt}': {exc}"
                ) from exc
        return self._model_diffusion_instance

    def _extract_rgbn_able(self, tensor_10b: torch.Tensor) -> torch.Tensor:
        """Extract [B02, B03, B04, B08] (RGBN) for Sen2SR-RRDB."""
        b02 = tensor_10b[:, 0:1]
        b03 = tensor_10b[:, 1:2]
        b04 = tensor_10b[:, 2:3]
        b08 = tensor_10b[:, 6:7]
        return torch.cat([b02, b03, b04, b08], dim=1)

    def _extract_rgbn_diffusion(self, tensor_10b: torch.Tensor) -> torch.Tensor:
        """Extract [B04, B03, B02, B08] (Red, Green, Blue, NIR) for opensr-model LDSR-S2."""
        b04 = tensor_10b[:, 2:3]
        b03 = tensor_10b[:, 1:2]
        b02 = tensor_10b[:, 0:1]
        b08 = tensor_10b[:, 6:7]
        return torch.cat([b04, b03, b02, b08], dim=1)

    def _extract_rgbn(self, tensor_10b: torch.Tensor) -> torch.Tensor:
        """Default RGBN extraction for Sen2SRModel."""
        return self._extract_rgbn_able(tensor_10b)

    def _run_able_path(self, lr_gpu: torch.Tensor, run_tta: bool, aoi_name: str) -> torch.Tensor:
        """Execute Path A using Sen2SR-RRDB."""
        lr_rgbn = self._extract_rgbn_able(lr_gpu)
        logger.info("[%s] Running Sen2SR-RRDB inference (TTA=%s)...", aoi_name, run_tta)
        try:
            with torch.no_grad():
                if run_tta:
                    preds = []
                    p0 = self.model_able(lr_rgbn)
                    preds.append(p0)
                    p_h = self.model_able(torch.flip(lr_rgbn, dims=[-1]))
                    preds.append(torch.flip(p_h, dims=[-1]))
                    p_v = self.model_able(torch.flip(lr_rgbn, dims=[-2]))
                    preds.append(torch.flip(p_v, dims=[-2]))
                    p_hv = self.model_able(torch.flip(lr_rgbn, dims=[-2, -1]))
                    preds.append(torch.flip(p_hv, dims=[-2, -1]))
                    sr_able = torch.stack(preds, dim=0).mean(dim=0)
                else:
                    sr_able = self.model_able(lr_rgbn)
        except RuntimeError as exc:
            if "out of memory" in str(exc).lower():
                logger.warning("[%s] CUDA OOM in Sen2SR-RRDB — retrying on CPU", aoi_name)
                torch.cuda.empty_cache()
                with torch.no_grad():
                    sr_able = self.model_able.to("cpu")(lr_rgbn.cpu()).to(self.device)
                self.model_able.to(self.device)
            else:
                raise InferenceError(f"[{aoi_name}] Sen2SR-RRDB failed: {exc}") from exc

        if torch.isnan(sr_able).any() or torch.isinf(sr_able).any():
            raise InferenceError(f"[{aoi_name}] Sen2SR-RRDB produced NaN or Inf values.")
        return sr_able

    def _run_diffusion_path(self, lr_gpu: torch.Tensor, run_tta: bool, aoi_name: str) -> torch.Tensor:
        """Execute Path A using opensr-model Latent Diffusion."""
        ldsr = self.get_diffusion_model()
        lr_rgbn = self._extract_rgbn_diffusion(lr_gpu)
        logger.info(
            "[%s] Running Latent Diffusion (LDSR-S2) inference (%d steps, TTA=%s)...",
            aoi_name,
            self.sampling_steps,
            run_tta,
        )
        try:
            with torch.no_grad():
                if run_tta:
                    preds = []
                    p0 = ldsr.forward(lr_rgbn, sampling_steps=self.sampling_steps)
                    preds.append(p0)
                    p_h = ldsr.forward(torch.flip(lr_rgbn, dims=[-1]), sampling_steps=self.sampling_steps)
                    preds.append(torch.flip(p_h, dims=[-1]))
                    p_v = ldsr.forward(torch.flip(lr_rgbn, dims=[-2]), sampling_steps=self.sampling_steps)
                    preds.append(torch.flip(p_v, dims=[-2]))
                    p_hv = ldsr.forward(torch.flip(lr_rgbn, dims=[-2, -1]), sampling_steps=self.sampling_steps)
                    preds.append(torch.flip(p_hv, dims=[-2, -1]))
                    sr_diff = torch.stack(preds, dim=0).mean(dim=0)
                else:
                    sr_diff = ldsr.forward(lr_rgbn, sampling_steps=self.sampling_steps)
        except RuntimeError as exc:
            if "out of memory" in str(exc).lower():
                logger.warning("[%s] CUDA OOM in LDSR-S2 diffusion", aoi_name)
                torch.cuda.empty_cache()
                raise InferenceError(f"[{aoi_name}] CUDA OOM in Latent Diffusion: {exc}") from exc
            else:
                raise InferenceError(f"[{aoi_name}] Latent Diffusion execution failed: {exc}") from exc

        if torch.isnan(sr_diff).any() or torch.isinf(sr_diff).any():
            raise InferenceError(f"[{aoi_name}] Latent Diffusion produced NaN or Inf values.")
        return sr_diff

    def _fuse_and_constrain(
        self,
        lr_gpu: torch.Tensor,
        sr_sen2sr: torch.Tensor,
        sr_rgbn: torch.Tensor,
        channel_order: str,
        scale_factor: int,
        aoi_name: str,
    ) -> torch.Tensor:
        """Fuse 4-band RGBN with 10-band SEN2SRLite and apply Fourier HardConstraint."""
        sr_fused = sr_sen2sr.clone()
        if channel_order == "able":
            # Able channels: 0:B02, 1:B03, 2:B04, 3:B08
            sr_fused[:, 0:1] = sr_rgbn[:, 0:1]  # B02 (Blue)
            sr_fused[:, 1:2] = sr_rgbn[:, 1:2]  # B03 (Green)
            sr_fused[:, 2:3] = sr_rgbn[:, 2:3]  # B04 (Red)
            sr_fused[:, 6:7] = sr_rgbn[:, 3:4]  # B08 (NIR)
        else:
            # Diffusion channels: 0:B04, 1:B03, 2:B02, 3:B08
            sr_fused[:, 0:1] = sr_rgbn[:, 2:3]  # B02 (Blue)
            sr_fused[:, 1:2] = sr_rgbn[:, 1:2]  # B03 (Green)
            sr_fused[:, 2:3] = sr_rgbn[:, 0:1]  # B04 (Red)
            sr_fused[:, 6:7] = sr_rgbn[:, 3:4]  # B08 (NIR)

        sr_fused = torch.clamp(sr_fused, min=0.0, max=1.0)

        if self.enable_hard_constraint:
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

        if scale_factor == 8:
            import torch.nn.functional as F
            target_h = sr_final.shape[-2] * 4
            target_w = sr_final.shape[-1] * 4
            sr_final_upscaled = F.interpolate(
                sr_final,
                size=(target_h, target_w),
                mode="bicubic",
                align_corners=False,
            ).clamp(0.0, 1.0)
            blurred = F.avg_pool2d(sr_final_upscaled, kernel_size=3, stride=1, padding=1)
            sr_final = (sr_final_upscaled + 0.25 * (sr_final_upscaled - blurred)).clamp(0.0, 1.0)

        return sr_final

    def run_inference(
        self,
        lr_10b: torch.Tensor,
        aoi_name: str = "custom_aoi",
        use_tta: Optional[bool] = None,
        scale_factor: int = 4,
        model_mode: str = "able",
    ) -> InferenceOutput:
        """Execute dual-path SR, multimodal fusion, and frequency filtering.

        Args:
            lr_10b: Normalized low-resolution input tensor of shape (1, 10, H, W).
            aoi_name: Identifier for structured logging.
            use_tta: Optional override for Test-Time Augmentation ensembling.
            scale_factor: 4 (2.5m) or 8 (0.625m).
            model_mode: 'able' (Sen2SR-RRDB), 'diffusion' (LDSR-S2), or 'both' (dual execution).

        Returns:
            InferenceOutput: Dictionary containing super-resolved rasters.
        """
        if lr_10b.ndim != 4 or lr_10b.shape[1] != 10:
            raise ValueError(
                f"[{aoi_name}] Input must be a 4D tensor with 10 channels, got shape {lr_10b.shape}"
            )

        lr_gpu = lr_10b.to(self.device)
        run_tta = self.use_tta if use_tta is None else use_tta
        logger.info(
            "[%s] Starting SR inference on shape %s (model_mode=%s, TTA=%s, scale=%dx)...",
            aoi_name,
            tuple(lr_gpu.shape),
            model_mode,
            run_tta,
            scale_factor,
        )

        # -------------------------------------------------------------
        # Path B: SEN2SRLite 10-Band SR (Shared Base)
        # -------------------------------------------------------------
        try:
            with torch.no_grad():
                if self.referencex4_pipeline is not None:
                    sr_sen2sr = self.referencex4_pipeline(lr_gpu)
                else:
                    sr_sen2sr = self.model_sen2sr(lr_gpu)
        except RuntimeError as exc:
            if "out of memory" in str(exc).lower():
                logger.warning("[%s] CUDA OOM in SEN2SRLite — retrying on CPU", aoi_name)
                torch.cuda.empty_cache()
                with torch.no_grad():
                    sr_sen2sr = self.model_sen2sr.cpu()(lr_gpu.cpu())
                sr_sen2sr = sr_sen2sr.to(self.device)
            else:
                raise InferenceError(f"[{aoi_name}] SEN2SRLite failed: {exc}") from exc

        if self.device.type != "cpu":
            torch.cuda.empty_cache()

        sr_able = None
        sr_diff = None
        sr_final_able = None
        sr_final_diff = None

        # -------------------------------------------------------------
        # Path A Executions based on model_mode
        # -------------------------------------------------------------
        if model_mode in ("able", "both"):
            sr_able = self._run_able_path(lr_gpu, run_tta=run_tta, aoi_name=aoi_name)
            sr_final_able = self._fuse_and_constrain(
                lr_gpu=lr_gpu,
                sr_sen2sr=sr_sen2sr,
                sr_rgbn=sr_able,
                channel_order="able",
                scale_factor=scale_factor,
                aoi_name=aoi_name,
            )
            if self.device.type != "cpu":
                torch.cuda.empty_cache()

        if model_mode in ("diffusion", "both"):
            sr_diff = self._run_diffusion_path(lr_gpu, run_tta=run_tta, aoi_name=aoi_name)
            sr_final_diff = self._fuse_and_constrain(
                lr_gpu=lr_gpu,
                sr_sen2sr=sr_sen2sr,
                sr_rgbn=sr_diff,
                channel_order="diffusion",
                scale_factor=scale_factor,
                aoi_name=aoi_name,
            )
            if self.device.type != "cpu":
                torch.cuda.empty_cache()

        # Primary output resolution
        if model_mode == "diffusion":
            sr_final = sr_final_diff
            sr_fused = sr_final_diff
        else:
            # 'able' or 'both' defaults to Able as primary
            sr_final = sr_final_able
            sr_fused = sr_final_able

        if sr_final is None or sr_fused is None:
            sr_final = sr_sen2sr
            sr_fused = sr_sen2sr

        logger.info(
            "[%s] SRM inference complete: final shape=%s, min=%.4f, max=%.4f",
            aoi_name,
            tuple(sr_final.shape),
            float(sr_final.min()),
            float(sr_final.max()),
        )

        return {
            "sr_diffusion": sr_diff if sr_diff is not None else sr_able,
            "sr_able": sr_able,
            "sr_final_able": sr_final_able,
            "sr_final_diffusion": sr_final_diff,
            "sr_sen2sr": sr_sen2sr,
            "sr_fused": sr_fused,
            "sr_final": sr_final,
        }
