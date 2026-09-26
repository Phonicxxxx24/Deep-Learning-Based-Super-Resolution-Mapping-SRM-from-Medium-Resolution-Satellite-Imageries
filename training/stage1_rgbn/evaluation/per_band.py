"""Per-band PSNR/SSIM/RMSE evaluation."""
import torch, pandas as pd
from evaluation.metrics import compute_psnr, compute_ssim, compute_rmse

BANDS = ["B02 (Blue)", "B03 (Green)", "B04 (Red)", "B08 (NIR)"]

@torch.no_grad()
def evaluate_per_band(model, loader, device, amp=True):
    model.eval()
    acc = {b: {"psnr":[], "ssim":[], "rmse":[]} for b in BANDS}
    for batch in loader:
        lr, hr, mask = batch["lr"].to(device), batch["hr"].to(device), batch["mask"].to(device)
        with torch.autocast("cuda", enabled=amp):
            sr = model(lr).clamp(0.,1.)
        for i, b in enumerate(BANDS):
            p, t, m = sr[:,i:i+1], hr[:,i:i+1], mask
            acc[b]["psnr"].append(compute_psnr(p,t,m).item())
            acc[b]["ssim"].append(compute_ssim(p,t).item())
            acc[b]["rmse"].append(compute_rmse(p,t,m).item())
    rows = [{"band":b, **{k: sum(v)/len(v) for k,v in acc[b].items()}} for b in BANDS]
    return pd.DataFrame(rows).set_index("band")
