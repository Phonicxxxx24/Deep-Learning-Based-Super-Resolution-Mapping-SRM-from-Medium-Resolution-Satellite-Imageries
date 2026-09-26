"""Spectral Angle Mapper loss - preserves relative band ratios stably."""
import torch
import torch.nn as nn
import torch.nn.functional as F


class SAMLoss(nn.Module):
    """
    Numerically stable Spectral Angle / Cosine Distance loss.
    Uses (1 - cos(theta)) in float32 for zero-gradient explosion in mixed precision.
    When theta is small, (1 - cos(theta)) ~ theta^2 / 2, smoothly optimizing spectral fidelity.
    """
    def __init__(self, eps=1e-7):
        super().__init__()
        self.eps = eps

    def forward(self, pred, target):
        p = pred.float()
        t = target.float()
        B, C, H, W = p.shape
        p = p.view(B, C, -1)
        t = t.view(B, C, -1)
        dot = (p * t).sum(dim=1)
        norms = p.norm(dim=1).clamp(min=self.eps) * t.norm(dim=1).clamp(min=self.eps)
        cos = (dot / norms).clamp(min=-1.0, max=1.0)
        return (1.0 - cos).mean()
