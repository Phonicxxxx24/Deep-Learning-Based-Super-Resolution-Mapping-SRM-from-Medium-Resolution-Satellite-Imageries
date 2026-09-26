"""
Step 5: Ablation experiments D and E (10k pairs, 20 epochs each).
Exp D: all 4 losses (no Fourier)
Exp E: all 4 losses + Fourier HardConstraint
"""
import os, sys, yaml, csv, torch
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import make_model; from losses import CombinedLoss
from training.dataset import build_dataloader; from training.validate import validate
from tqdm import tqdm

CFG="configs/stage1_swinir.yaml"; EP=20; N=10000


def run(name, fourier):
    with open(CFG) as f: cfg = yaml.safe_load(f)
    cfg["training"]["epochs"] = EP
    cfg["loss"]["fourier_constraint"]["enabled"] = fourier
    device = torch.device("cuda")
    model = make_model(cfg).to(device)
    crit  = CombinedLoss(cfg).to(device)
    opt   = torch.optim.AdamW(model.parameters(), lr=cfg["training"]["optimizer"]["lr"])
    scaler= torch.amp.GradScaler('cuda')
    tl    = build_dataloader(cfg,"train"); vl = build_dataloader(cfg,"val")
    bs    = cfg["training"]["batch_size"]
    best  = 0.
    print(f"
=== Ablation {name} (fourier={fourier}) ===")
    for ep in range(EP):
        model.train()
        for step, batch in enumerate(tqdm(tl, desc=f"  Ep {ep+1}", ncols=80)):
            if step*bs >= N: break
            lr,hr,mask = batch["lr"].cuda(),batch["hr"].cuda(),batch["mask"].cuda()
            opt.zero_grad()
            with torch.autocast("cuda"): sr=model(lr); loss,_=crit(sr,hr,lr=lr,mask=mask)
            scaler.scale(loss).backward(); scaler.step(opt); scaler.update()
        m = validate(model, vl, device)
        print(f"  Ep {ep+1}: PSNR={m['val_psnr']:.3f} | SSIM={m['val_ssim']:.4f}")
        if m["val_psnr"] > best:
            best = m["val_psnr"]
            torch.save({"model_state_dict":model.state_dict(),"config":cfg},
                       f"checkpoints/ablation/exp_{name}_best.pth")
    return {"name":name, "fourier":fourier, "best_psnr":best}


def main():
    os.makedirs("checkpoints/ablation", exist_ok=True)
    os.makedirs("results", exist_ok=True)
    results = [run("D", False), run("E", True)]
    winner  = max(results, key=lambda r: r["best_psnr"])
    print("
=== Results ===")
    for r in results:
        flag = " <- WINNER" if r["name"]==winner["name"] else ""
        print(f"  Exp {r['name']}: PSNR={r['best_psnr']:.4f}{flag}")
    with open("results/ablation_table.csv","w",newline="") as f:
        w_ = csv.DictWriter(f, fieldnames=["name","fourier","best_psnr"])
        w_.writeheader(); w_.writerows(results)
    print(f"Winner: Exp {winner['name']} -> use for full training")

if __name__ == "__main__":
    main()
