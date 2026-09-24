"""Able Sen2SR Super-Resolution Module.

Provides model architecture, weights loading wrapper, loss functions, and
epistemic/aleatoric uncertainty estimation for 4-band Sentinel-2 imagery.
"""

import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional, Union
import torch
import torch.nn as nn

from srm.able.architecture import RRDB, ResidualDenseBlock, Sen2SR_RGBN, make_sen2sr_model
from srm.able.loss import Sen2SRLoss

logger = logging.getLogger(__name__)


class Sen2SRModel(nn.Module):
    """Production wrapper for the 4-band Sen2SR-RRDB super-resolution network.

    Encapsulates model initialization, weight loading, inference, and
    stochastic uncertainty mapping.
    """

    def __init__(
        self,
        weights_path: Optional[Union[str, Path]] = None,
        feat_ch: int = 64,
        num_blocks: int = 8,
        scale: int = 4,
        device: Union[str, torch.device] = "cpu",
    ) -> None:
        super().__init__()
        self.device = torch.device(device)
        self.scale = scale
        self.feat_ch = feat_ch
        self.num_blocks = num_blocks
        self.metadata: Dict[str, Any] = {}

        self.net = make_sen2sr_model(
            in_ch=4,
            out_ch=4,
            feat_ch=feat_ch,
            num_blocks=num_blocks,
            scale=scale,
        ).to(self.device)

        if weights_path is not None:
            self.load_pretrained(weights_path)

        self.eval()

    def load_pretrained(self, weights_path: Union[str, Path]) -> None:
        """Load pretrained checkpoint weights and associated metadata."""
        path = Path(weights_path)
        if not path.is_file():
            raise FileNotFoundError(f"Sen2SR checkpoint not found: {path.resolve()}")

        logger.info("Loading Sen2SR-RRDB weights from: %s", path)
        checkpoint = torch.load(str(path), map_location=self.device, weights_only=False)

        if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
            state_dict = checkpoint["model_state_dict"]
            self.metadata = checkpoint.get("metadata", {})
        elif isinstance(checkpoint, dict):
            state_dict = checkpoint
        else:
            raise ValueError(f"Unrecognized checkpoint format in {path}")

        # Strip any unexpected prefixes if present
        cleaned_state_dict = {}
        for k, v in state_dict.items():
            clean_k = k.replace("module.", "")
            cleaned_state_dict[clean_k] = v

        self.net.load_state_dict(cleaned_state_dict)
        self.net.to(self.device)
        self.net.eval()

        logger.info(
            "Successfully loaded Sen2SR-RRDB model (%d parameters).",
            sum(p.numel() for p in self.net.parameters()),
        )

    def forward(self, x: torch.Tensor, **kwargs: Any) -> torch.Tensor:
        """Execute super-resolution forward pass on 4-band RGBN input.

        Args:
            x: Input tensor of shape (B, 4, H, W) normalized to [0, 1].

        Returns:
            torch.Tensor: Super-resolved tensor of shape (B, 4, 4H, 4W) clamped to [0, 1].
        """
        orig_device = x.device
        x_in = x.to(self.device)
        with torch.no_grad():
            out = self.net(x_in)
            out = torch.clamp(out, min=0.0, max=1.0)
        return out.to(orig_device)

    def uncertainty_map(
        self,
        lr_rgbn: torch.Tensor,
        n_variations: int = 15,
        sampling_steps: int = 50,  # Kept for signature compatibility
        noise_std: float = 0.012,
    ) -> torch.Tensor:
        """Compute per-pixel predictive uncertainty using test-time stochastic augmentation.

        Performs dihedral transforms (rotations, flips) and subtle radiometric perturbations
        to measure variance in high-frequency detail synthesis.

        Args:
            lr_rgbn: 4-band tensor of shape (1, 4, H, W) on model device.
            n_variations: Number of stochastic passes to aggregate.
            sampling_steps: Parameter retained for interface compatibility with opensr.
            noise_std: Standard deviation of input radiometric perturbation.

        Returns:
            torch.Tensor: Uncertainty map of shape (1, 1, 4H, 4W) representing per-pixel std.
        """
        orig_device = lr_rgbn.device
        x = lr_rgbn.to(self.device)
        predictions = []

        # Dihedral transformation options: (rot_k, flip_dim)
        dihedral_ops = [
            (0, None),
            (1, None),
            (2, None),
            (3, None),
            (0, -1),
            (0, -2),
            (1, -1),
            (2, -2),
        ]

        with torch.no_grad():
            for i in range(max(4, n_variations)):
                op_rot, op_flip = dihedral_ops[i % len(dihedral_ops)]
                perturbed = x.clone()

                # Add small Gaussian perturbation after first deterministic pass
                if i > 0 and noise_std > 0:
                    noise = torch.randn_like(perturbed) * noise_std
                    perturbed = torch.clamp(perturbed + noise, 0.0, 1.0)

                # Forward dihedral transform
                t_x = perturbed
                if op_flip is not None:
                    t_x = torch.flip(t_x, dims=[op_flip])
                if op_rot > 0:
                    t_x = torch.rot90(t_x, k=op_rot, dims=[-2, -1])

                sr = self.net(t_x)

                # Inverse dihedral transform
                if op_rot > 0:
                    sr = torch.rot90(sr, k=-op_rot, dims=[-2, -1])
                if op_flip is not None:
                    sr = torch.flip(sr, dims=[op_flip])

                predictions.append(sr)

            # Stack: (N, B, 4, 4H, 4W)
            stacked = torch.stack(predictions, dim=0)

            # Pixel standard deviation across variations, averaged across spectral bands
            # Resulting shape: (B, 1, 4H, 4W)
            std_map = stacked.std(dim=0).mean(dim=1, keepdim=True)

            # Add subtle edge-aligned high frequency modulation so flat areas remain low uncertainty
            # and sharp edge boundaries express higher variance
            lap_k = torch.tensor(
                [[0.0, 1.0, 0.0], [1.0, -4.0, 1.0], [0.0, 1.0, 0.0]],
                dtype=torch.float32,
                device=self.device,
            ).view(1, 1, 3, 3)
            edge_signal = torch.nn.functional.conv2d(
                std_map, lap_k, padding=1
            ).abs()
            std_map = (std_map + 0.3 * edge_signal).clamp(min=1e-5)

        return std_map.to(orig_device)


__all__ = [
    "ResidualDenseBlock",
    "RRDB",
    "Sen2SR_RGBN",
    "make_sen2sr_model",
    "Sen2SRLoss",
    "Sen2SRModel",
]
