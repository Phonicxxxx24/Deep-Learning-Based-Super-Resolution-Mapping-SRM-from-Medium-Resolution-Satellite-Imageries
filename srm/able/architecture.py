"""Sen2SR-RRDB Architecture for 4-Band Sentinel-2 Super-Resolution.

Residual-in-Residual Dense Block (RRDB) network with PixelShuffle reconstruction,
specialized for Sentinel-2 multispectral RGBN super-resolution (10m -> 2.5m, 4x scale).
Preserves B02 (Blue), B03 (Green), B04 (Red), and B08 (NIR) spectral fidelity.

Architecture originated from the Able Project (heavycoding) and integrated
into the SRM production pipeline.
"""

from typing import Optional
import torch
import torch.nn as nn
import torch.nn.functional as F


class ResidualDenseBlock(nn.Module):
    """Dense connections retain high-frequency edges across deep layers."""

    def __init__(self, ch: int = 64, growth: int = 32) -> None:
        super().__init__()
        self.c1 = nn.Conv2d(ch, growth, 3, padding=1)
        self.c2 = nn.Conv2d(ch + growth, growth, 3, padding=1)
        self.c3 = nn.Conv2d(ch + 2 * growth, growth, 3, padding=1)
        self.c4 = nn.Conv2d(ch + 3 * growth, ch, 3, padding=1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x1 = self.lrelu(self.c1(x))
        x2 = self.lrelu(self.c2(torch.cat([x, x1], dim=1)))
        x3 = self.lrelu(self.c3(torch.cat([x, x1, x2], dim=1)))
        x4 = self.c4(torch.cat([x, x1, x2, x3], dim=1))
        return x + x4 * 0.2


class RRDB(nn.Module):
    """Residual-in-Residual Dense Block — 3 RDBs stacked with residual scaling."""

    def __init__(self, ch: int = 64, growth: int = 32) -> None:
        super().__init__()
        self.rdb1 = ResidualDenseBlock(ch, growth)
        self.rdb2 = ResidualDenseBlock(ch, growth)
        self.rdb3 = ResidualDenseBlock(ch, growth)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x + self.rdb3(self.rdb2(self.rdb1(x))) * 0.2


class Sen2SR_RGBN(nn.Module):
    """4-Band RRDB Super-Resolution Network for Sentinel-2 (RGB + NIR).

    Direct Sub-Pixel Synthesis with two-stage PixelShuffle upsamplers.
    Zero checkerboard artifacts, pure convolutional deep representation.
    """

    def __init__(
        self,
        in_ch: int = 4,
        out_ch: int = 4,
        feat_ch: int = 64,
        num_blocks: int = 8,
        scale: int = 4,
    ) -> None:
        super().__init__()
        self.scale = scale

        # 1. Shallow Feature Extraction Head
        self.head = nn.Conv2d(in_ch, feat_ch, 3, padding=1)

        # 2. Deep RRDB Trunk with Global Residual Connection
        self.body = nn.Sequential(*[RRDB(feat_ch) for _ in range(num_blocks)])
        self.body_conv = nn.Conv2d(feat_ch, feat_ch, 3, padding=1)

        # 3. Two-stage 4x PixelShuffle Upsampler (2x * 2x)
        self.up1 = nn.Sequential(
            nn.Conv2d(feat_ch, feat_ch * 4, 3, padding=1),
            nn.PixelShuffle(2),
            nn.LeakyReLU(0.2, inplace=True),
        )
        self.up2 = nn.Sequential(
            nn.Conv2d(feat_ch, feat_ch * 4, 3, padding=1),
            nn.PixelShuffle(2),
            nn.LeakyReLU(0.2, inplace=True),
        )

        # 4. Reconstruction Tail (Outputs 4-band BOA reflectance)
        self.tail1 = nn.Conv2d(feat_ch, feat_ch, 3, padding=1)
        self.tail_act = nn.LeakyReLU(0.2, inplace=True)
        self.tail2 = nn.Conv2d(feat_ch, out_ch, 3, padding=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feat = self.head(x)
        body_out = self.body_conv(self.body(feat))
        feat = feat + body_out  # global residual bypass
        up = self.up2(self.up1(feat))
        out = self.tail2(self.tail_act(self.tail1(up)))
        return out


def make_sen2sr_model(
    in_ch: int = 4,
    out_ch: int = 4,
    feat_ch: int = 64,
    num_blocks: int = 8,
    scale: int = 4,
) -> Sen2SR_RGBN:
    """Instantiate a Sen2SR_RGBN model with the designated configuration."""
    return Sen2SR_RGBN(
        in_ch=in_ch,
        out_ch=out_ch,
        feat_ch=feat_ch,
        num_blocks=num_blocks,
        scale=scale,
    )
