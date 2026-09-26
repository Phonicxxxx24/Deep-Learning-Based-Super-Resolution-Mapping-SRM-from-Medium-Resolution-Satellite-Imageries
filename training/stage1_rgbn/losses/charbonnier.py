"""Charbonnier loss - smooth L1 for stable SR training."""
import torch, torch.nn as nn


class CharbonnierLoss(nn.Module):
    """sqrt( (pred-target)^2 + eps^2 ) — applied only at valid mask pixels."""
    def __init__(self, eps=1e-3):
        super().__init__()
        self.eps = eps

    def forward(self, pred, target, mask=None):
        diff = pred - target
        loss = torch.sqrt(diff ** 2 + self.eps ** 2)
        if mask is not None:
            mask = mask.expand_as(loss)
            loss = loss[mask > 0]
        return loss.mean()
