"""
Stage 1 RGBN Sen2SR Phase 2: High-Frequency Edge & Texture Refinement.
Loads 36 dB pre-trained Sen2SR checkpoint and applies 3x edge/gradient supervision.
Brings total cumulative training time to ~4.5 Hours.
"""
import os, sys, csv, time, math, argparse, random
import yaml, torch, torch.nn as nn
from tqdm import tqdm

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from models.sen2sr_rgbn import make_sen2sr_model
from losses.sen2sr_loss import Sen2SRLoss
from training.dataset   import build_dataloader
from evaluation.metrics import compute_psnr, compute_ssim, compute_sam


def seed_everything(seed=42):
    random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = True


def save_ckpt(state, path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    torch.save(state, tmp)
    if os.path.isfile(path):
        os.remove(path)
    os.rename(tmp, path)


def validate_sen2sr(model, val_loader, device, amp=True, max_batches=50):
    model.eval()
    psnrs, ssims, sams = [], [], []
    with torch.no_grad():
        for i, batch in enumerate(val_loader):
            if i >= max_batches:
                break
            lr = batch["lr"].to(device, non_blocking=True)
            hr = batch["hr"].to(device, non_blocking=True)
            with torch.autocast("cuda", enabled=amp):
                sr = model(lr).clamp(0.0, 1.0)

            psnrs.append(compute_psnr(sr, hr).item())
            ssims.append(compute_ssim(sr, hr).item())
            sams.append(compute_sam(sr, hr).item())

    return {
        "val_psnr": float(sum(psnrs) / max(1, len(psnrs))),
        "val_ssim": float(sum(ssims) / max(1, len(ssims))),
        "val_sam":  float(sum(sams)  / max(1, len(sams))),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/stage1_sen2sr_phase2.yaml")
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    seed_everything(cfg.get("seed", 42))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    vram_total = torch.cuda.get_device_properties(0).total_memory / 1e9 if torch.cuda.is_available() else 0
    print("=" * 90)
    print("   STAGE 1 RGBN SEN2SR: PHASE 2 HIGH-FREQUENCY EDGE REFINEMENT (~2.1 HR RUN)")
    print(f"   Device: {device} ({torch.cuda.get_device_name(0)}) | Total VRAM: {vram_total:.1f} GB")
    print("=" * 90)

    tc = cfg["training"]
    ckpt_dir = tc["checkpointing"]["save_dir"]
    res_dir  = "results_sen2sr_phase2"
    os.makedirs(ckpt_dir, exist_ok=True)
    os.makedirs(res_dir, exist_ok=True)

    batches_per_ep = tc.get("batches_per_epoch", 800)
    eps = tc.get("epochs", 45)
    ga  = tc.get("grad_accumulation", 2)
    clip = tc.get("grad_clip", 1.0)
    amp  = tc.get("amp_fp16", True)

    # 1. Model
    model = make_sen2sr_model(cfg).to(device)
    init_ckpt = tc["checkpointing"].get("init_from", "checkpoints_sen2sr/best_psnr.pth")
    if os.path.isfile(init_ckpt):
        ckpt_data = torch.load(init_ckpt, map_location=device, weights_only=False)
        model.load_state_dict(ckpt_data["model_state_dict"])
        print(f"  --> Successfully loaded Phase 1 pre-trained weights from: {init_ckpt}")
    else:
        print(f"  Warning: Init checkpoint {init_ckpt} not found! Starting fresh.")

    # 2. Loss & Optimizer (3x Edge/Gradient Boost)
    lc = cfg.get("loss", {})
    criterion = Sen2SRLoss(
        w_l1=lc.get("w_l1", 0.6),
        w_sam=lc.get("w_sam", 0.25),
        w_lap=lc.get("w_lap", 1.2),
        w_grad=lc.get("w_grad", 1.2),
        w_obs=lc.get("w_obs", 0.1)
    ).to(device)

    oc = tc["optimizer"]
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=oc.get("lr", 5e-5),
        betas=tuple(oc.get("betas", [0.9, 0.999])),
        weight_decay=oc.get("weight_decay", 1e-4),
        eps=oc.get("eps", 1e-8)
    )

    sc = tc["scheduler"]
    warmup_ep = sc.get("warmup_epochs", 1)
    min_lr = sc.get("min_lr", 1e-6)

    def lr_lambda(ep):
        if ep < warmup_ep:
            return float(ep + 1) / float(max(1, warmup_ep))
        progress = float(ep - warmup_ep) / float(max(1, eps - warmup_ep))
        return max(min_lr / oc["lr"], 0.5 * (1.0 + math.cos(math.pi * progress)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    scaler    = torch.amp.GradScaler('cuda', enabled=amp)

    start_ep, best_psnr, best_ssim = 0, 0.0, 0.0
    latest_ckpt = os.path.join(ckpt_dir, "latest.pth")
    if tc["checkpointing"].get("auto_resume", True) and os.path.isfile(latest_ckpt):
        try:
            ckpt = torch.load(latest_ckpt, map_location=device, weights_only=False)
            model.load_state_dict(ckpt["model_state_dict"])
            optimizer.load_state_dict(ckpt["optimizer_state_dict"])
            scheduler.load_state_dict(ckpt["scheduler_state_dict"])
            start_ep = ckpt.get("epoch", 0) + 1
            best_psnr = ckpt.get("best_psnr", 0.0)
            best_ssim = ckpt.get("best_ssim", 0.0)
            print(f"  Auto-resumed from: {latest_ckpt} (Starting at Epoch {start_ep+1})")
        except Exception as e:
            print(f"  Could not resume from {latest_ckpt}: {e}")

    # Data loaders
    train_loader = build_dataloader(cfg, "train")
    val_loader   = build_dataloader(cfg, "val")

    csv_path = os.path.join(res_dir, "training_log.csv")
    csv_exists = os.path.isfile(csv_path) and os.path.getsize(csv_path) > 0
    cf = open(csv_path, "a", newline="", encoding="utf-8")
    cw = csv.DictWriter(cf, fieldnames=["epoch", "lr", "train_loss", "val_psnr", "val_ssim", "val_sam", "time_min"])
    if not csv_exists:
        cw.writeheader()
        cf.flush()

    total_target_batches = (eps - start_ep) * batches_per_ep
    print(f"  Phase 2 Plan       : {eps} Epochs ({total_target_batches:,} Batches) ~ 2.1 Hours")
    print(f"  Cumulative Time    : 2.36h (Phase 1) + 2.1h (Phase 2) = ~4.5 Hours Total")
    print("=" * 90, flush=True)

    train_iter = iter(train_loader)
    total_start_time = time.time()

    for epoch in range(start_ep, eps):
        model.train()
        t0 = time.time()
        run_loss = 0.0
        step_count = 0
        optimizer.zero_grad()
        cur_lr = scheduler.get_last_lr()[0]

        pbar = tqdm(range(batches_per_ep), desc=f"Phase2 Ep {epoch+1:02d}/{eps:02d}", ncols=105, leave=True)
        for step in pbar:
            try:
                batch = next(train_iter)
            except StopIteration:
                train_iter = iter(train_loader)
                batch = next(train_iter)

            lr_i = batch["lr"].to(device, non_blocking=True)
            hr_i = batch["hr"].to(device, non_blocking=True)

            with torch.autocast("cuda", enabled=amp):
                sr_i = model(lr_i)
                loss, ld = criterion(sr_i, hr_i, lr=lr_i)
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
                    "lap":  f"{ld['lap'].item():.4f}",
                    "sam":  f"{ld['sam'].item():.4f}",
                    "vram": f"{vram_used:.1f}G",
                    "lr":   f"{cur_lr:.1e}"
                })

                try:
                    pct = int((step + 1) / batches_per_ep * 100)
                    with open(os.path.join(res_dir, "live_status.txt"), "w", encoding="utf-8") as sf:
                        sf.write(f"epoch={epoch+1}/{eps}|step={step+1}/{batches_per_ep}|percent={pct}%|loss={ld['total'].item():.4f}|lap={ld['lap'].item():.4f}|sam={ld['sam'].item():.4f}|vram={vram_used:.1f}G|lr={cur_lr:.1e}\n")
                except Exception:
                    pass

        scheduler.step()
        avg_loss = run_loss / max(1, step_count)
        elapsed  = (time.time() - t0) / 60.0

        print(f"  Validating Phase 2 Epoch {epoch+1}...", end="\r", flush=True)
        vm = validate_sen2sr(model, val_loader, device, amp=amp, max_batches=50)
        vp, vs, v_sam = vm["val_psnr"], vm["val_ssim"], vm["val_sam"]

        cw.writerow({
            "epoch": epoch + 1,
            "lr": f"{cur_lr:.2e}",
            "train_loss": f"{avg_loss:.5f}",
            "val_psnr": f"{vp:.4f}",
            "val_ssim": f"{vs:.4f}",
            "val_sam": f"{v_sam:.4f}",
            "time_min": f"{elapsed:.2f}"
        })
        cf.flush()

        is_best = vp > best_psnr
        if is_best:
            best_psnr = vp
            best_ssim = vs

        state = {
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "scheduler_state_dict": scheduler.state_dict(),
            "best_psnr": best_psnr,
            "best_ssim": best_ssim,
            "val_psnr": vp,
            "val_ssim": vs,
            "config": cfg
        }

        save_ckpt(state, os.path.join(ckpt_dir, "latest.pth"))
        if is_best:
            save_ckpt(state, os.path.join(ckpt_dir, "best_psnr.pth"))
            best_flag = " [*** NEW BEST PSNR ***]"
        else:
            best_flag = ""

        if (epoch + 1) % tc["checkpointing"].get("save_every", 5) == 0:
            save_ckpt(state, os.path.join(ckpt_dir, f"epoch_{epoch+1:03d}.pth"))

        print(f"  Phase2 Ep {epoch+1:02d}/{eps:02d} | Loss: {avg_loss:.4f} | Val PSNR: {vp:.2f} dB | SSIM: {vs:.4f} | SAM: {v_sam:.4f} | Time: {elapsed:.1f}m{best_flag}", flush=True)

    cf.close()
    total_time_hr = (time.time() - total_start_time) / 3600.0
    print("\n" + "=" * 90)
    print(f"  PHASE 2 TRAINING COMPLETED in {total_time_hr:.2f} Hours!")
    print(f"  Cumulative Total Training Time: {2.36 + total_time_hr:.2f} Hours")
    print(f"  Best Validation PSNR: {best_psnr:.2f} dB | Best SSIM: {best_ssim:.4f}")
    print("=" * 90)

    # Generate final Phase 2 comparative visual
    try:
        cmd = f"python scripts/check_sen2sr_results.py --ckpt checkpoints_sen2sr_phase2/best_psnr.pth --config configs/stage1_sen2sr_phase2.yaml --output results_sen2sr_phase2/final_evaluation_visual.png"
        os.system(cmd)
    except Exception:
        pass


if __name__ == "__main__":
    main()
