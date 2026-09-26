# Training — SRM Custom Model Development

This directory houses the **custom training pipelines** for each stage of the
Deep Learning Super-Resolution Mapping (SRM) project.

## Structure

```
training/
└── stage1_rgbn/          ← Stage 1: 4-band RGBN 4× Super-Resolution (TRAINED ✅)
    ├── weights/          ← Production checkpoint (17.5 MB — included in repo)
    ├── models/           ← Architecture implementations
    ├── losses/           ← Custom multi-component loss functions
    ├── training/         ← Training loop scripts (Phase 1 & Phase 2)
    ├── evaluation/       ← Metrics (PSNR, SSIM, SAM, NDVI fidelity)
    ├── configs/          ← YAML training configurations
    └── scripts/          ← Dataset prep, ablations, evaluation utilities
```

## Stages

| Stage | Task | Model | Status |
|---|---|---|---|
| **Stage 1** | Pixel-level 4× SR (10m → 2.5m) | `Sen2SR_RGBN` 4.58M RRDB | ✅ Trained & Integrated |
| Stage 2 | Super-Resolution Mapping / Land Classification | Diffusion LDSR-S2 | ✅ Pre-trained (OpenSR) |

See [`stage1_rgbn/README.md`](./stage1_rgbn/README.md) for full details on
architecture comparison, training protocol, and how to reproduce results.
