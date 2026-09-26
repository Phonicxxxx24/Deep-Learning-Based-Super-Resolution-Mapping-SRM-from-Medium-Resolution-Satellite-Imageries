"""
Edge-Preserving Multi-Band Loss for Sen2SR_RGBN.
Forces sharp edge textures, crisp boundaries, and 100% radiometric band preservation.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F

class Sen2SRLoss(nn.Module):
    def __init__(self, w_l1=1.0, w_sam=0.2, w_lap=0.4, w_grad=0.4, w_obs=0.1):
        super().__init__()
        self.w_l1 = w_l1
        self.w_sam = w_sam
        self.w_lap = w_lap
        self.w_grad = w_grad
        self.w_obs = w_obs

        # Laplacian high-frequency edge kernel
        k = torch.tensor([[0, 1, 0],[1,-4,1],[0, 1, 0]], dtype=torch.float32).view(1,1,3,3)
        self.register_buffer('lap_kernel', k)

    def forward(self, pred, target, lr=None):
        losses = {}

        # 1. L1 Pixel Fidelity
        l_l1 = F.l1_loss(pred, target)
        losses["l1"] = l_l1

        # 2. SAM Spectral Angle Mapper (Computed in FP32 for zero-gradient explosion)
        p = pred.float()
        t = target.float()
        dot = (p * t).sum(dim=1)
        norms = p.norm(dim=1).clamp(min=1e-7) * t.norm(dim=1).clamp(min=1e-7)
        cos = (dot / norms).clamp(min=-1.0, max=1.0)
        l_sam = (1.0 - cos).mean()
        losses["sam"] = l_sam

        # 3. Laplacian High-Frequency Loss (Sharp details)
        B, C, H, W = pred.shape
        pf = pred.view(B*C, 1, H, W)
        tf = target.view(B*C, 1, H, W)
        k = self.lap_kernel.to(pred.device)
        l_lap = (F.conv2d(pf, k, padding=1) - F.conv2d(tf, k, padding=1)).abs().mean()
        losses["lap"] = l_lap

        # 4. Horizontal & Vertical Gradient / Edge Loss
        dx_p = (pred[:, :, :, 1:] - pred[:, :, :, :-1]).abs()
        dx_t = (target[:, :, :, 1:] - target[:, :, :, :-1]).abs()
        dy_p = (pred[:, :, 1:, :] - pred[:, :, :-1, :]).abs()
        dy_t = (target[:, :, 1:, :] - target[:, :, :-1, :]).abs()
        l_grad = (dx_p - dx_t).abs().mean() + (dy_p - dy_t).abs().mean()
        losses["grad"] = l_grad

        # 5. Observation consistency (downscaled SR matches LR)
        l_obs = torch.tensor(0.0, device=pred.device)
        if lr is not None:
            sr_down = F.interpolate(pred, size=lr.shape[-2:], mode="area")
            l_obs = F.l1_loss(sr_down, lr)
        losses["obs"] = l_obs

        total = (self.w_l1 * l_l1 + self.w_sam * l_sam +
                 self.w_lap * l_lap + self.w_grad * l_grad + self.w_obs * l_obs)
        losses["total"] = total
        return total, losses
