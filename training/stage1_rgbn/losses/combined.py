"""Combined weighted loss for Stage 1 RGBN SR."""
import torch, torch.nn as nn, torch.fft as fft, torch.nn.functional as F
from .charbonnier import CharbonnierLoss
from .sam         import SAMLoss
from .frequency   import FrequencyLoss
from .observation import ObservationLoss


class CombinedLoss(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        lc = cfg.get("loss", {})
        scale = cfg.get("model", {}).get("scale", 4)

        cc = lc.get("charbonnier", {})
        self.w_charb = cc.get("weight", 1.0)
        self.charb   = CharbonnierLoss(eps=cc.get("eps", 1e-3))

        sc = lc.get("sam", {})
        self.w_sam = sc.get("weight", 0.1)
        self.sam   = SAMLoss()

        fc = lc.get("frequency", {})
        self.w_freq = fc.get("weight", 0.05)
        self.freq   = FrequencyLoss()

        oc = lc.get("observation", {})
        self.w_obs = oc.get("weight", 0.1)
        self.obs   = ObservationLoss(scale=scale)

        fou = lc.get("fourier_constraint", {})
        self.use_fourier  = fou.get("enabled", False)
        self.fourier_ratio = fou.get("low_freq_ratio", 0.5)
        self.scale = scale

    def _fourier_hard_constraint(self, sr, lr):
        """Experiment E: replace low-freq SR components with actual LR spectrum."""
        sr_fft = fft.rfft2(sr)
        lr_up  = F.interpolate(lr, scale_factor=self.scale, mode="bicubic", align_corners=False)
        lr_fft = fft.rfft2(lr_up)
        _, _, H, W2 = sr_fft.shape
        h_cut = int(H  * self.fourier_ratio // 2)
        w_cut = int(W2 * self.fourier_ratio)
        mask  = torch.zeros_like(sr_fft, dtype=torch.bool)
        mask[:, :, :h_cut,  :w_cut] = True
        mask[:, :, -h_cut:, :w_cut] = True
        sr_fft_c = torch.where(mask, lr_fft, sr_fft)
        return fft.irfft2(sr_fft_c, s=sr.shape[-2:])

    def forward(self, pred, target, lr=None, mask=None):
        losses = {}
        l_charb = self.charb(pred, target, mask);      losses["charbonnier"] = l_charb
        l_sam   = self.sam(pred, target);               losses["sam"]         = l_sam
        l_freq  = self.freq(pred, target, mask);        losses["frequency"]   = l_freq
        l_obs   = torch.tensor(0., device=pred.device)
        if lr is not None:
            l_obs = self.obs(pred, lr)
        losses["observation"] = l_obs

        l_fourier = torch.tensor(0., device=pred.device)
        if self.use_fourier and lr is not None:
            pred_c    = self._fourier_hard_constraint(pred, lr)
            l_fourier = F.l1_loss(pred_c, target)
        losses["fourier"] = l_fourier

        total = (self.w_charb * l_charb + self.w_sam * l_sam +
                 self.w_freq  * l_freq  + self.w_obs * l_obs + l_fourier)
        losses["total"] = total
        return total, losses
