"""
Step 3: Overfit test - MUST PASS before full training.

Memorizes N synthetic patches where LR is downsampled HR (physically consistent).
Expected: loss -> near 0, PSNR > 30-35 dB within 40-50 epochs.
"""
import os, sys, yaml, torch
import torch.nn.functional as F
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import make_model
from losses import CombinedLoss

EPOCHS = 50
LR     = 2e-3
N      = 2      # 2 patches for fast verification
CFG    = "configs/stage1_swinir.yaml"

def main():
    with open(CFG) as f:
        cfg = yaml.safe_load(f)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Overfit test on {device}")

    torch.manual_seed(42)
    # Physically consistent: LR is downsampled HR so Observation Loss and Charbonnier agree!
    hr_b = torch.rand(N, 4, 384, 384, device=device)
    lr_b = F.interpolate(hr_b, size=(96, 96), mode="bicubic", align_corners=False).clamp(0, 1)
    mask = torch.ones(N, 1, 384, 384, device=device)

    model  = make_model(cfg).to(device)
    crit   = CombinedLoss(cfg).to(device)
    opt    = torch.optim.Adam(model.parameters(), lr=LR)
    scaler = torch.amp.GradScaler('cuda')

    print(f"Params: {sum(p.numel() for p in model.parameters())/1e6:.2f}M")
    print(f"Batch:  {N} patches (96x96 LR -> 384x384 HR), AMP enabled")

    psnr = 0.
    for ep in range(EPOCHS):
        opt.zero_grad()
        with torch.autocast("cuda"):
            sr = model(lr_b)
            loss, ld = crit(sr, hr_b, lr=lr_b, mask=mask)

        scaler.scale(loss).backward()
        scaler.step(opt)
        scaler.update()

        if (ep + 1) % 5 == 0:
            with torch.no_grad(), torch.autocast("cuda"):
                sr_e = model(lr_b).clamp(0, 1)
                mse  = ((sr_e - hr_b) ** 2).mean()
                psnr = (10 * torch.log10(torch.tensor(1.0) / mse)).item() if mse > 0 else 99.
            vram = torch.cuda.max_memory_allocated() / 1e9
            print(f"  Ep {ep+1:3d}: loss={ld['total'].item():.6f} | PSNR={psnr:.2f} dB | VRAM={vram:.2f} GB", flush=True)

    print()
    if psnr > 28.:
        print(f"OVERFIT TEST PASSED (PSNR={psnr:.2f} dB) - pipeline is working correctly.")
    else:
        print(f"OVERFIT TEST FAILED (PSNR={psnr:.2f} dB) - debug before proceeding.")
        sys.exit(1)

if __name__ == "__main__":
    main()
