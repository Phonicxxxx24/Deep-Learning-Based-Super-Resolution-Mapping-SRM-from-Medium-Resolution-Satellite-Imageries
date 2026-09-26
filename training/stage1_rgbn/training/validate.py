"""Validation loop called once per epoch from train.py."""
import torch
from tqdm import tqdm
from evaluation.metrics import compute_psnr, compute_ssim, compute_sam

@torch.no_grad()
def validate(model, loader, device, amp_enabled=True, max_batches=None):
    model.eval()
    psnr_l, ssim_l, sam_l = [], [], []
    for i, batch in enumerate(tqdm(loader, desc="  val", leave=False, ncols=80)):
        if max_batches and i >= max_batches:
            break
        lr   = batch["lr"].to(device, non_blocking=True)
        hr   = batch["hr"].to(device, non_blocking=True)
        mask = batch["mask"].to(device, non_blocking=True)
        with torch.autocast("cuda", enabled=amp_enabled):
            sr = model(lr).clamp(0., 1.)
        psnr_l.append(compute_psnr(sr, hr, mask).item())
        ssim_l.append(compute_ssim(sr, hr).item())
        sam_l.append(compute_sam(sr, hr).item())
    model.train()
    return {
        "val_psnr": sum(psnr_l)/max(1, len(psnr_l)),
        "val_ssim": sum(ssim_l)/max(1, len(ssim_l)),
        "val_sam":  sum(sam_l)/max(1, len(sam_l))
    }
