# Beyond Pixels — Reference Links and Bibliography

This document provides a comprehensive, curated collection of reference links, research papers, datasets, and technical documentation used to design, train, evaluate, and build the **Beyond Pixels** Super-Resolution Mapping (SRM) project.

---

## 1. Deep Learning Architectures & Super-Resolution

* **RRDB / ESRGAN (Core Architecture for Sen2SR_RGBN)**
  * *Paper*: Wang, X., Yu, K., Wu, S., Gu, J., Liu, Y., Dong, C., Qiao, Y., & Change Loy, C. (2018). *ESRGAN: Enhanced Super-Resolution Generative Adversarial Networks*. ECCV Workshops.
  * *Link*: [https://arxiv.org/abs/1809.00219](https://arxiv.org/abs/1809.00219)
  * *Role in Project*: Basis of our 8-block Residual-in-Residual Dense Network (`Sen2SR_RGBN`) providing high-frequency feature reuse without batch normalization artifacts.

* **Sub-Pixel Convolution / PixelShuffle (Upsampling Method)**
  * *Paper*: Shi, W., Caballero, J., Huszár, F., Totz, J., Aitken, A. P., Bishop, R., Rueckert, D., & Wang, Z. (2016). *Real-Time Single Image and Video Super-Resolution Using an Efficient Sub-Pixel Convolutional Neural Network*. CVPR.
  * *Link*: [https://arxiv.org/abs/1609.05158](https://arxiv.org/abs/1609.05158)
  * *Role in Project*: 2-stage PixelShuffle ($2\times \times 2\times$) upsampling that eliminates checkerboard artifacts.

* **Residual Dense Network (RDN)**
  * *Paper*: Zhang, Y., Tian, Y., Kong, Y., Zhong, B., & Fu, Y. (2018). *Residual Dense Network for Image Super-Resolution*. CVPR.
  * *Link*: [https://arxiv.org/abs/1802.08797](https://arxiv.org/abs/1802.08797)
  * *Role in Project*: Architectural foundation of the individual RDB blocks inside each RRDB stage.

* **ESA OpenSR / SEN2SRLite & OpenSR Framework**
  * *Paper / Tool*: Aybar, C., et al. (ESA $\Phi$-lab). *OpenSR: An Open-Source Framework for Super-Resolution in Remote Sensing*.
  * *Code Repository*: [https://github.com/ESAOpenSR/opensr-model](https://github.com/ESAOpenSR/opensr-model)
  * *Benchmark Suite*: [https://github.com/ESAOpenSR/opensr-test](https://github.com/ESAOpenSR/opensr-test)
  * *Role in Project*: Provides pre-trained `SEN2SRLite` for 10-band SWIR inference, Fourier HardConstraint implementation, and real benchmark ground-truth pairs.

* **Latent Diffusion Models for Satellite Super-Resolution (LDSR-S2 Baseline)**
  * *Paper*: Rombach, R., Blattmann, A., Lorenz, D., Esser, P., & Ommer, B. (2022). *High-Resolution Image Synthesis with Latent Diffusion Models*. CVPR.
  * *Link*: [https://arxiv.org/abs/2112.10752](https://arxiv.org/abs/2112.10752)
  * *Role in Project*: Used as the heavy diffusion benchmark baseline (`opensr-ldsrs2_v1_0_0.ckpt`) in our quantitative comparisons.

* **SwinIR (Evaluated Alternative)**
  * *Paper*: Liang, J., Cao, J., Sun, G., Zhang, K., Van Gool, L., & Timofte, R. (2021). *SwinIR: Image Restoration Using Swin Transformer*. ICCV Workshops.
  * *Link*: [https://arxiv.org/abs/2108.10257](https://arxiv.org/abs/2108.10257)
  * *Role in Project*: Benchmark candidate tested during architectural exploration.

---

## 2. Satellite Missions, Remote Sensing & Datasets

* **Copernicus Sentinel-2 Mission (ESA)**
  * *Official Guide*: [ESA Sentinel-2 User Handbook](https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-2)
  * *Data Access*: [Copernicus Data Space Ecosystem (CDSE)](https://dataspace.copernicus.eu/)
  * *Product Spec*: Sentinel-2 Level-2A Bottom-of-Atmosphere (BOA) Reflectance with SCL scene classification.
  * *Role in Project*: Primary input satellite imagery (10 m GSD for visible/NIR, 20 m for RedEdge/SWIR).

* **SEN2NAIP v2 Dataset (Training Dataset)**
  * *Host*: Hugging Face Datasets (`aliFerdinand/SEN2NAIPv2`)
  * *Link*: [https://huggingface.co/datasets/aliFerdinand/SEN2NAIPv2](https://huggingface.co/datasets/aliFerdinand/SEN2NAIPv2)
  * *Role in Project*: ~100 GB dataset of paired Sentinel-2 (10 m) and NAIP aerial imagery (~2.5 m) across the US used to train `Sen2SR_RGBN`.

* **USDA National Agriculture Imagery Program (NAIP)**
  * *Official Portal*: [USDA Aerial Photography Field Office - NAIP](https://www.fsa.usda.gov/programs-and-services/aerial-photography/imagery-programs/naip-imagery/)
  * *Role in Project*: High-resolution aerial reference source for ground-truth spatial resolution.

* **SPOT-6 / SPOT-7 Satellite Imagery (Airbus Defence and Space)**
  * *Technical Specifications*: [Airbus Intelligence SPOT 6/7](https://www.intelligence-airbusds.com/imagery/constellation/spot-6-7/)
  * *Role in Project*: Real commercial 1.5 m / 2.5 m satellite imagery used as the out-of-distribution ground-truth benchmark in `opensr-test`.

* **Microsoft Planetary Computer STAC API**
  * *Portal*: [https://planetarycomputer.microsoft.com/](https://planetarycomputer.microsoft.com/)
  * *Role in Project*: STAC catalog used to dynamically search and fetch cloud-free Sentinel-2 L2A tiles for arbitrary global bounding boxes.

---

## 3. Loss Functions, Consistency & Evaluation Metrics

* **Spectral Angle Mapper (SAM)**
  * *Paper*: Kruse, F. A., et al. (1993). *The Spectral Angle Mapper (SAM) - A Automated Spectral Method for Comparing Imaging Spectrometer Data to Laboratory and Field Spectra*.
  * *NASA Link*: [https://ntrs.nasa.gov/citations/19940012328](https://ntrs.nasa.gov/citations/19940012328)
  * *Role in Project*: Multi-component loss term $\mathcal{L}_{SAM}$ preserving spectral angles and band ratios.

* **Structural Similarity Index (SSIM)**
  * *Paper*: Wang, Z., Bovik, A. C., Sheikh, H. R., & Simoncelli, E. P. (2004). *Image quality assessment: from error visibility to structural similarity*. IEEE Transactions on Image Processing, 13(4), 600-612.
  * *Link*: [https://doi.org/10.1109/TIP.2003.819861](https://doi.org/10.1109/TIP.2003.819861)
  * *Role in Project*: Structural fidelity metric for spatial benchmarking.

* **ERGAS (Relative Dimensionless Global Error in Synthesis)**
  * *Paper*: Wald, L. (2002). *Data Fusion: Definitions and Architectures - An Overview to the Most Common Methods*.
  * *Role in Project*: Standard remote-sensing metric assessing global radiometric quality across multispectral bands.

* **LPIPS (Learned Perceptual Image Patch Similarity)**
  * *Paper*: Zhang, R., Isola, P., Efros, A. A., Shechtman, E., & Wang, O. (2018). *The Unreasonable Effectiveness of Deep Features as a Perceptual Metric*. CVPR.
  * *Link*: [https://arxiv.org/abs/1801.03924](https://arxiv.org/abs/1801.03924)
  * *Role in Project*: Perceptual evaluation of fine road/building textures.

* **AdamW Optimizer**
  * *Paper*: Loshchilov, I., & Hutter, F. (2019). *Decoupled Weight Decay Regularization*. ICLR.
  * *Link*: [https://arxiv.org/abs/1711.05101](https://arxiv.org/abs/1711.05101)
  * *Role in Project*: Primary optimizer used for both Phase 1 (warm-up) and Phase 2 (fine-tuning).

---

## 4. Downstream Spectral Remote Sensing Indices

* **NDVI (Normalized Difference Vegetation Index)**
  * *Paper*: Rouse, J. W., Haas, R. H., Schell, J. A., & Deering, D. W. (1974). *Monitoring the vernal advancement and retrogradation (Green wave effect) of natural vegetation*. NASA/GSFC Type III Final Report.
  * *Formula*: $\text{NDVI} = \frac{\text{B08 (NIR)} - \text{B04 (Red)}}{\text{B08 (NIR)} + \text{B04 (Red)}}$

* **NDWI (Normalized Difference Water Index)**
  * *Paper*: McFeeters, S. K. (1996). *The use of the Normalized Difference Water Index (NDWI) in the delineation of open water features*. International Journal of Remote Sensing, 17(7), 1425-1432.
  * *Link*: [https://doi.org/10.1080/01431169608948714](https://doi.org/10.1080/01431169608948714)
  * *Formula*: $\text{NDWI} = \frac{\text{B03 (Green)} - \text{B08 (NIR)}}{\text{B03 (Green)} + \text{B08 (NIR)}}$

* **NDRE (Normalized Difference Red Edge Index)**
  * *Application*: Chlorophyll concentration and canopy health mapping using Sentinel-2 Red Edge band B05.
  * *Formula*: $\text{NDRE} = \frac{\text{B08 (NIR)} - \text{B05 (RedEdge)}}{\text{B08 (NIR)} + \text{B05 (RedEdge)}}$

* **BSI (Bare Soil Index)**
  * *Formula*: $\text{BSI} = \frac{(\text{B11} + \text{B04}) - (\text{B08} + \text{B02})}{(\text{B11} + \text{B04}) + (\text{B08} + \text{B02})}$

---

## 5. Software Frameworks & Geospatial Libraries

| Framework / Library | Documentation / URL | Purpose in Project |
|---|---|---|
| **PyTorch** | [https://pytorch.org/](https://pytorch.org/) | Deep learning model definition, training loop, and CUDA tensor execution |
| **Rasterio / GDAL** | [https://rasterio.readthedocs.io/](https://rasterio.readthedocs.io/) | Geospatial raster I/O, GeoTIFF generation, CRS reprojection |
| **Cubo** | [https://github.com/ESAC-Telework/cubo](https://github.com/ESAC-Telework/cubo) | On-demand EO data cube retrieval from Microsoft Planetary Computer |
| **PySTAC & PySTAC-Client** | [https://pystac-client.readthedocs.io/](https://pystac-client.readthedocs.io/) | Querying SpatioTemporal Asset Catalogs (STAC) for Sentinel-2 tiles |
| **FastAPI** | [https://fastapi.tiangolo.com/](https://fastapi.tiangolo.com/) | Asynchronous REST API serving SR inference, queue management, benchmarks |
| **Next.js** | [https://nextjs.org/](https://nextjs.org/) | React-based frontend web app with interactive mapping and dashboard |
| **MapLibre GL / Leaflet** | [https://maplibre.org/](https://maplibre.org/) | Interactive geospatial map UI for selecting AOI bounding boxes |
| **Kornia** | [https://kornia.readthedocs.io/](https://kornia.readthedocs.io/) | Differentiable computer vision in PyTorch (Laplacian, Sobel operators) |
