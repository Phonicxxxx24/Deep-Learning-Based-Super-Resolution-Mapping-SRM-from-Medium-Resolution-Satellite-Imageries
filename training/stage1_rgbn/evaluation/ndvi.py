"""NDVI evaluation: proves SR is useful for downstream remote sensing tasks."""
import torch

EPS = 1e-8

def ndvi(img, nir=3, red=2):
    return (img[:,nir] - img[:,red]) / (img[:,nir] + img[:,red] + EPS)

@torch.no_grad()
def evaluate_ndvi(model, loader, device, amp=True):
    model.eval()
    mae_l, rmse_l, corr_l = [], [], []
    for batch in loader:
        lr, hr = batch["lr"].to(device), batch["hr"].to(device)
        with torch.autocast("cuda", enabled=amp):
            sr = model(lr).clamp(0.,1.)
        nhr, nsr = ndvi(hr), ndvi(sr)
        mae_l.append((nsr-nhr).abs().mean().item())
        rmse_l.append(((nsr-nhr)**2).mean().sqrt().item())
        sf, hf = nsr.flatten(), nhr.flatten()
        corr_l.append(torch.corrcoef(torch.stack([sf,hf]))[0,1].item())
    return {"ndvi_mae":  sum(mae_l)/len(mae_l),
            "ndvi_rmse": sum(rmse_l)/len(rmse_l),
            "ndvi_corr": sum(corr_l)/len(corr_l)}
