"""
Live Line-by-Line Terminal Streamer for Sen2SR_RGBN Training (Phase 1 & Phase 2).
Shows continuous batch progress and epoch completions in real time in CMD without clearing screen.

Usage:
    python scripts/live_stream_sen2sr.py
"""
import os, sys, time, csv, datetime

# Automatically detect active phase results directory
if os.path.exists(r"D:\stage1_rgbn\results_sen2sr_phase2\live_status.txt"):
    STATUS_FILE = r"D:\stage1_rgbn\results_sen2sr_phase2\live_status.txt"
    CSV_FILE    = r"D:\stage1_rgbn\results_sen2sr_phase2\training_log.csv"
    PHASE_NAME  = "PHASE 2: HIGH-FREQUENCY EDGE REFINEMENT"
else:
    STATUS_FILE = r"D:\stage1_rgbn\results_sen2sr\live_status.txt"
    CSV_FILE    = r"D:\stage1_rgbn\results_sen2sr\training_log.csv"
    PHASE_NAME  = "PHASE 1: BASELINE RECONSTRUCTION"

def get_timestamp():
    return datetime.datetime.now().strftime("%H:%M:%S")

def main():
    print("=" * 95)
    print(f"    STAGE 1 RGBN SEN2SR-RRDB TRAINING - LIVE LINE-BY-LINE STREAM")
    print(f"    Active: [{PHASE_NAME}]")
    print("    (Showing real-time sub-pixel synthesis, edge loss & SAM metrics)")
    print("=" * 95)
    print(f"[{get_timestamp()}] Waiting for live training feed...")

    last_step_str = None
    last_completed_epochs = 0

    if os.path.isfile(CSV_FILE):
        try:
            with open(CSV_FILE, "r", encoding="utf-8") as f:
                last_completed_epochs = max(0, len(list(csv.reader(f))) - 1)
        except Exception:
            pass

    while True:
        try:
            # Check for completed epochs
            if os.path.isfile(CSV_FILE):
                try:
                    with open(CSV_FILE, "r", encoding="utf-8") as f:
                        rows = list(csv.DictReader(f))
                        if len(rows) > last_completed_epochs:
                            for r in rows[last_completed_epochs:]:
                                ep = r.get("epoch", "?")
                                p = r.get("val_psnr", "?")
                                s = r.get("val_ssim", "?")
                                sm = r.get("val_sam", "?")
                                l = r.get("train_loss", "?")
                                t = r.get("time_min", "?")
                                print("\n" + "=" * 95)
                                print(f"[{get_timestamp()}] >>> EPOCH {ep} COMPLETED! <<<")
                                print(f"  Train Loss: {l} | Val PSNR: {p} dB | Val SSIM: {s} | Val SAM: {sm} | Time: {t}m")
                                print("=" * 95 + "\n", flush=True)
                            last_completed_epochs = len(rows)
                except Exception:
                    pass

            # Check for step progress
            if os.path.isfile(STATUS_FILE):
                try:
                    with open(STATUS_FILE, "r", encoding="utf-8") as f:
                        line = f.readline().strip()
                    if line and line != last_step_str:
                        last_step_str = line
                        parts = dict(kv.split("=") for kv in line.split("|") if "=" in kv)

                        ep   = parts.get("epoch", "?")
                        step = parts.get("step", "?")
                        pct  = parts.get("percent", "")
                        loss = parts.get("loss", "?")
                        lap  = parts.get("lap", "?")
                        sam  = parts.get("sam", "?")
                        vram = parts.get("vram", "?")
                        lr   = parts.get("lr", "?")

                        msg = (f"[{get_timestamp()}] Epoch {ep:<5} | Batch {step:<9} ({pct:>3}) | "
                               f"Loss: {loss:<6} (Edge/Lap: {lap:<6} | SAM: {sam:<6}) | "
                               f"VRAM: {vram:<5} | LR: {lr}")
                        print(msg, flush=True)
                except Exception:
                    pass

            time.sleep(1.5)

        except KeyboardInterrupt:
            print(f"\n[{get_timestamp()}] Stream stopped.")
            break

if __name__ == "__main__":
    main()
