"""
Inspect and verify model checkpoints on real Sentinel-2 / NAIP validation data.

Usage:
    python scripts/check_results.py
    python scripts/check_results.py --ckpt checkpoints/best_psnr.pth
"""
import os, sys, argparse, yaml
import torch
import torch.nn.functional as F
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from models import make_model
from training.dataset import build_dataloader
from evaluation.metrics import compute_psnr, compute_ssim, compute_sam


def to_rgb_img(t):
    """Convert (4, H, W) [B02, B03, B04, B08] to (H, W, 3) RGB [B04, B03, B02]."""
    rgb = t[[2, 1, 0], :, :].permute(1, 2, 0).cpu().numpy()
    rgb = np.clip(rgb, 0.0, 1.0)
    p2, p98 = np.percentile(rgb, (2, 98))
    if p98 > p2:
        rgb = np.clip((rgb - p2) / (p98 - p2), 0.0, 1.0)
    return rgb


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/stage1_swinir.yaml")
    parser.add_argument("--ckpt", default="checkpoints/best_psnr.pth")
    parser.add_argument("--num_samples", type=int, default=4)
    parser.add_argument("--output_img", default="results/visual_inspection.png")
    args = parser.parse_args()

    print("=" * 80)
    print("       STAGE 1 RGBN SUPER-RESOLUTION: RESULTS & QUALITY VERIFICATION")
    print("=" * 80)

    if not os.path.isfile(args.ckpt):
        print(f"Error: Checkpoint '{args.ckpt}' not found!")
        return

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  Device           : {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")
    print(f"  Loading Model    : 4-band SwinIR Residual Transformer (18.52M params)")
    print(f"  Checkpoint       : {args.ckpt}")

    model = make_model(cfg).to(device)
    ckpt = torch.load(args.ckpt, map_location=device, weights_only=False)
    state = ckpt.get("model_state_dict", ckpt.get("model", ckpt))
    model.load_state_dict(state)
    model.eval()

    ckpt_epoch = ckpt.get("epoch", "?")
    ckpt_psnr = ckpt.get("best_psnr", ckpt.get("val_psnr", None))
    print(f"  Checkpoint Epoch : {ckpt_epoch}")
    if ckpt_psnr:
        print(f"  Saved Val PSNR   : {ckpt_psnr:.3f} dB")
    print("-" * 80)

    print("  Evaluating on validation set...")
    val_loader = build_dataloader(cfg, "val")

    psnr_list, ssim_list, sam_list = [], [], []
    band_psnrs = { "B02(Blue)": [], "B03(Green)": [], "B04(Red)": [], "B08(NIR)": [] }
    saved_samples = []

    with torch.no_grad():
        for batch_idx, batch in enumerate(val_loader):
            lr = batch["lr"].to(device)
            hr = batch["hr"].to(device)

            sr = model(lr).clamp(0.0, 1.0)

            for i in range(lr.shape[0]):
                sr_i = sr[i:i+1]
                hr_i = hr[i:i+1]
                lr_i = lr[i:i+1]

                p = compute_psnr(sr_i, hr_i).item()
                s = compute_ssim(sr_i, hr_i).item()
                sm = compute_sam(sr_i, hr_i).item()

                psnr_list.append(p)
                ssim_list.append(s)
                sam_list.append(sm)

                band_psnrs["B02(Blue)"].append(compute_psnr(sr_i[:, 0:1], hr_i[:, 0:1]).item())
                band_psnrs["B03(Green)"].append(compute_psnr(sr_i[:, 1:2], hr_i[:, 1:2]).item())
                band_psnrs["B04(Red)"].append(compute_psnr(sr_i[:, 2:3], hr_i[:, 2:3]).item())
                band_psnrs["B08(NIR)"].append(compute_psnr(sr_i[:, 3:4], hr_i[:, 3:4]).item())

                if len(saved_samples) < args.num_samples:
                    bic = F.interpolate(lr_i, scale_factor=4, mode="bicubic", align_corners=False).clamp(0.0, 1.0)
                    saved_samples.append({
                        "lr": lr_i[0],
                        "bic": bic[0],
                        "sr": sr_i[0],
                        "hr": hr_i[0],
                        "psnr": p,
                        "ssim": s
                    })

            if len(psnr_list) >= 40:
                break

    avg_psnr = np.mean(psnr_list)
    avg_ssim = np.mean(ssim_list)
    avg_sam  = np.mean(sam_list)

    print("\n" + "=" * 80)
    print("                    EVALUATION RESULTS REPORT")
    print("=" * 80)
    print(f"  Validation Patches Tested : {len(psnr_list)} images")
    print(f"  Overall Average PSNR      : {avg_psnr:.2f} dB  [Satellite SR SOTA benchmark: >32 dB]")
    print(f"  Overall Average SSIM      : {avg_ssim:.4f}  [Structural fidelity]")
    print(f"  Overall Spectral Angle SAM: {avg_sam:.4f} rad ({np.degrees(avg_sam):.2f} deg) [Color/band preservation]")
    print("-" * 80)
    print("  Per-Band Super-Resolution PSNR:")
    for band_name, vals in band_psnrs.items():
        print(f"    * {band_name:<12}: {np.mean(vals):.2f} dB")
    print("=" * 80)

    if saved_samples:
        os.makedirs(os.path.dirname(args.output_img) or ".", exist_ok=True)
        N = len(saved_samples)
        fig, axes = plt.subplots(N, 4, figsize=(16, 4 * N), dpi=150)
        if N == 1:
            axes = np.expand_dims(axes, 0)

        for row_idx, sample in enumerate(saved_samples):
            axes[row_idx, 0].imshow(to_rgb_img(sample["lr"]))
            axes[row_idx, 0].set_title(f"Input Sentinel-2 (10m)\n[96x96 LR]", fontsize=10)
            axes[row_idx, 0].axis("off")

            axes[row_idx, 1].imshow(to_rgb_img(sample["bic"]))
            axes[row_idx, 1].set_title(f"Bicubic Upsample (4x)\nBlurry interpolation", fontsize=10)
            axes[row_idx, 1].axis("off")

            axes[row_idx, 2].imshow(to_rgb_img(sample["sr"]))
            axes[row_idx, 2].set_title(f"Our SwinIR Model (2.5m)\nPSNR: {sample['psnr']:.2f} dB | SSIM: {sample['ssim']:.3f}", fontsize=10, color="green", fontweight="bold")
            axes[row_idx, 2].axis("off")

            axes[row_idx, 3].imshow(to_rgb_img(sample["hr"]))
            axes[row_idx, 3].set_title(f"Ground Truth NAIP\n[384x384 Target]", fontsize=10)
            axes[row_idx, 3].axis("off")

        plt.tight_layout()
        plt.savefig(args.output_img, bbox_inches="tight")
        plt.close()
        print(f"\n  [Visual Comparison Image Saved] -> {args.output_img}")
        print("  (Compare Sentinel-2 10m vs Bicubic 4x vs SwinIR SR 2.5m vs Ground Truth NAIP)")
        print("=" * 80)


if __name__ == "__main__":
    main()
