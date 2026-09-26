"""
Stage 1 RGBN SR - SwinIR-style Transformer (18.5M params).

Input:  (B, 4, 96, 96)  LR RGBN at 10m
Output: (B, 4, 384, 384) SR RGBN at 2.5m

Residual learning: output = model_branch(lr) + bicubic(lr)
"""
import torch
import torch.nn as nn
import torch.nn.functional as F


class DropPath(nn.Module):
    def __init__(self, drop_prob=0.0):
        super().__init__()
        self.drop_prob = drop_prob

    def forward(self, x):
        if self.drop_prob == 0.0 or not self.training:
            return x
        keep = 1 - self.drop_prob
        shape = (x.shape[0],) + (1,) * (x.ndim - 1)
        t = torch.rand(shape, dtype=x.dtype, device=x.device).add_(keep).floor_()
        return x.div_(keep).mul_(t)


def window_partition(x, ws):
    """x: (B,H,W,C) -> (B*nW, ws, ws, C)"""
    B, H, W, C = x.shape
    x = x.view(B, H // ws, ws, W // ws, ws, C)
    return x.permute(0, 1, 3, 2, 4, 5).contiguous().view(-1, ws, ws, C)


def window_reverse(windows, ws, H, W):
    """(B*nW, ws, ws, C) -> (B, H, W, C)"""
    B = int(windows.shape[0] / (H // ws * W // ws))
    x = windows.view(B, H // ws, W // ws, ws, ws, -1)
    return x.permute(0, 1, 3, 2, 4, 5).contiguous().view(B, H, W, -1)


class WindowAttention(nn.Module):
    def __init__(self, dim, window_size, num_heads, qkv_bias=True,
                 attn_drop=0., proj_drop=0.):
        super().__init__()
        self.dim = dim
        self.ws = window_size
        self.num_heads = num_heads
        self.scale = (dim // num_heads) ** -0.5

        self.rpb_table = nn.Parameter(
            torch.zeros((2 * window_size - 1) ** 2, num_heads))
        nn.init.trunc_normal_(self.rpb_table, std=0.02)

        coords = torch.stack(torch.meshgrid(
            torch.arange(window_size), torch.arange(window_size), indexing="ij"))
        coords_flat = torch.flatten(coords, 1)
        rel = coords_flat[:, :, None] - coords_flat[:, None, :]
        rel = rel.permute(1, 2, 0).contiguous()
        rel[:, :, 0] += window_size - 1
        rel[:, :, 1] += window_size - 1
        rel[:, :, 0] *= 2 * window_size - 1
        self.register_buffer("rpb_index", rel.sum(-1))

        self.qkv = nn.Linear(dim, dim * 3, bias=qkv_bias)
        self.attn_drop = nn.Dropout(attn_drop)
        self.proj = nn.Linear(dim, dim)
        self.proj_drop = nn.Dropout(proj_drop)

    def forward(self, x, mask=None):
        B_, N, C = x.shape
        qkv = self.qkv(x).reshape(B_, N, 3, self.num_heads, C // self.num_heads)
        qkv = qkv.permute(2, 0, 3, 1, 4)
        q, k, v = qkv.unbind(0)
        attn = (q * self.scale) @ k.transpose(-2, -1)

        rpb = self.rpb_table[self.rpb_index.view(-1)].view(
            self.ws ** 2, self.ws ** 2, self.num_heads).permute(2, 0, 1).contiguous()
        attn = attn + rpb.unsqueeze(0)

        if mask is not None:
            nW = mask.shape[0]
            attn = attn.view(B_ // nW, nW, self.num_heads, N, N) + mask.unsqueeze(1).unsqueeze(0)
            attn = attn.view(-1, self.num_heads, N, N)

        attn = self.attn_drop(F.softmax(attn, dim=-1))
        x = (attn @ v).transpose(1, 2).reshape(B_, N, C)
        return self.proj_drop(self.proj(x))


class SwinTransformerBlock(nn.Module):
    def __init__(self, dim, num_heads, window_size=8, shift_size=0,
                 mlp_ratio=4., qkv_bias=True, drop=0., attn_drop=0., drop_path=0.):
        super().__init__()
        self.shift_size = shift_size
        self.window_size = window_size
        self.H = self.W = None

        self.norm1 = nn.LayerNorm(dim)
        self.attn = WindowAttention(dim, window_size, num_heads, qkv_bias, attn_drop, drop)
        self.drop_path = DropPath(drop_path) if drop_path > 0 else nn.Identity()
        self.norm2 = nn.LayerNorm(dim)

        hid = int(dim * mlp_ratio)
        self.mlp = nn.Sequential(
            nn.Linear(dim, hid), nn.GELU(), nn.Dropout(drop),
            nn.Linear(hid, dim), nn.Dropout(drop))

    def forward(self, x, attn_mask=None):
        H, W = self.H, self.W
        B, L, C = x.shape
        shortcut = x
        x = self.norm1(x).view(B, H, W, C)

        if self.shift_size > 0:
            x = torch.roll(x, (-self.shift_size, -self.shift_size), (1, 2))

        x_w = window_partition(x, self.window_size).view(-1, self.window_size ** 2, C)
        x_w = self.attn(x_w, mask=attn_mask)
        x_w = x_w.view(-1, self.window_size, self.window_size, C)
        x = window_reverse(x_w, self.window_size, H, W)

        if self.shift_size > 0:
            x = torch.roll(x, (self.shift_size, self.shift_size), (1, 2))

        x = shortcut + self.drop_path(x.view(B, L, C))
        x = x + self.drop_path(self.mlp(self.norm2(x)))
        return x


class RSTB(nn.Module):
    def __init__(self, dim, depth, num_heads, window_size, mlp_ratio=4.,
                 qkv_bias=True, drop=0., attn_drop=0., drop_path=0.):
        super().__init__()
        self.blocks = nn.ModuleList([
            SwinTransformerBlock(
                dim=dim, num_heads=num_heads, window_size=window_size,
                shift_size=0 if i % 2 == 0 else window_size // 2,
                mlp_ratio=mlp_ratio, qkv_bias=qkv_bias, drop=drop,
                attn_drop=attn_drop,
                drop_path=drop_path[i] if isinstance(drop_path, list) else drop_path)
            for i in range(depth)])
        self.conv = nn.Conv2d(dim, dim, 3, 1, 1)
        self.norm = nn.LayerNorm(dim)

    def forward(self, x_seq, x_size, attn_mask=None):
        H, W = x_size
        res = x_seq
        for blk in self.blocks:
            blk.H, blk.W = H, W
            x_seq = blk(x_seq, attn_mask)
        B, L, C = x_seq.shape
        x_sp = self.norm(x_seq).transpose(1, 2).view(B, C, H, W)
        x_sp = self.conv(x_sp)
        return x_sp.flatten(2).transpose(1, 2) + res


class SwinIR_RGBN(nn.Module):
    """18.5M SwinIR-style 4-band RGBN satellite SR model."""

    def __init__(self, in_channels=4, out_channels=4, embed_dim=180,
                 num_groups=6, blocks_per_group=6, num_heads=6,
                 window_size=8, mlp_ratio=4., qkv_bias=True,
                 drop_rate=0., attn_drop_rate=0., drop_path_rate=0.1,
                 scale=4, img_range=1.0):
        super().__init__()
        self.scale = scale
        self.window_size = window_size

        self.conv_first = nn.Conv2d(in_channels, embed_dim, 3, 1, 1)

        total = num_groups * blocks_per_group
        dpr = [x.item() for x in torch.linspace(0, drop_path_rate, total)]

        self.groups = nn.ModuleList([
            RSTB(dim=embed_dim, depth=blocks_per_group, num_heads=num_heads,
                 window_size=window_size, mlp_ratio=mlp_ratio, qkv_bias=qkv_bias,
                 drop=drop_rate, attn_drop=attn_drop_rate,
                 drop_path=dpr[i * blocks_per_group:(i + 1) * blocks_per_group])
            for i in range(num_groups)])

        self.norm = nn.LayerNorm(embed_dim)
        self.conv_after_body = nn.Conv2d(embed_dim, embed_dim, 3, 1, 1)

        self.upsample = nn.Sequential(
            nn.Conv2d(embed_dim, 4 * embed_dim, 3, 1, 1), nn.PixelShuffle(2),
            nn.Conv2d(embed_dim, 4 * embed_dim, 3, 1, 1), nn.PixelShuffle(2))
        self.conv_last = nn.Conv2d(embed_dim, out_channels, 3, 1, 1)
        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.trunc_normal_(m.weight, std=0.02)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
            elif isinstance(m, nn.LayerNorm):
                nn.init.ones_(m.weight); nn.init.zeros_(m.bias)

    def _pad(self, x):
        _, _, H, W = x.shape
        ph = (self.window_size - H % self.window_size) % self.window_size
        pw = (self.window_size - W % self.window_size) % self.window_size
        return F.pad(x, (0, pw, 0, ph), "reflect"), H, W

    def _attn_mask(self, H, W, device):
        img_mask = torch.zeros(1, H, W, 1, device=device)
        slices = (slice(0, -self.window_size),
                  slice(-self.window_size, -(self.window_size // 2)),
                  slice(-(self.window_size // 2), None))
        cnt = 0
        for h in slices:
            for w_ in slices:
                img_mask[:, h, w_, :] = cnt
                cnt += 1
        mw = window_partition(img_mask, self.window_size).view(-1, self.window_size ** 2)
        mask = mw.unsqueeze(1) - mw.unsqueeze(2)
        return mask.masked_fill(mask != 0, -100.).masked_fill(mask == 0, 0.)

    def forward(self, x):
        bicubic = F.interpolate(x, scale_factor=self.scale, mode="bicubic", align_corners=False)
        feat = self.conv_first(x)
        x_pad, H_orig, W_orig = self._pad(feat)
        _, _, H, W = x_pad.shape
        attn_mask = self._attn_mask(H, W, x.device)
        x_seq = x_pad.flatten(2).transpose(1, 2)
        for group in self.groups:
            x_seq = group(x_seq, (H, W), attn_mask)
        x_seq = self.norm(x_seq)
        x_deep = x_seq.transpose(1, 2).view(-1, feat.shape[1], H, W)[:, :, :H_orig, :W_orig]
        body = self.conv_after_body(x_deep) + feat
        return self.conv_last(self.upsample(body)) + bicubic


def make_model(cfg):
    m = cfg.get("model", cfg)
    return SwinIR_RGBN(
        in_channels=m.get("in_channels", 4), out_channels=m.get("out_channels", 4),
        embed_dim=m.get("embed_dim", 180), num_groups=m.get("num_groups", 6),
        blocks_per_group=m.get("blocks_per_group", 6), num_heads=m.get("num_heads", 6),
        window_size=m.get("window_size", 8), mlp_ratio=m.get("mlp_ratio", 4.0),
        qkv_bias=m.get("qkv_bias", True), drop_rate=m.get("drop_rate", 0.0),
        attn_drop_rate=m.get("attn_drop_rate", 0.0),
        drop_path_rate=m.get("drop_path_rate", 0.1),
        scale=m.get("scale", 4), img_range=m.get("img_range", 1.0))


if __name__ == "__main__":
    model = make_model({"model": {}})
    total = sum(p.numel() for p in model.parameters())
    print(f"Parameters: {total/1e6:.2f}M")
    x = torch.randn(1, 4, 96, 96)
    with torch.no_grad():
        y = model(x)
    print(f"Input:  {tuple(x.shape)}")
    print(f"Output: {tuple(y.shape)}  (expected: [1, 4, 384, 384])")
