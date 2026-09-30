# ==============================================================================
# SRM (Super-Resolution Mapping) - Production Backend Dockerfile
# Optimized for Railway, Render, Fly.io, and Local Docker Containers
# ==============================================================================

FROM python:3.11-slim

# Prevent Python from writing .pyc files and ensure unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=8000 \
    DATA_DIR=/app/data \
    OUTPUT_DIR=/app/outputs

WORKDIR /app

# Install OS libraries for geospatial raster processing and OpenCV/Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libgdal-dev \
    gdal-bin \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU wheels (compact, fast container builds, runs reliably on any cloud VM)
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Copy dependencies definition
COPY requirements.txt pyproject.toml ./

# Install core satellite, geospatial, and API dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source and model weights (~35MB total)
COPY srm/ ./srm/
COPY srm_api/ ./srm_api/
COPY model/ ./model/
COPY configs/ ./configs/
COPY vendor/ ./vendor/

# Install local package
RUN pip install --no-cache-dir -e .

# Create persistent storage directories for SQLite DB and generated outputs
RUN mkdir -p /app/data /app/outputs

# Expose default HTTP port
EXPOSE 8000

# Container health probe
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Start FastAPI backend with Uvicorn, binding dynamically to $PORT supplied by Railway
CMD ["sh", "-c", "uvicorn srm_api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
