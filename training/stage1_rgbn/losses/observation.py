"""Observation consistency loss - physical anti-hallucination constraint."""
import torch, torch.nn as nn, torch.nn.functional as F


class ObservationLoss(nn.Module):
    """L1( AvgPool_scale(SR), LR ) — SR must be consistent with the LR observation."""
    def __init__(self, scale=4):
        super().__init__()
        self.scale = scale

    def forward(self, sr, lr):
        sr_degraded = F.avg_pool2d(sr, kernel_size=self.scale, stride=self.scale)
        return F.l1_loss(sr_degraded, lr)
