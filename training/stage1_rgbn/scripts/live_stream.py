"""
Live Line-by-Line Terminal Streamer for Stage 1 RGBN Super-Resolution Training.

Prints every batch step in real time line-by-line as training progresses,
without clearing the screen.

Usage:
    python scripts/live_stream.py
"""
import os, sys, time, csv, datetime

STATUS_FILE = r"D:\stage1_rgbn\results\live_status.txt"
CSV_FILE    = r"D:\stage1_rgbn\results\training_log.csv"

def get_timestamp():
    return datetime.datetime.now().strftime("%H:%M:%S")

def main():
    print("=" * 90)
    print("    STAGE 1 RGBN TRAINING - LIVE REAL-TIME LINE-BY-LINE STREAM")
    print("    (Showing continuous batch-by-batch progress without clearing screen)")
    print("=" * 90)
    print(f"[{get_timestamp()}] Waiting for live training feed...")

    last_step_str = None
    last_completed_epochs = 0

    # Read existing completed epochs count
    if os.path.isfile(CSV_FILE):
        try:
            with open(CSV_FILE, "r", encoding="utf-8") as f:
                last_completed_epochs = max(0, len(list(csv.reader(f))) - 1)
        except Exception:
            pass

    while True:
        try:
            # 1. Check for newly completed epoch in CSV
            if os.path.isfile(CSV_FILE):
                try:
                    with open(CSV_FILE, "r", encoding="utf-8") as f:
                        rows = list(csv.DictReader(f))
                        if len(rows) > last_completed_epochs:
                            for r in rows[last_completed_epochs:]:
                                ep = r.get("epoch", "?")
                                p = r.get("val_psnr", "?")
                                s = r.get("val_ssim", "?")
                                l = r.get("train_loss", "?")
                                t = r.get("time_min", "?")
                                print("\n" + "=" * 90)
                                print(f"[{get_timestamp()}] >>> EPOCH {ep} COMPLETED! <<<")
                                print(f"  Train Loss: {l} | Val PSNR: {p} dB | Val SSIM: {s} | Time: {t}m")
                                print("=" * 90 + "\n", flush=True)
                            last_completed_epochs = len(rows)
                except Exception:
                    pass

            # 2. Check for live step progress
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
                        chb  = parts.get("charb", "?")
                        sam  = parts.get("sam", "?")
                        vram = parts.get("vram", "?")
                        lr   = parts.get("lr", "?")

                        msg = (f"[{get_timestamp()}] Epoch {ep:<5} | Batch {step:<7} ({pct:>3}) | "
                               f"Loss: {loss:<6} (Charb: {chb:<6} | SAM: {sam:<6}) | "
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
