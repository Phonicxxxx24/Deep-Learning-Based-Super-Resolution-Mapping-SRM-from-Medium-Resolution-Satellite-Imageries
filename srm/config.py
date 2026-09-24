"""Configuration management module for SRM pipeline.

Defines dataclass-based schemas and YAML loader for pipeline settings,
ensuring strict typing, validation, and zero magic numbers.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
import yaml


@dataclass
class AOIConfig:
    """Configuration for a specific Area of Interest (AOI).

    Attributes:
        name: Human-readable identifier for the AOI.
        description: Description of the geographic and surface features.
        lat: Latitude of the center point in decimal degrees (WGS84).
        lon: Longitude of the center point in decimal degrees (WGS84).
        start_date: Start date for STAC search window (YYYY-MM-DD).
        end_date: End date for STAC search window (YYYY-MM-DD).
        edge_size: Square edge length in pixels for the ingested patch.
        collection: STAC collection name (default: 'sentinel-2-l2a').
    """

    name: str
    description: str
    lat: float
    lon: float
    start_date: str
    end_date: str
    edge_size: int = 128
    collection: str = "sentinel-2-l2a"


@dataclass
class ModelsConfig:
    """Model checkpoint and directory configuration.

    Attributes:
        sen2sr_model_dir: Local path to the SEN2SRLite model directory.
        sen2sr_hf_url: Remote HuggingFace MLM url for SEN2SRLite.
        able_weights_path: Path to the custom Sen2SR-RRDB checkpoint file.
        able_feat_ch: Feature channels for Sen2SR-RRDB (default: 64).
        able_num_blocks: Number of RRDB blocks for Sen2SR-RRDB (default: 8).
        opensr_ckpt_path: Retained for backward compatibility.
        opensr_config_name: Retained for backward compatibility.
        sampling_steps: Sampling steps / variations parameter.
        uncertainty_variations: Number of stochastic passes for uncertainty.
    """

    sen2sr_model_dir: str = "model/SEN2SRLite"
    sen2sr_hf_url: str = (
        "https://huggingface.co/tacofoundation/sen2sr/resolve/main/SEN2SRLite/main/mlm.json"
    )
    able_weights_path: str = "model/Sen2SR_Able/final_weights.pth"
    able_feat_ch: int = 64
    able_num_blocks: int = 8
    opensr_ckpt_path: str = "opensr-ldsrs2_v1_0_0.ckpt"
    opensr_config_name: str = "config_10m.yaml"
    sampling_steps: int = 50
    uncertainty_variations: int = 15


@dataclass
class BandsConfig:
    """Spectral band configuration and index mapping.

    Attributes:
        all_10: List of all 10 Sentinel-2 multispectral bands.
        scl: Name of the Scene Classification Layer band.
        rgbn_diffusion_order: Exact band order required by opensr-model.
    """

    all_10: List[str] = field(
        default_factory=lambda: [
            "B02",
            "B03",
            "B04",
            "B05",
            "B06",
            "B07",
            "B08",
            "B8A",
            "B11",
            "B12",
        ]
    )
    scl: str = "SCL"
    rgbn_diffusion_order: List[str] = field(
        default_factory=lambda: ["B04", "B03", "B02", "B08"]
    )


@dataclass
class PreprocessingConfig:
    """Preprocessing normalization, masking, and padding settings.

    Attributes:
        reflectance_scale: Divisor to convert DN values to [0, 1] reflectance.
        clip_min: Minimum reflectance clip value.
        clip_max: Maximum reflectance clip value.
        patch_multiple: Spatial dimension multiple for network padding.
        cloud_shadow_classes: SCL integer classes identified as cloud/shadow.
    """

    reflectance_scale: float = 10000.0
    clip_min: float = 0.0
    clip_max: float = 1.0
    patch_multiple: int = 128
    cloud_shadow_classes: List[int] = field(
        default_factory=lambda: [3, 8, 9, 10]
    )


@dataclass
class HardConstraintConfig:
    """Fourier frequency constraint settings.

    Attributes:
        enabled: Whether to apply the frequency constraint to SR output.
        filter_type: Filter formulation ('ideal' or 'gaussian').
        cutoff: Frequency cutoff radius in pixels.
    """

    enabled: bool = True
    filter_type: str = "ideal"
    cutoff: int = 64


@dataclass
class OutputConfig:
    """Output directory and export formatting configuration.

    Attributes:
        dir: Destination directory for generated rasters and figures.
        save_geotiff: Whether to export full multispectral GeoTIFFs.
        save_visualizations: Whether to render PNG map figures.
        cog: Whether to format GeoTIFFs as Cloud-Optimized GeoTIFFs.
    """

    dir: str = "outputs"
    save_geotiff: bool = True
    save_visualizations: bool = True
    cog: bool = True


@dataclass
class SRMConfig:
    """Root configuration object containing all subsystem settings.

    Attributes:
        device: PyTorch computing device ('cuda' or 'cpu').
        seed: Random seed for reproducibility.
        log_level: Python logging level string.
        models: Model paths and inference parameters.
        bands: Band naming and channel index definitions.
        preprocessing: Normalization and masking settings.
        hard_constraint: Low-pass constraint settings.
        aois: Dictionary of named AOI configurations.
        output: File writing and artifact export settings.
    """

    device: str = "cuda"
    seed: int = 42
    log_level: str = "INFO"
    patch_size: int = 128
    overlap: int = 32
    use_tta: bool = False
    models: ModelsConfig = field(default_factory=ModelsConfig)
    bands: BandsConfig = field(default_factory=BandsConfig)
    preprocessing: PreprocessingConfig = field(default_factory=PreprocessingConfig)
    hard_constraint: HardConstraintConfig = field(default_factory=HardConstraintConfig)
    aois: Dict[str, AOIConfig] = field(default_factory=dict)
    output: OutputConfig = field(default_factory=OutputConfig)

    @classmethod
    def from_yaml(cls, yaml_path: str | Path) -> "SRMConfig":
        """Load and parse configuration from a YAML file.

        Args:
            yaml_path: Filesystem path to the YAML configuration file.

        Returns:
            SRMConfig: Fully populated and typed configuration instance.

        Raises:
            FileNotFoundError: If the specified configuration file does not exist.
            ValueError: If required keys are missing or improperly typed.
        """
        path = Path(yaml_path)
        if not path.is_file():
            raise FileNotFoundError(f"Configuration file not found: {path.resolve()}")

        with open(path, "r", encoding="utf-8") as f:
            raw_data: Dict[str, Any] = yaml.safe_load(f)

        models_data = raw_data.get("models", {})
        able_data = models_data.get("able_model", {})
        opensr_data = models_data.get("opensr_model", {})
        models_cfg = ModelsConfig(
            sen2sr_model_dir=models_data.get("sen2sr", {}).get(
                "model_dir", "model/SEN2SRLite"
            ),
            sen2sr_hf_url=models_data.get("sen2sr", {}).get("hf_mlm_url", ""),
            able_weights_path=str(
                able_data.get(
                    "weights_path",
                    models_data.get(
                        "able_weights_path", "model/Sen2SR_Able/final_weights.pth"
                    ),
                )
            ),
            able_feat_ch=int(able_data.get("feat_ch", 64)),
            able_num_blocks=int(able_data.get("num_blocks", 8)),
            opensr_ckpt_path=opensr_data.get(
                "ckpt_path", "opensr-ldsrs2_v1_0_0.ckpt"
            ),
            opensr_config_name=opensr_data.get(
                "config_name", "config_10m.yaml"
            ),
            sampling_steps=int(
                able_data.get(
                    "sampling_steps",
                    opensr_data.get(
                        "sampling_steps", raw_data.get("sampling_steps", 50)
                    ),
                )
            ),
            uncertainty_variations=int(
                able_data.get(
                    "uncertainty_variations",
                    opensr_data.get(
                        "uncertainty_variations",
                        raw_data.get("n_uncertainty", 15),
                    ),
                )
            ),
        )

        bands_data = raw_data.get("bands", {})
        bands_cfg = BandsConfig(
            all_10=bands_data.get("all_10", BandsConfig().all_10),
            scl=bands_data.get("scl", "SCL"),
            rgbn_diffusion_order=bands_data.get(
                "rgbn_diffusion_order", BandsConfig().rgbn_diffusion_order
            ),
        )

        prep_data = raw_data.get("preprocessing", {})
        prep_cfg = PreprocessingConfig(
            reflectance_scale=float(prep_data.get("reflectance_scale", 10000.0)),
            clip_min=float(prep_data.get("clip_min", 0.0)),
            clip_max=float(prep_data.get("clip_max", 1.0)),
            patch_multiple=int(prep_data.get("patch_multiple", 128)),
            cloud_shadow_classes=prep_data.get(
                "cloud_shadow_classes", PreprocessingConfig().cloud_shadow_classes
            ),
        )

        hc_data = raw_data.get("hard_constraint", {})
        hc_cfg = HardConstraintConfig(
            enabled=bool(hc_data.get("enabled", True)),
            filter_type=str(hc_data.get("filter_type", "ideal")),
            cutoff=int(hc_data.get("cutoff", 32)),
        )

        out_data = raw_data.get("output", {})
        out_cfg = OutputConfig(
            dir=str(out_data.get("dir", "outputs")),
            save_geotiff=bool(out_data.get("save_geotiff", True)),
            save_visualizations=bool(out_data.get("save_visualizations", True)),
            cog=bool(out_data.get("cog", True)),
        )

        aois_dict: Dict[str, AOIConfig] = {}
        for key, aoi_data in raw_data.get("aois", {}).items():
            aois_dict[key] = AOIConfig(
                name=str(aooi_name := aoi_data.get("name", key)),
                description=str(aoi_data.get("description", "")),
                lat=float(aoi_data["lat"]),
                lon=float(aoi_data["lon"]),
                start_date=str(aoi_data["start_date"]),
                end_date=str(aoi_data["end_date"]),
                edge_size=int(aoi_data.get("edge_size", 128)),
                collection=str(aoi_data.get("collection", "sentinel-2-l2a")),
            )

        return cls(
            device=str(raw_data.get("device", "cuda")),
            seed=int(raw_data.get("seed", 42)),
            log_level=str(raw_data.get("log_level", "INFO")),
            patch_size=int(raw_data.get("patch_size", 128)),
            overlap=int(raw_data.get("overlap", 32)),
            use_tta=bool(raw_data.get("use_tta", False)),
            models=models_cfg,
            bands=bands_cfg,
            preprocessing=prep_cfg,
            hard_constraint=hc_cfg,
            aois=aois_dict,
            output=out_cfg,
        )
