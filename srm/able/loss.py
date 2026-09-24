"""Edge-Preserving Multi-Band Loss for Sen2SR_RGBN.

Combines L1 pixel fidelity, Spectral Angle Mapper (SAM), Laplacian high-frequency edge loss,
directional spatial gradients, and observation downsampling consistency.
Originated from the Able Project (heavycoding).
"""

from typing import Dict, Optional, Tuple
import torch
import torch.nn as nn
import torch.nn.functional as F


class Sen2SRLoss(nn.Module):
    """Multi-objective loss function enforcing edge sharpness and radiometric fidelity."""

    def __init__(
        self,
        w_l1: float = 1.0,
        w_sam: float = 0.2,
        w_lap: float = 0.4,
        w_grad: float = 0.4,
        w_obs: float = 0.1,
    ) -> None:
        super().__init__()
        self.w_l1 = w_l1
        self.w_sam = w_sam
        self.w_lap = w_lap
        self.w_grad = w_grad
        self.w_obs = w_obs

        # Discrete 3x3 Laplacian high-frequency edge kernel
        k = torch.tensor([[0.0, 1.0, 0.0], [1.0, -4.0, 1.0], [0.0, 1.0, 0.0]], dtype=torch.float32).view(
            1, 1, 3, 3
        )
        self.register_buffer("lap_kernel", k)

    def forward(
        self,
        pred: torch.Tensor,
        target: torch.Tensor,
        lr: Optional[torch.Tensor] = None,
    ) -> Tuple[torch.Tensor, Dict[str, torch.Tensor]]:
        losses: Dict[str, torch.Tensor] = {}

        # 1. L1 Pixel-level Fidelity
        l_l1 = F.l1_loss(pred, target)
        losses["l1"] = l_l1

        # 2. Spectral Angle Mapper (SAM) computed in float32
        p = pred.float()
        t = target.float()
        dot = (p * t).sum(dim=1)
        norms = p.norm(dim=1).clamp(min=1e-7) * t.norm(dim=1).clamp(min=1e-7)
        cos = (dot / norms).clamp(min=-1.0, max=1.0)
        l_sam = (1.0 - cos).mean()
        losses["sam"] = l_sam

        # 3. Laplacian High-Frequency Loss for sharp feature boundaries
        b, c, h, w = pred.shape
        pf = pred.view(b * c, 1, h, w)
        tf = target.view(b * c, 1, h, w)
        k = self.lap_kernel.to(pred.device)
        l_lap = (F.conv2d(pf, k, padding=1) - F.conv2d(tf, k, padding=1)).abs().mean()
        losses["lap"] = l_lap

        # 4. Horizontal and Vertical Directional Gradient Loss
        dx_p = (pred[:, :, :, 1:] - pred[:, :, :, :-1]).abs()
        dx_t = (target[:, :, :, 1:] - target[:, :, :, :-1]).abs()
        dy_p = (pred[:, :, 1:, :] - pred[:, :, :-1, :]).abs()
        dy_t = (target[:, :, 1:, :] - target[:, :, :-1, :]).abs()
        l_grad = (dx_p - dx_t).abs().mean() + (dy_p - dy_t).abs().mean()
        losses["grad"] = l_grad

        # 5. Observation Downsampling Consistency
        if lr is not None:
            sr_down = F.interpolate(pred, size=lr.shape[-2:], mode="area")
            l_obs = F.l1_loss(sr_down, lr)
        else:
            l_obs = torch.tensor(0.0, device=pred.device)
        losses["obs"] = l_obs

        total = (
            self.w_l1 * l_l1
            + self.w_sam * l_sam
            + self.w_lap * l_lap
            + self.w_grad * l_grad
            + self.w_obs * l_obs
        )
        losses["total"] = total
        return total, losses
