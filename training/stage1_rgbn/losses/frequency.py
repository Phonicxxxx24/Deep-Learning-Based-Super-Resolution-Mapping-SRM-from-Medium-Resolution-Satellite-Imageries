"""Frequency loss - Laplacian-domain high-frequency supervision."""
import torch, torch.nn as nn, torch.nn.functional as F


class FrequencyLoss(nn.Module):
    """L1 between Laplacian-filtered pred and target. Forces edge/texture reconstruction."""
    def __init__(self):
        super().__init__()
        k = torch.tensor([[0, 1, 0],[1,-4,1],[0, 1, 0]], dtype=torch.float32).view(1,1,3,3)
        self.register_buffer("kernel", k)

    def _lap(self, x):
        B, C, H, W = x.shape
        xf = x.view(B*C, 1, H, W)
        return F.conv2d(xf, self.kernel.to(x.device), padding=1).view(B, C, H, W)

    def forward(self, pred, target, mask=None):
        diff = (self._lap(pred) - self._lap(target)).abs()
        if mask is not None:
            mask = mask.expand_as(diff)
            diff = diff[mask > 0]
        return diff.mean()
