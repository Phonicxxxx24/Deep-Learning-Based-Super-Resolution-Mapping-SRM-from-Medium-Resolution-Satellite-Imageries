"""
4-Band Sen2SR-RRDB Super-Resolution Architecture (ESRGAN Family).
Direct Sub-Pixel Synthesis (Zero +bicubic shortcut) for crisp satellite reconstruction.
Preserves B02(Blue), B03(Green), B04(Red), B08(NIR) at 4x scale (10m -> 2.5m).
"""
import torch
import torch.nn as nn
import torch.nn.functional as F

class ResidualDenseBlock(nn.Module):
    """Dense connections retain high-frequency edges across deep layers."""
    def __init__(self, ch=64, growth=32):
        super().__init__()
        self.c1 = nn.Conv2d(ch, growth, 3, padding=1)
        self.c2 = nn.Conv2d(ch + growth, growth, 3, padding=1)
        self.c3 = nn.Conv2d(ch + 2 * growth, growth, 3, padding=1)
        self.c4 = nn.Conv2d(ch + 3 * growth, ch, 3, padding=1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.c1(x))
        x2 = self.lrelu(self.c2(torch.cat([x, x1], 1)))
        x3 = self.lrelu(self.c3(torch.cat([x, x1, x2], 1)))
        x4 = self.c4(torch.cat([x, x1, x2, x3], 1))
        return x + x4 * 0.2

class RRDB(nn.Module):
    """Residual-in-Residual Dense Block — 3 RDBs stacked."""
    def __init__(self, ch=64, growth=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(ch, growth)
        self.rdb2 = ResidualDenseBlock(ch, growth)
        self.rdb3 = ResidualDenseBlock(ch, growth)

    def forward(self, x):
        return x + self.rdb3(self.rdb2(self.rdb1(x))) * 0.2

class Sen2SR_RGBN(nn.Module):
    def __init__(self, in_ch=4, out_ch=4, feat_ch=64, num_blocks=8, scale=4):
        super().__init__()
        self.scale = scale
        # 1. Feature Extraction Head
        self.head = nn.Conv2d(in_ch, feat_ch, 3, padding=1)

        # 2. Deep RRDB Body with Global Residual
        self.body = nn.Sequential(*[RRDB(feat_ch) for _ in range(num_blocks)])
        self.body_conv = nn.Conv2d(feat_ch, feat_ch, 3, padding=1)

        # 3. Two-stage 4x PixelShuffle Upsampler (Clean, zero checkerboard)
        self.up1 = nn.Sequential(
            nn.Conv2d(feat_ch, feat_ch * 4, 3, padding=1),
            nn.PixelShuffle(2),
            nn.LeakyReLU(0.2, inplace=True)
        )
        self.up2 = nn.Sequential(
            nn.Conv2d(feat_ch, feat_ch * 4, 3, padding=1),
            nn.PixelShuffle(2),
            nn.LeakyReLU(0.2, inplace=True)
        )

        # 4. Reconstruction Tail (Directly outputs 4-band reflectance)
        self.tail1 = nn.Conv2d(feat_ch, feat_ch, 3, padding=1)
        self.tail_act = nn.LeakyReLU(0.2, inplace=True)
        self.tail2 = nn.Conv2d(feat_ch, out_ch, 3, padding=1)

    def forward(self, x):
        feat = self.head(x)
        body_out = self.body_conv(self.body(feat))
        feat = feat + body_out  # global residual on deep features
        up = self.up2(self.up1(feat))
        out = self.tail2(self.tail_act(self.tail1(up)))
        return out

def make_sen2sr_model(cfg=None):
    num_blocks = 8
    feat_ch = 64
    if cfg and "model" in cfg:
        num_blocks = cfg["model"].get("num_blocks", 8)
        feat_ch = cfg["model"].get("feat_ch", 64)
    return Sen2SR_RGBN(in_ch=4, out_ch=4, feat_ch=feat_ch, num_blocks=num_blocks, scale=4)
