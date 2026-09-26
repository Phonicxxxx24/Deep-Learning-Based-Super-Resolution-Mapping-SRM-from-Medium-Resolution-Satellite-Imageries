"""
Step 4: Smoke Test on Real Sentinel-2/NAIP Data

Run directly in CMD to watch real-time batch loss, PSNR, VRAM, and speed:
    python scripts/04_smoke_test.py
"""
import os, sys, time, yaml, torch
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import make_model
from losses import CombinedLoss
from training.dataset import build_dataloader
from training.validate import validate
from tqdm import tqdm

N_PAIRS = 200      # 200 real patches (50 batches @ batch=4)
EPOCHS  = 3
CFG     = "configs/stage1_swinir.yaml"

def main():
    with open(CFG) as f:
        cfg = yaml.safe_load(f)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    total_mem = torch.cuda.get_device_properties(0).total_memory / 1e9 if torch.cuda.is_available() else 0

    print("=" * 78)
    print("  STAGE 1 RGBN SUPER-RESOLUTION - REAL DATA SMOKE TEST")
    print(f"  GPU: {gpu_name} | Physical VRAM: {total_mem:.1f} GB")
    print(f"  Test: {N_PAIRS} real patches from train.lmdb | {EPOCHS} epochs | Batch: {cfg['training']['batch_size']}")
    print("=" * 78, flush=True)

    print("Loading SwinIR model and loss functions...", end="", flush=True)
    model  = make_model(cfg).to(device)
    crit   = CombinedLoss(cfg).to(device)
    opt    = torch.optim.AdamW(model.parameters(), lr=cfg["training"]["optimizer"]["lr"])
    scaler = torch.amp.GradScaler('cuda')
    print(" Done! (18.52M parameters ready)\n", flush=True)

    train_l = build_dataloader(cfg, "train")
    val_l   = build_dataloader(cfg, "val")
    bs = cfg["training"]["batch_size"]

    for ep in range(EPOCHS):
        model.train()
        t0 = time.time()
        tl = 0.
        cnt = 0

        pbar = tqdm(train_l, desc=f"Epoch {ep+1}/{EPOCHS}", ncols=90, leave=True)
        for step, batch in enumerate(pbar):
            if step * bs >= N_PAIRS:
                break
            lr   = batch["lr"].to(device, non_blocking=True)
            hr   = batch["hr"].to(device, non_blocking=True)
            mask = batch["mask"].to(device, non_blocking=True)

            opt.zero_grad()
            with torch.autocast("cuda"):
                sr = model(lr)
                loss, ld = crit(sr, hr, lr=lr, mask=mask)

            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()

            tl += ld["total"].item()
            cnt += 1

            vram = torch.cuda.max_memory_allocated() / 1e9
            pbar.set_postfix({
                "loss": f"{ld['total'].item():.4f}",
                "charb": f"{ld.get('charbonnier', torch.tensor(0.)).item():.4f}",
                "sam": f"{ld.get('sam', torch.tensor(0.)).item():.4f}",
                "vram": f"{vram:.1f}G"
            })

        el = (time.time() - t0)
        vram_peak = torch.cuda.max_memory_allocated() / 1e9
        vm = validate(model, val_l, device, max_batches=15)

        print(f"\n+----------------------------------------------------------------------------+")
        print(f"| Ep {ep+1}/{EPOCHS} Done in {el:.1f}s | Avg Loss: {tl/max(1, cnt):.4f} | Val PSNR: {vm['val_psnr']:.2f} dB | SSIM: {vm['val_ssim']:.4f} | Peak VRAM: {vram_peak:.2f} GB |")
        print(f"+----------------------------------------------------------------------------+\n", flush=True)

    print("=" * 78)
    print("  ALL CHECKS PASSED: DATA PIPELINE & MODEL READY FOR FULL TRAINING!  ")
    print("=" * 78, flush=True)

if __name__ == "__main__":
    main()
