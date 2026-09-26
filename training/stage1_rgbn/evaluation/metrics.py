"""Core evaluation metrics: PSNR, SSIM, SAM, RMSE, ERGAS."""
import torch, torch.nn.functional as F, math


def compute_psnr(pred, target, mask=None, max_val=1.0):
    diff = (pred - target) ** 2
    mse  = diff[mask.expand_as(diff) > 0].mean() if mask is not None else diff.mean()
    return torch.tensor(float("inf")) if mse == 0 else 10. * torch.log10(torch.tensor(max_val**2) / mse)


def compute_ssim(pred, target, win=11, max_val=1.0):
    C1, C2 = (0.01*max_val)**2, (0.03*max_val)**2
    B, C, H, W = pred.shape
    p, t = pred.float(), target.float()
    coords = torch.arange(win, dtype=torch.float32, device=pred.device) - win//2
    g = torch.exp(-(coords**2)/(2*1.5**2)); g /= g.sum()
    k = (g.unsqueeze(0)*g.unsqueeze(1)).unsqueeze(0).unsqueeze(0).expand(C,1,win,win)
    pad = win//2
    mu1 = F.conv2d(p, k, padding=pad, groups=C); mu2 = F.conv2d(t, k, padding=pad, groups=C)
    m1sq, m2sq, m12 = mu1**2, mu2**2, mu1*mu2
    s1  = F.conv2d(p**2,   k, padding=pad, groups=C) - m1sq
    s2  = F.conv2d(t**2,   k, padding=pad, groups=C) - m2sq
    s12 = F.conv2d(p*t,    k, padding=pad, groups=C) - m12
    ssim_map = ((2*m12+C1)*(2*s12+C2)) / ((m1sq+m2sq+C1)*(s1+s2+C2))
    return ssim_map.mean()


def compute_sam(pred, target, eps=1e-8):
    B, C, H, W = pred.shape
    p, t = pred.view(B,C,-1), target.view(B,C,-1)
    cos = ((p*t).sum(1) / (p.norm(dim=1).clamp(eps) * t.norm(dim=1).clamp(eps))).clamp(-1+eps, 1-eps)
    return torch.acos(cos).mean()


def compute_rmse(pred, target, mask=None):
    diff = (pred - target)**2
    mse  = diff[mask.expand_as(diff)>0].mean() if mask is not None else diff.mean()
    return torch.sqrt(mse)


def compute_ergas(pred, target, scale=4, eps=1e-8):
    B, C = pred.shape[:2]
    e = sum((compute_rmse(pred[:,c:c+1], target[:,c:c+1]) /
             target[:,c].mean().clamp(eps))**2 for c in range(C))
    return (100./scale) * torch.sqrt(e / C)
