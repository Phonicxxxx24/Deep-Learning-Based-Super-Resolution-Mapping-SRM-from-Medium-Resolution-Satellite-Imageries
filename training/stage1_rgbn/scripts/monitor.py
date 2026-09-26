"""
Live CMD Terminal Dashboard for Training Monitoring (Windows CMD cp1252 Safe)

Usage:
    python scripts/monitor.py
"""
import os, sys, time, csv, re, subprocess

CSV_FILE = r"D:\stage1_rgbn\results\training_log.csv"
STATUS_FILE = r"D:\stage1_rgbn\results\live_status.txt"

def get_gpu_info():
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.used,memory.total,utilization.gpu,temperature.gpu",
             "--format=csv,noheader,nounits"],
            encoding="utf-8"
        ).strip().split(",")
        return {
            "mem_used": out[0].strip(),
            "mem_total": out[1].strip(),
            "util": out[2].strip(),
            "temp": out[3].strip()
        }
    except Exception:
        return {"mem_used": "?", "mem_total": "?", "util": "?", "temp": "?"}

def read_live_status():
    if not os.path.isfile(STATUS_FILE):
        return None
    try:
        with open(STATUS_FILE, "r", encoding="utf-8") as f:
            line = f.readline().strip()
        if not line:
            return None
        parts = dict(kv.split("=") for kv in line.split("|") if "=" in kv)
        return parts
    except Exception:
        return None

def read_csv_logs():
    if not os.path.isfile(CSV_FILE):
        return []
    rows = []
    try:
        with open(CSV_FILE, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                if r and r.get("epoch"):
                    rows.append(r)
    except Exception:
        pass
    return rows

def render():
    os.system("cls" if os.name == "nt" else "clear")
    gpu = get_gpu_info()
    live = read_live_status()
    rows = read_csv_logs()

    print("=" * 80)
    print("        STAGE 1 RGBN SUPER-RESOLUTION - LIVE TRAINING MONITOR")
    print(f"        GPU Load: {gpu['util']}% | VRAM: {gpu['mem_used']} / {gpu['mem_total']} MB | Temp: {gpu['temp']} C")
    print("=" * 80)

    if live:
        print("\n  [LIVE BATCH TRAINING IN PROGRESS]")
        print(f"  Current Epoch  : {live.get('epoch', '?')}")
        print(f"  Batch Progress : {live.get('step', '?')} ({live.get('percent', '?')})")
        print(f"  Current Loss   : {live.get('loss', '?')}  (Charbonnier: {live.get('charb', '?')} | SAM: {live.get('sam', '?')})")
        print(f"  VRAM / LR      : {live.get('vram', '?')} | {live.get('lr', '?')}")
        print(f"  Status         : Actively computing forward/backward passes on GPU\n")
    else:
        print("\n  [Initializing training pipeline / warming up GPU...]\n")

    print("-" * 80)
    if rows:
        latest = rows[-1]
        try:
            best_psnr = max([float(r["val_psnr"]) for r in rows if "val_psnr" in r and r["val_psnr"]])
            best_ssim = max([float(r["val_ssim"]) for r in rows if "val_ssim" in r and r["val_ssim"]])
        except Exception:
            best_psnr, best_ssim = 0.0, 0.0
        print(f"  Last Completed Epoch: {latest.get('epoch', '?')} / 50")
        print(f"  Epoch Train Loss    : {latest.get('train_loss', '?')}")
        print(f"  Val PSNR            : {latest.get('val_psnr', '?')} dB  (Best: {best_psnr:.3f} dB)")
        print(f"  Val SSIM            : {latest.get('val_ssim', '?')}  (Best: {best_ssim:.4f})")
        print(f"  Epoch Duration      : {latest.get('time_min', '?')} min")
        print("-" * 80)
        print(f"  {'Epoch':<7} | {'Loss':<10} | {'Val PSNR':<12} | {'Val SSIM':<10} | {'LR':<10} | {'Time':<8}")
        print("  " + "-" * 68)
        for r in rows[-10:]:
            print(f"  {r.get('epoch',''):<7} | {r.get('train_loss',''):<10} | {r.get('val_psnr',''):<12} | {r.get('val_ssim',''):<10} | {r.get('lr',''):<10} | {r.get('time_min','')}m")
    else:
        print("  [Epoch 1 in progress (~12 mins) -- metrics table will appear upon Epoch 1 validation]")
    print("=" * 80)
    print("  [Auto-refreshes every 3s | Press Ctrl+C to exit]")

def main():
    while True:
        try:
            render()
            time.sleep(3)
        except KeyboardInterrupt:
            print("\nExiting monitor.")
            break

if __name__ == "__main__":
    main()
