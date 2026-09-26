"""
Sen2SR GAN - Epoch-Wise Monitor
================================
Shows a clean table that grows one row per completed epoch.
Refreshes every 5 seconds. Run in a separate CMD window.

    cd D:\stage1_rgbn
    python watch_epochs.py
"""
import os, time, sys, datetime

CSV_FILE     = r"D:\stage1_rgbn\results_sen2sr_gan\gan_training_log.csv"
STATUS_FILE  = r"D:\stage1_rgbn\results_sen2sr_gan\live_status.txt"
TOTAL_EPOCHS = 20
SECS_PER_EP  = 200   # 600 steps / ~3 it/s

REFRESH_SEC  = 5

# ── helpers ──────────────────────────────────────────────────────────────────
def cls():
    os.system("cls" if os.name == "nt" else "clear")

def read_csv():
    rows = []
    try:
        with open(CSV_FILE, "r", encoding="utf-8") as f:
            lines = [l.strip() for l in f if l.strip()]
        if len(lines) < 2:
            return rows
        header = lines[0].split(",")
        for line in lines[1:]:
            vals = line.split(",")
            if len(vals) == len(header):
                rows.append(dict(zip(header, vals)))
    except Exception:
        pass
    return rows

def read_status():
    try:
        with open(STATUS_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return ""

def parse_status(raw):
    d = {}
    for part in raw.split("|"):
        if "=" in part:
            k, v = part.split("=", 1)
            d[k.strip()] = v.strip()
    return d

def epoch_bar(done, total=20, width=20):
    filled = int(width * done / total)
    return "[" + "#" * filled + "-" * (width - filled) + "]"

def step_bar(pct_str, width=20):
    try:
        pct = float(pct_str.replace("%",""))
    except Exception:
        pct = 0
    filled = int(width * pct / 100)
    return "[" + "#" * filled + "-" * (width - filled) + f"] {pct:.0f}%"

# ── main loop ─────────────────────────────────────────────────────────────────
start_wall = time.time()

while True:
    try:
        cls()
        now_str = datetime.datetime.now().strftime("%H:%M:%S")

        rows   = read_csv()
        raw    = read_status()
        s      = parse_status(raw)
        done   = len(rows)
        is_mid = raw.startswith("GAN|")
        is_done_training = raw.startswith("TRAINING_COMPLETE")

        # ── Header ───────────────────────────────────────────────────────
        print("=" * 78)
        print(f"  SEN2SR  |  GAN FINE-TUNING  |  EPOCH TRACKER  |  {now_str}")
        print("=" * 78)
        print()

        # ── Overall progress bar ─────────────────────────────────────────
        overall_pct = done / TOTAL_EPOCHS * 100
        print(f"  OVERALL  {epoch_bar(done)}  Epoch {done}/{TOTAL_EPOCHS}  ({overall_pct:.0f}%)")

        # Current epoch step progress (if mid-epoch)
        if is_mid:
            cur_ep  = s.get("epoch", "?/20")
            cur_pct = s.get("pct", "0%")
            cur_step= s.get("step", "?")
            print(f"  NOW      {step_bar(cur_pct)}  Ep {cur_ep}  step {cur_step}/600")
        elif is_done_training:
            print(f"  STATUS   COMPLETE - Final weights exported!")
        print()

        # ── ETA ──────────────────────────────────────────────────────────
        remaining = TOTAL_EPOCHS - done
        if done > 0:
            # Use actual avg time from CSV
            try:
                times = [float(r.get("time_min","0")) for r in rows if r.get("time_min","")]
                avg_min = sum(times) / len(times) if times else SECS_PER_EP / 60
            except Exception:
                avg_min = SECS_PER_EP / 60

            # Subtract the already-elapsed portion of current epoch
            if is_mid:
                try:
                    cur_step_pct = float(s.get("pct","0").replace("%","")) / 100
                    already_done_min = avg_min * cur_step_pct
                    eta_min = remaining * avg_min - already_done_min
                except Exception:
                    eta_min = remaining * avg_min
            else:
                eta_min = remaining * avg_min

            eta_str = f"{eta_min:.0f} min" if eta_min < 90 else f"{eta_min/60:.1f} hr"
            est_finish = datetime.datetime.now() + datetime.timedelta(minutes=eta_min)
            finish_str = est_finish.strftime("%I:%M %p")
        else:
            avg_min    = SECS_PER_EP / 60
            eta_min    = TOTAL_EPOCHS * avg_min
            eta_str    = f"~{eta_min:.0f} min"
            finish_str = "calculating..."

        print(f"  Avg time/epoch : {avg_min:.1f} min")
        print(f"  ETA to finish  : {eta_str}  (approx {finish_str})")
        print()

        # ── Epoch table ───────────────────────────────────────────────────
        if rows:
            # Find best PSNR row
            try:
                best_psnr = max(float(r.get("val_psnr","0")) for r in rows)
            except Exception:
                best_psnr = 0

            print(f"  {'Ep':>4}  {'PSNR (dB)':>10}  {'SSIM':>7}  {'SAM':>7}  {'G Loss':>8}  {'D Loss':>8}  {'Min':>5}  Notes")
            print(f"  {'-'*4}  {'-'*10}  {'-'*7}  {'-'*7}  {'-'*8}  {'-'*8}  {'-'*5}  -----")

            for r in rows:
                ep_r  = r.get("epoch",        "")
                vp_r  = r.get("val_psnr",     "")
                vs_r  = r.get("val_ssim",     "")
                sa_r  = r.get("val_sam",      "")
                gl_r  = r.get("train_g_loss", "")
                dl_r  = r.get("train_d_loss", "")
                tm_r  = r.get("time_min",     "")
                ds_r  = r.get("d_status",     "")

                notes = []
                try:
                    if abs(float(vp_r) - best_psnr) < 0.001:
                        notes.append("<-- BEST PSNR")
                except Exception:
                    pass
                try:
                    if float(dl_r) < 0.1:
                        notes.append("D low")
                    elif float(dl_r) > 1.5:
                        notes.append("D high")
                except Exception:
                    pass
                if ds_r == "adjusted":
                    notes.append("w_gan adjusted")

                note_str = " | ".join(notes)
                print(f"  {ep_r:>4}  {vp_r:>10}  {vs_r:>7}  {sa_r:>7}  {gl_r:>8}  {dl_r:>8}  {tm_r:>5}  {note_str}")

        else:
            print("  No completed epochs yet — waiting for Epoch 1 to finish...")
            print(f"  (Each epoch takes ~{SECS_PER_EP//60} min  |  First results in ~{SECS_PER_EP//60} min)")

        # ── Live step stats (if mid-epoch) ───────────────────────────────
        if is_mid:
            print()
            print(f"  {'─'*60}")
            print(f"  LIVE (current step):")
            print(f"    G Loss : {s.get('G','?')}")
            print(f"    D Loss : {s.get('D','?')}   ({s.get('d_status','?')})")
            print(f"    L1     : {s.get('L1','?')}")
            print(f"    SAM    : {s.get('SAM','?')}")
            print(f"    VRAM   : {s.get('vram','?')}")

        # ── Footer ───────────────────────────────────────────────────────
        print()
        print(f"  Weights  -> D:\\stage1_rgbn\\checkpoints_sen2sr_gan\\")
        print(f"  FINAL    -> D:\\stage1_rgbn\\final-final-weights\\final_weights.pth  (auto-saved at end)")
        print()
        print(f"  Refreshing every {REFRESH_SEC}s ...  Ctrl+C to stop")

        if is_done_training:
            print()
            print("  === DONE! final_weights.pth is ready. ===")
            break

        time.sleep(REFRESH_SEC)

    except KeyboardInterrupt:
        print("\n  Stopped.\n")
        sys.exit(0)
    except Exception as e:
        print(f"\n  Error: {e}")
        time.sleep(REFRESH_SEC)
