"""
Step 6: Full evaluation on held-out test set.
Generates metrics.csv, per_band_metrics.csv, ndvi_metrics.csv, visual panels.
"""
import os, sys, yaml, torch
import pandas as pd
import torch.nn.functional as F
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models              import make_model
from training.dataset    import build_dataloader
from evaluation.metrics  import compute_psnr, compute_ssim, compute_sam, compute_rmse, compute_ergas
from evaluation.per_band import evaluate_per_band
from evaluation.ndvi     import evaluate_ndvi

CKPT="checkpoints/best_psnr.pth"; CFG="configs/stage1_swinir.yaml"


@torch.no_grad()
def overall(model, loader, device):
    model.eval(); m_our={"psnr":[],"ssim":[],"sam":[],"rmse":[],"ergas":[]}; m_bic=dict(**m_our)
    for batch in loader:
        lr,hr,mask = batch["lr"].to(device),batch["hr"].to(device),batch["mask"].to(device)
        with torch.autocast("cuda"): sr = model(lr).clamp(0.,1.)
        bic = F.interpolate(lr, scale_factor=4, mode="bicubic", align_corners=False).clamp(0.,1.)
        for md, pr in [(m_our,sr),(m_bic,bic)]:
            md["psnr"].append(compute_psnr(pr,hr,mask).item())
            md["ssim"].append(compute_ssim(pr,hr).item())
            md["sam"].append(compute_sam(pr,hr).item())
            md["rmse"].append(compute_rmse(pr,hr,mask).item())
            md["ergas"].append(compute_ergas(pr,hr,4).item())
    avg = lambda d: {k:sum(v)/len(v) for k,v in d.items()}
    return avg(m_our), avg(m_bic)


def save_visual(lr, hr, sr, path):
    bic = F.interpolate(lr, scale_factor=4, mode="bicubic", align_corners=False).clamp(0,1)
    err = (sr-hr).abs()
    def rgb(t):
        return t[0,[1,0,2]].permute(1,2,0).cpu().numpy().clip(0,1)
    panels = [("LR (up)",rgb(F.interpolate(lr[:1],scale_factor=4,mode="bicubic",align_corners=False))),
              ("Bicubic",rgb(bic[:1])), ("HR Ref",rgb(hr[:1])), ("Our SR",rgb(sr[:1])),
              ("Abs Err",err[0,:3].mean(0).cpu().numpy())]
    fig,axes = plt.subplots(1,5,figsize=(20,4))
    for ax,(title,img) in zip(axes,panels):
        ax.imshow(img, cmap="hot" if img.ndim==2 else None); ax.set_title(title); ax.axis("off")
    plt.tight_layout(); plt.savefig(path,dpi=150,bbox_inches="tight"); plt.close()


def main():
    with open(CFG) as f: cfg=yaml.safe_load(f)
    device = torch.device("cuda"); model = make_model(cfg).to(device)
    ckpt   = torch.load(CKPT, map_location="cpu")
    sd     = {k.replace("_orig_mod.",""):v for k,v in ckpt["model_state_dict"].items()}
    model.load_state_dict(sd); model.eval(); print(f"Loaded {CKPT}")
    loader = build_dataloader(cfg, "test")

    our_m, bic_m = overall(model, loader, device)
    df = pd.DataFrame([{"method":"Bicubic x4",**bic_m},{"method":"Our SR",**our_m}]).set_index("method")
    print(df.round(4).to_string()); df.to_csv("results/metrics.csv")

    df_b = evaluate_per_band(model, loader, device)
    print(df_b.round(4).to_string()); df_b.to_csv("results/per_band_metrics.csv")

    nv = evaluate_ndvi(model, loader, device)
    print(nv); pd.DataFrame([nv]).to_csv("results/ndvi_metrics.csv",index=False)

    os.makedirs("results/visual_examples",exist_ok=True)
    for i,batch in enumerate(loader):
        if i>=5: break
        lr,hr = batch["lr"].to(device),batch["hr"].to(device)
        with torch.autocast("cuda"): sr=model(lr).clamp(0.,1.)
        save_visual(lr, hr, sr, f"results/visual_examples/sample_{i:03d}.png")
    print("Evaluation complete.")

if __name__ == "__main__":
    main()
