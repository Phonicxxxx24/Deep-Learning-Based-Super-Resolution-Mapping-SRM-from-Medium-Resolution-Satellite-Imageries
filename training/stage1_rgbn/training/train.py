"""
Stage 1 RGBN SR - Main Training Loop (Optimized 10.5-Hour Schedule)

- Total Epochs: 50
- Batches per Epoch: 100 (400 patches/epoch)
- Total Time: ~10.4 Hours (~12.5 min per epoch)
- Validation: Every 12.5 min with real metrics
- Auto-resume from latest.pth
- Live CSV & TensorBoard logging
"""
import os, sys, csv, time, math, argparse, random
import yaml, torch, torch.nn as nn
from torch.utils.tensorboard import SummaryWriter
from tqdm import tqdm

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models            import make_model
from losses            import CombinedLoss
from training.dataset  import build_dataloader
from training.validate import validate


def build_scheduler(optimizer, cfg):
    tc = cfg["training"]
    epochs, warmup = tc["epochs"], tc["scheduler"].get("warmup_epochs", 5)
    min_lr, base_lr = tc["scheduler"].get("min_lr", 1e-6), tc["optimizer"]["lr"]
    def lr_fn(ep):
        if ep < warmup:
            return (ep + 1) / warmup
        t = (ep - warmup) / max(1, epochs - warmup)
        return min_lr/base_lr + 0.5*(1 - min_lr/base_lr)*(1 + math.cos(math.pi*t))
    return torch.optim.lr_scheduler.LambdaLR(optimizer, lr_fn)


def save_ckpt(state, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    torch.save(state, tmp)
    os.replace(tmp, path)


def load_ckpt(path, model, opt=None, sched=None):
    ckpt = torch.load(path, map_location="cpu")
    sd   = {k.replace("_orig_mod.", ""): v for k, v in ckpt["model_state_dict"].items()}
    model.load_state_dict(sd)
    if opt and "optimizer_state_dict" in ckpt:
        opt.load_state_dict(ckpt["optimizer_state_dict"])
    if sched and "scheduler_state_dict" in ckpt:
        sched.load_state_dict(ckpt["scheduler_state_dict"])
    return ckpt.get("epoch", 0), ckpt.get("best_psnr", 0.), ckpt.get("best_ssim", 0.)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/stage1_swinir.yaml")
    parser.add_argument("--resume", default=None)
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    vram_total = torch.cuda.get_device_properties(0).total_memory / 1e9 if torch.cuda.is_available() else 0
    print("=" * 80)
    print("  STAGE 1 RGBN SUPER-RESOLUTION TRAINING (10.5-HR SCHEDULE)")
    print(f"  Device: {device} ({torch.cuda.get_device_name(0)}) | Total VRAM: {vram_total:.1f} GB")
    print("=" * 80)

    tc = cfg["training"]
    ckpt_dir = tc["checkpointing"]["save_dir"]
    batches_per_ep = tc.get("batches_per_epoch", 100)

    model     = make_model(cfg).to(device)
    n_params  = sum(p.numel() for p in model.parameters()) / 1e6
    print(f"  Model: 4-Band SwinIR Residual Transformer ({n_params:.2f}M params)")

    oc        = tc["optimizer"]
    optimizer = torch.optim.AdamW(model.parameters(), lr=oc["lr"],
                    betas=tuple(oc.get("betas",[0.9,0.999])),
                    weight_decay=oc.get("weight_decay",1e-4), eps=oc.get("eps",1e-8))
    scheduler  = build_scheduler(optimizer, cfg)
    criterion  = CombinedLoss(cfg).to(device)
    scaler     = torch.amp.GradScaler('cuda', enabled=tc.get("amp_fp16",True))

    start_ep, best_psnr, best_ssim, patience_cnt = 0, 0., 0., 0

    resume = args.resume
    if resume is None and tc["checkpointing"].get("auto_resume", True):
        auto = os.path.join(ckpt_dir, "latest.pth")
        if os.path.isfile(auto):
            resume = auto
            print(f"  Auto-resuming from: {auto}")

    if resume and os.path.isfile(resume):
        start_ep, best_psnr, best_ssim = load_ckpt(resume, model, optimizer, scheduler)
        start_ep += 1
        print(f"  Loaded checkpoint: starting at epoch {start_ep+1}, previous best PSNR: {best_psnr:.3f} dB")

    train_loader = build_dataloader(cfg, "train")
    val_loader   = build_dataloader(cfg, "val")

    os.makedirs("results", exist_ok=True)
    writer   = SummaryWriter("results/tensorboard")
    csv_path = "results/training_log.csv"
    existed  = os.path.isfile(csv_path)
    cf = open(csv_path, "a", newline="")
    cw = csv.DictWriter(cf, fieldnames=["epoch","lr","train_loss","val_psnr","val_ssim","val_sam","vram_gb","time_min"])
    if not existed:
        cw.writeheader()

    ga    = tc.get("grad_accumulation", 4)
    clip  = tc.get("grad_clip", 1.0)
    eps   = tc["epochs"]
    pat   = tc["early_stopping"].get("patience", 15)
    loge  = tc["logging"].get("log_every", 25)
    amp   = tc.get("amp_fp16", True)
    sev   = tc["checkpointing"].get("save_every", 5)

    print(f"  Dataset: {len(train_loader.dataset):,} train patches | {len(val_loader.dataset):,} val patches")
    print(f"  Batch size: {tc['batch_size']} (effective: {tc['batch_size']*ga}) | Batches/Epoch: {batches_per_ep}")
    print(f"  Total Epochs: {eps} | Total Batches: {eps * batches_per_ep:,} (~10.4 hours)")
    print("=" * 80, flush=True)

    total_start_time = time.time()

    for epoch in range(start_ep, eps):
        model.train()
        t0 = time.time()
        run_loss = 0.
        step_count = 0
        optimizer.zero_grad()
        cur_lr = scheduler.get_last_lr()[0]

        pbar = tqdm(train_loader, total=batches_per_ep, desc=f"Epoch {epoch+1:02d}/{eps:02d}", ncols=100, leave=True)
        for step, batch in enumerate(pbar):
            if step >= batches_per_ep:
                break

            lr_i = batch["lr"].to(device, non_blocking=True)
            hr_i = batch["hr"].to(device, non_blocking=True)
            mask = batch["mask"].to(device, non_blocking=True)

            with torch.autocast("cuda", enabled=amp):
                sr = model(lr_i)
                loss, ld = criterion(sr, hr_i, lr=lr_i, mask=mask)
                loss = loss / ga

            scaler.scale(loss).backward()

            if (step + 1) % ga == 0:
                if clip > 0:
                    scaler.unscale_(optimizer)
                    nn.utils.clip_grad_norm_(model.parameters(), clip)
                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad()

            run_loss += ld["total"].item()
            step_count += 1

            if step % 5 == 0 or step == batches_per_ep - 1:
                vram_used = torch.cuda.max_memory_allocated() / 1e9 if torch.cuda.is_available() else 0
                pbar.set_postfix({
                    "loss": f"{ld['total'].item():.4f}",
                    "charb": f"{ld.get('charbonnier', torch.tensor(0.)).item():.4f}",
                    "sam": f"{ld.get('sam', torch.tensor(0.)).item():.4f}",
                    "vram": f"{vram_used:.1f}G",
                    "lr": f"{cur_lr:.1e}"
                })
                try:
                    pct = int((step + 1) / batches_per_ep * 100)
                    with open("results/live_status.txt", "w", encoding="utf-8") as sf:
                        sf.write(f"epoch={epoch+1}/{eps}|step={step+1}/{batches_per_ep}|percent={pct}%|loss={ld['total'].item():.4f}|charb={ld.get('charbonnier', torch.tensor(0.)).item():.4f}|sam={ld.get('sam', torch.tensor(0.)).item():.4f}|vram={vram_used:.1f}G|lr={cur_lr:.1e}\n")
                except Exception:
                    pass

            if step % loge == 0:
                writer.add_scalar("train/loss_step", ld["total"].item(), epoch * batches_per_ep + step)

        scheduler.step()
        avg_loss = run_loss / max(1, step_count)
        elapsed  = (time.time() - t0) / 60.
        vram_cur = torch.cuda.max_memory_allocated() / 1e9 if torch.cuda.is_available() else 0

        # Validate with 25 batches (100 patches) every epoch for fast feedback (~1 min)
        print(f"  Validating epoch {epoch+1}...", end="\r", flush=True)
        vm = validate(model, val_loader, device, amp, max_batches=25)
        vp, vs, v_sam = vm["val_psnr"], vm["val_ssim"], vm["val_sam"]

        # TensorBoard & CSV
        writer.add_scalars("val", {"psnr": vp, "ssim": vs, "sam": v_sam}, epoch)
        writer.add_scalar("train/loss", avg_loss, epoch)
        cw.writerow({
            "epoch": epoch + 1,
            "lr": f"{cur_lr:.2e}",
            "train_loss": f"{avg_loss:.5f}",
            "val_psnr": f"{vp:.4f}",
            "val_ssim": f"{vs:.4f}",
            "val_sam": f"{v_sam:.4f}",
            "vram_gb": f"{vram_cur:.2f}",
            "time_min": f"{elapsed:.2f}"
        })
        cf.flush()

        is_best_psnr = vp > best_psnr
        if is_best_psnr:
            best_psnr = vp
            patience_cnt = 0
            best_tag = " * NEW BEST PSNR *"
        else:
            patience_cnt += 1
            best_tag = ""

        if vs > best_ssim:
            best_ssim = vs

        # Clean CMD Box Summary
        print(f"\n+{'='*78}+")
        print(f"| Epoch {epoch+1:02d}/{eps:02d} | Train Loss: {avg_loss:.5f} | Val PSNR: {vp:.3f} dB | Val SSIM: {vs:.4f} | Val SAM: {v_sam:.4f} |")
        print(f"| Time: {elapsed:.1f} min | LR: {cur_lr:.2e} | VRAM: {vram_cur:.2f} GB{best_tag.ljust(35)} |")
        print(f"+{'='*78}+\n", flush=True)

        # Save Checkpoints
        raw = model._orig_mod if hasattr(model, "_orig_mod") else model
        state = {
            "epoch": epoch,
            "model_state_dict": raw.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "scheduler_state_dict": scheduler.state_dict(),
            "best_psnr": best_psnr,
            "best_ssim": best_ssim,
            "val_psnr": vp,
            "val_ssim": vs,
            "config": cfg
        }

        if (epoch + 1) % sev == 0 or epoch == eps - 1:
            save_ckpt(state, os.path.join(ckpt_dir, "latest.pth"))
            print(f"  --> Saved periodic checkpoint: checkpoints/latest.pth", flush=True)

        if is_best_psnr:
            save_ckpt(state, os.path.join(ckpt_dir, "best_psnr.pth"))
            print(f"  --> Saved top checkpoint: checkpoints/best_psnr.pth (PSNR: {best_psnr:.3f} dB)", flush=True)

        if patience_cnt >= pat:
            print(f"\nEarly stopping triggered: no improvement in {pat} epochs.", flush=True)
            break

    total_hours = (time.time() - total_start_time) / 3600.
    print("\n" + "=" * 80)
    print(f"  TRAINING COMPLETE in {total_hours:.2f} hours!")
    print(f"  Best Val PSNR: {best_psnr:.4f} dB | Best Val SSIM: {best_ssim:.4f}")
    print("=" * 80, flush=True)
    cf.close()
    writer.close()


if __name__ == "__main__":
    main()
