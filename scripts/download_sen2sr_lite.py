"""
Script to download SEN2SRLite model weights and MLM metadata from HuggingFace.
Downloads directly into model/SEN2SRLite/ so they are packaged into the repository
and Docker container for zero-network startup on Railway.
"""
import os
import sys
import urllib.request
import json

BASE_URL = "https://huggingface.co/tacofoundation/SEN2SR/resolve/main/SEN2SRLite/main"
TARGET_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "model", "SEN2SRLite")

FILES_TO_DOWNLOAD = [
    "mlm.json",
    "model.safetensor",
    "hard_constraint.safetensor",
    "load.py",
    "sr_model.safetensor",
    "sr_hard_constraint.safetensor",
    "f2_model.safetensor",
    "f2_hard_constraint.safetensor",
]

def download_file(url: str, dest_path: str):
    print(f"Downloading {os.path.basename(dest_path)} from {url}...")
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp, open(dest_path, "wb") as f:
        total = int(resp.headers.get("content-length", 0))
        downloaded = 0
        chunk_size = 64 * 1024
        while True:
            chunk = resp.read(chunk_size)
            if not chunk:
                break
            f.write(chunk)
            downloaded += len(chunk)
            if total > 0:
                percent = downloaded / total * 100
                sys.stdout.write(f"\r  -> {downloaded / 1024 / 1024:.2f}MB / {total / 1024 / 1024:.2f}MB ({percent:.1f}%)")
            else:
                sys.stdout.write(f"\r  -> {downloaded / 1024 / 1024:.2f}MB")
            sys.stdout.flush()
    print("\n  -> Done.")

def main():
    os.makedirs(TARGET_DIR, exist_ok=True)
    print(f"Target directory: {TARGET_DIR}")

    for filename in FILES_TO_DOWNLOAD:
        dest_path = os.path.join(TARGET_DIR, filename)
        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
            print(f"File {filename} already exists ({os.path.getsize(dest_path)} bytes). Skipping.")
            continue
        url = f"{BASE_URL}/{filename}"
        try:
            download_file(url, dest_path)
        except Exception as e:
            print(f"Failed to download {filename}: {e}", file=sys.stderr)
            if os.path.exists(dest_path):
                os.remove(dest_path)
            raise e

    print("All SEN2SRLite model assets downloaded successfully!")

if __name__ == "__main__":
    main()
