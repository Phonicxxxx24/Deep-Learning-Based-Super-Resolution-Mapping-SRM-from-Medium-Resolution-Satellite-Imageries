"""
Automated Evaluation and Visual Generation Script for Sen2SR_RGBN.
Generates side-by-side comparison: LR (Sentinel-2 10m) vs Bicubic vs Sen2SR_RGBN vs Ground Truth NAIP.
"""
import os, sys, argparse, yaml
import numpy as np
import torch
import torch.nn.functional as F
import lmdb, io
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from models.sen2sr_rgbn import make_sen2sr_model
from evaluation.metrics import compute_psnr, compute_ssim, compute_sam

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ckpt", default="checkpoints_sen2sr/best_psnr.pth")
    parser.add_argument("--config", default="configs/stage1_sen2sr.yaml")
    parser.add_argument("--output", default="results_sen2sr/final_evaluation_visual.png")
    args = parser.parse_args()

    print("=" * 80)
    print("      SEN2SR-RRDB SUPER-RESOLUTION: RESULTS & VISUAL VERIFICATION")
    print("=" * 80)

    if not os.path.isfile(args.ckpt):
        print(f"Checkpoint {args.ckpt} not found!")
        return

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = make_sen2sr_model(cfg).to(device)
    ckpt = torch.load(args.ckpt, map_location=device, weights_only=False)
    state = ckpt.get("model_state_dict", ckpt.get("model", ckpt))
    model.load_state_dict(state)
    model.eval()

    print(f"  Checkpoint loaded: {args.ckpt} (Saved at Epoch {ckpt.get('epoch', '?')})")

    lmdb_path = r"D:\stage1_rgbn\data\lmdb_cache\test.lmdb"
    env = lmdb.open(lmdb_path, readonly=True, lock=False)

    # Pick 4 diverse scenes
    indices = [15, 80, 220, 410]
    fig, axes = plt.subplots(len(indices), 4, figsize=(18, 4.5 * len(indices)), dpi=180)

    with env.begin() as txn:
        for row_idx, idx in enumerate(indices):
            buf = txn.get(f"idx_{idx:07d}".encode("ascii"))
            if not buf:
                continue
            data = np.load(io.BytesIO(buf), allow_pickle=True).item()
            lr_t = torch.from_numpy(data["lr"]).unsqueeze(0).to(device)
            hr_t = torch.from_numpy(data["hr"]).unsqueeze(0).to(device)

            with torch.no_grad():
                sr_t = model(lr_t).clamp(0.0, 1.0)
                bic_t = F.interpolate(lr_t, scale_factor=4, mode="bicubic", align_corners=False).clamp(0.0, 1.0)

            p_bic = compute_psnr(bic_t, hr_t).item()
            p_sr  = compute_psnr(sr_t, hr_t).item()
            s_sr  = compute_ssim(sr_t, hr_t).item()

            # Shared percentile contrast stretch
            hr_rgb = data["hr"][[2, 1, 0], :, :].transpose(1, 2, 0)
            p1, p99 = np.percentile(hr_rgb, (1, 99))
            denom = max(1e-5, p99 - p1)

            def to_rgb_shared(t):
                arr = t[0, [2, 1, 0], :, :].permute(1, 2, 0).cpu().numpy()
                return np.clip((arr - p1) / denom, 0.0, 1.0)

            # Col 0: Input LR
            axes[row_idx, 0].imshow(to_rgb_shared(lr_t))
            axes[row_idx, 0].set_title(f"Input Sentinel-2 (10m)\n[96x96 Low-Res]", fontsize=11)
            axes[row_idx, 0].axis("off")

            # Col 1: Bicubic
            axes[row_idx, 1].imshow(to_rgb_shared(bic_t))
            axes[row_idx, 1].set_title(f"Bicubic 4x Baseline\nPSNR: {p_bic:.2f} dB (Blurry)", fontsize=11)
            axes[row_idx, 1].axis("off")

            # Col 2: Our Sen2SR Model
            axes[row_idx, 2].imshow(to_rgb_shared(sr_t))
            axes[row_idx, 2].set_title(f"Our 4-Band Sen2SR (2.5m)\nPSNR: {p_sr:.2f} dB | SSIM: {s_sr:.3f}\n[Direct Synthesis, No Blur Shortcut]", fontsize=11, color="green", fontweight="bold")
            axes[row_idx, 2].axis("off")

            # Col 3: Ground Truth
            axes[row_idx, 3].imshow(to_rgb_shared(hr_t))
            axes[row_idx, 3].set_title(f"Ground Truth NAIP (2.5m)\n[Target Aerial Photography]", fontsize=11)
            axes[row_idx, 3].axis("off")

            print(f"  Scene #{idx}: Bicubic={p_bic:.2f} dB -> Sen2SR={p_sr:.2f} dB | SSIM={s_sr:.4f}")

    plt.tight_layout()
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    plt.savefig(args.output, bbox_inches="tight")
    plt.close()
    print(f"\n  [Visual Comparison Saved] -> {args.output}")
    print("=" * 80)

if __name__ == "__main__":
    main()
