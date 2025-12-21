// =============================================
// LAZER-BENZERİ GÖRÜNTÜ İŞLEME MODÜLÜ
// Industrial-grade barcode detection
// =============================================

class LaserImageProcessor {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.processedCanvas = document.createElement('canvas');
        this.processedCtx = this.processedCanvas.getContext('2d', { willReadFrequently: true });

        // Lazer tarama parametreleri
        this.scanLineHeight = 3; // Lazer çizgi yüksekliği (piksel)
        this.scanAngles = [0, 15, -15, 30, -30]; // Çoklu açı tarama
        this.contrastFactor = 1.8; // Kontrast çarpanı
        this.sharpnessFactor = 1.5; // Keskinlik çarpanı
    }

    // Video frame'i yakala ve canvas'a çiz
    captureFrame(video) {
        if (!video || video.readyState < 2) return null;

        const width = video.videoWidth;
        const height = video.videoHeight;

        if (width === 0 || height === 0) return null;

        this.canvas.width = width;
        this.canvas.height = height;
        this.processedCanvas.width = width;
        this.processedCanvas.height = height;

        this.ctx.drawImage(video, 0, 0, width, height);
        return this.ctx.getImageData(0, 0, width, height);
    }

    // =============================================
    // LAZER ÇİZGİ ÇIKARMA (Scan Line Extraction)
    // Endüstriyel lazer tarayıcı gibi çalışır
    // =============================================

    extractScanLines(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const centerY = Math.floor(height / 2);
        const scanRegions = [];

        // Merkez ve çevre bölgelerden lazer çizgileri çıkar
        const offsets = [0, -50, 50, -100, 100, -150, 150];

        offsets.forEach(offset => {
            const y = Math.max(0, Math.min(height - this.scanLineHeight, centerY + offset));
            const lineData = new ImageData(width, this.scanLineHeight);

            for (let row = 0; row < this.scanLineHeight; row++) {
                for (let x = 0; x < width; x++) {
                    const srcIdx = ((y + row) * width + x) * 4;
                    const dstIdx = (row * width + x) * 4;
                    lineData.data[dstIdx] = imageData.data[srcIdx];
                    lineData.data[dstIdx + 1] = imageData.data[srcIdx + 1];
                    lineData.data[dstIdx + 2] = imageData.data[srcIdx + 2];
                    lineData.data[dstIdx + 3] = 255;
                }
            }
            scanRegions.push({ y, data: lineData });
        });

        return scanRegions;
    }

    // =============================================
    // GRİ TONLAMA DÖNÜŞÜMÜ
    // =============================================

    toGrayscale(imageData) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            // Luminosity method (daha doğru gri ton)
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
        return imageData;
    }

    // =============================================
    // KONTRAST ARTIRMA (Lazer keskinliği için kritik)
    // =============================================

    enhanceContrast(imageData, factor = this.contrastFactor) {
        const data = imageData.data;
        const intercept = 128 * (1 - factor);

        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, Math.min(255, factor * data[i] + intercept));
            data[i + 1] = Math.max(0, Math.min(255, factor * data[i + 1] + intercept));
            data[i + 2] = Math.max(0, Math.min(255, factor * data[i + 2] + intercept));
        }
        return imageData;
    }

    // =============================================
    // KESKİNLEŞTİRME (Sharpen - Barkod kenarları için)
    // =============================================

    sharpen(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const src = imageData.data;
        const output = new Uint8ClampedArray(src);

        // Sharpen kernel (Laplacian)
        const kernel = [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                            sum += src[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                        }
                    }
                    const idx = (y * width + x) * 4 + c;
                    output[idx] = Math.max(0, Math.min(255, sum));
                }
            }
        }

        imageData.data.set(output);
        return imageData;
    }

    // =============================================
    // OTSU THRESHOLDİNG (Adaptif eşikleme)
    // Lazer tarayıcıların siyah-beyaz dönüşümü
    // =============================================

    otsuThreshold(imageData) {
        const data = imageData.data;
        const histogram = new Array(256).fill(0);

        // Histogram oluştur
        for (let i = 0; i < data.length; i += 4) {
            histogram[data[i]]++;
        }

        const total = data.length / 4;
        let sum = 0;
        for (let i = 0; i < 256; i++) {
            sum += i * histogram[i];
        }

        let sumB = 0;
        let wB = 0;
        let wF = 0;
        let maxVariance = 0;
        let threshold = 128;

        // Otsu algoritması
        for (let t = 0; t < 256; t++) {
            wB += histogram[t];
            if (wB === 0) continue;

            wF = total - wB;
            if (wF === 0) break;

            sumB += t * histogram[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;

            const variance = wB * wF * (mB - mF) * (mB - mF);
            if (variance > maxVariance) {
                maxVariance = variance;
                threshold = t;
            }
        }

        // Eşikleme uygula
        for (let i = 0; i < data.length; i += 4) {
            const val = data[i] < threshold ? 0 : 255;
            data[i] = data[i + 1] = data[i + 2] = val;
        }

        return imageData;
    }

    // =============================================
    // MORFOLOJİK İŞLEMLER (Gürültü azaltma)
    // =============================================

    morphologicalClean(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const temp = new Uint8ClampedArray(data);

        // Erosion + Dilation (Opening) - Küçük gürültüleri temizle
        // Basitleştirilmiş versiyon
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;

                // 3x3 komşuluk kontrolü
                let blackCount = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nIdx = ((y + dy) * width + (x + dx)) * 4;
                        if (temp[nIdx] === 0) blackCount++;
                    }
                }

                // Çoğunluk kuralı
                if (blackCount >= 5) {
                    data[idx] = data[idx + 1] = data[idx + 2] = 0;
                } else {
                    data[idx] = data[idx + 1] = data[idx + 2] = 255;
                }
            }
        }

        return imageData;
    }

    // =============================================
    // TAM LAZER İŞLEME PİPELINE
    // =============================================

    processForLaserScan(video) {
        const startTime = performance.now();

        // 1. Frame yakala
        const original = this.captureFrame(video);
        if (!original) return null;

        // 2. Kopyala (orijinali korumak için)
        const imageData = new ImageData(
            new Uint8ClampedArray(original.data),
            original.width,
            original.height
        );

        // 3. Lazer işleme pipeline
        this.toGrayscale(imageData);
        this.enhanceContrast(imageData, 2.0); // Güçlü kontrast
        this.sharpen(imageData);
        this.otsuThreshold(imageData);
        this.morphologicalClean(imageData);

        // 4. İşlenmiş görüntüyü canvas'a yaz
        this.processedCtx.putImageData(imageData, 0, 0);

        const processTime = performance.now() - startTime;
        if (processTime > 50) {
            console.log(`⚡ Lazer işleme: ${processTime.toFixed(1)}ms`);
        }

        return {
            canvas: this.processedCanvas,
            imageData: imageData,
            processingTime: processTime
        };
    }

    // =============================================
    // HIZLI LAZER TARAMA (Sadece merkez şerit)
    // Performans kritik durumlar için
    // =============================================

    fastLaserScan(video) {
        const original = this.captureFrame(video);
        if (!original) return null;

        const width = original.width;
        const height = original.height;

        // Sadece merkez %30'luk bölgeyi işle (lazer şerit)
        const stripHeight = Math.floor(height * 0.3);
        const startY = Math.floor((height - stripHeight) / 2);

        // Merkez şeridi çıkar
        const stripCanvas = document.createElement('canvas');
        stripCanvas.width = width;
        stripCanvas.height = stripHeight;
        const stripCtx = stripCanvas.getContext('2d');

        // Video'dan doğrudan merkez şeridi al
        stripCtx.drawImage(
            video,
            0, startY, width, stripHeight,  // Kaynak
            0, 0, width, stripHeight         // Hedef
        );

        const stripData = stripCtx.getImageData(0, 0, width, stripHeight);

        // Hızlı işleme
        this.toGrayscale(stripData);
        this.enhanceContrast(stripData, 2.2);
        this.otsuThreshold(stripData);

        stripCtx.putImageData(stripData, 0, 0);

        return {
            canvas: stripCanvas,
            imageData: stripData,
            isStrip: true,
            stripY: startY
        };
    }

    // =============================================
    // ÇOKLU AÇI TARAMA (45° döndürülmüş barkodlar için)
    // =============================================

    multiAngleScan(video) {
        const frames = [];

        // Orijinal
        const original = this.processForLaserScan(video);
        if (original) frames.push({ angle: 0, ...original });

        // Döndürülmüş versiyonlar (performans için opsiyonel)
        // Bu özellik gerekirse aktifleştirilebilir

        return frames;
    }

    // =============================================
    // BARKOD BÖLGESİ TESPİTİ
    // =============================================

    detectBarcodeRegion(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        // Dikey gradyan analizi - barkod çubukları dikey gradyan üretir
        const gradients = new Float32Array(width);

        for (let x = 1; x < width - 1; x++) {
            let totalGradient = 0;
            for (let y = 0; y < height; y++) {
                const idx = (y * width + x) * 4;
                const left = data[(y * width + x - 1) * 4];
                const right = data[(y * width + x + 1) * 4];
                totalGradient += Math.abs(right - left);
            }
            gradients[x] = totalGradient / height;
        }

        // Yüksek gradyan bölgesini bul
        let maxGradient = 0;
        let maxX = width / 2;
        const windowSize = 50;

        for (let x = windowSize; x < width - windowSize; x++) {
            let windowSum = 0;
            for (let i = -windowSize; i <= windowSize; i++) {
                windowSum += gradients[x + i];
            }
            if (windowSum > maxGradient) {
                maxGradient = windowSum;
                maxX = x;
            }
        }

        return {
            centerX: maxX,
            confidence: maxGradient / (255 * windowSize * 2),
            hasBarcode: maxGradient > 1000
        };
    }
}

// Global instance
window.LaserImageProcessor = LaserImageProcessor;
window.laserProcessor = new LaserImageProcessor();

console.log('🔴 Lazer Görüntü İşleme Modülü yüklendi');
