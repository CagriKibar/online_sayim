// =============================================
// BARKOD STOK SAYIM - MAIN APPLICATION
// =============================================

class BarcodeStockApp {
    constructor() {
        this.products = [];
        this.html5QrcodeScanner = null;
        this.quaggaActive = false;
        this.isScanning = false;
        this.editingProduct = null;
        this.lastScanTime = 0;
        this.scanCooldown = 350;
        this.currentScanMode = 'optimize';
        this.currentModeConfig = null;
        this.audioContext = null; // Ses için

        // 🔴 LAZER TARAMA SİSTEMİ
        this.laserProcessor = null;
        this.laserScanInterval = null;
        this.videoTrack = null;
        this.videoElement = null;
        this.focusRecoveryTimer = null;
        this.lastSuccessfulScan = 0;
        this.laserMode = false;
        this.scanAttempts = 0;
        this.maxScanAttempts = 3; // Her frame için decoder deneme sayısı
        this.speedSliderInitialized = false;
        this.lastScannedBarcode = null; // Aynı barkod kontrolü
        this.lastBarcodeTime = 0;

        // Kayıtlı hız değerini yükle (slider: 50-200 -> interval: 200-50ms)
        const savedSpeed = parseInt(localStorage.getItem('laser_scan_speed')) || 100;
        this.laserScanIntervalMs = 250 - savedSpeed;

        this.init();
    }

    init() {
        this.loadFromStorage();
        this.bindEvents();
        this.renderProducts();
        this.updateStats();
        this.hideSplash();
        this.registerServiceWorker();
    }

    hideSplash() {
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            const app = document.getElementById('app');
            splash.classList.add('fade-out');
            app.classList.remove('hidden');
            setTimeout(() => splash.remove(), 500);
        }, 1800);
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(() => console.log('SW registered'))
                .catch(err => console.log('SW error:', err));
        }
    }

    bindEvents() {
        // Scanner controls
        document.getElementById('start-scan-btn').addEventListener('click', () => this.startScanning());
        document.getElementById('stop-scan-btn').addEventListener('click', () => this.stopScanning());

        // Manual entry
        document.getElementById('manual-add-btn').addEventListener('click', () => this.addManualEntry());
        document.getElementById('manual-barcode').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addManualEntry();
        });

        // Export
        document.getElementById('export-btn').addEventListener('click', () => this.exportToExcel());

        // Search
        document.getElementById('search-input').addEventListener('input', (e) => this.filterProducts(e.target.value));

        // Clear all modal
        document.getElementById('clear-all-btn').addEventListener('click', () => this.showDeleteModal());
        document.getElementById('cancel-delete').addEventListener('click', () => this.hideDeleteModal());
        document.getElementById('confirm-delete').addEventListener('click', () => this.clearAllProducts());
        document.querySelector('#delete-modal .modal-backdrop').addEventListener('click', () => this.hideDeleteModal());

        // Edit modal
        document.getElementById('close-edit-modal').addEventListener('click', () => this.hideEditModal());
        document.getElementById('save-edit-btn').addEventListener('click', () => this.saveEdit());
        document.getElementById('delete-product-btn').addEventListener('click', () => this.deleteCurrentProduct());
        document.getElementById('edit-increase').addEventListener('click', () => this.adjustEditQuantity(1));
        document.getElementById('edit-decrease').addEventListener('click', () => this.adjustEditQuantity(-1));
        document.querySelector('#edit-modal .modal-backdrop').addEventListener('click', () => this.hideEditModal());

        // Scan mode buttons
        document.querySelectorAll('.scan-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setScanMode(btn.dataset.mode));
        });

        // Initialize scan mode system
        this.initScanModeSystem();
    }

    // =============================================
    // SCAN MODE SYSTEM - iOS & Android Optimized
    // =============================================

    initScanModeSystem() {
        // Cihaz tespiti
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        this.isAndroid = /Android/.test(navigator.userAgent);

        // Varsayılan tarayıcı: standard (Html5Qrcode)
        this.currentScanner = 'html5'; // 'html5' veya 'quagga'

        // Cihaz tipini göster
        const deviceEl = document.getElementById('device-type');
        if (deviceEl) {
            if (this.isIOS) {
                deviceEl.textContent = '🍎 iOS';
                deviceEl.classList.add('ios');
            } else if (this.isAndroid) {
                deviceEl.textContent = '🤖 Android';
                deviceEl.classList.add('android');
            } else {
                deviceEl.textContent = '💻 Desktop';
            }
        }

        // Kaydedilmiş modu yükle veya varsayılan olarak "optimize" kullan
        const savedMode = localStorage.getItem('barcode_scan_mode') || 'optimize';
        this.setScanMode(savedMode);
    }

    // Platform-spesifik mod konfigürasyonları
    getScanModeConfig(mode) {
        // iOS için optimize edilmiş ayarlar
        const iosConfigs = {
            turbo: {
                fps: 30,
                cooldown: 200,
                resolution: { width: 1920, height: 1080 },
                qrbox: 280,
                info: '🚀 iOS Turbo - Maksimum hız, sürekli tarama'
            },
            optimize: {
                fps: 25,
                cooldown: 350,
                resolution: { width: 1920, height: 1080 },
                qrbox: 300,
                info: '⚡ iOS Optimize - Hız ve doğruluk dengesi (Önerilen)'
            },
            standart: {
                fps: 15,
                cooldown: 600,
                resolution: { width: 1280, height: 720 },
                qrbox: 320,
                info: '🎯 iOS Standart - Yüksek doğruluk, düşük pil tüketimi'
            }
        };

        // Android için optimize edilmiş ayarlar
        const androidConfigs = {
            turbo: {
                fps: 30,
                cooldown: 150,
                resolution: { width: 1920, height: 1080 },
                qrbox: 260,
                info: '🚀 Android Turbo - Ultra hızlı tarama'
            },
            optimize: {
                fps: 20,
                cooldown: 300,
                resolution: { width: 1920, height: 1080 },
                qrbox: 280,
                info: '⚡ Android Optimize - Dengeli performans (Önerilen)'
            },
            standart: {
                fps: 12,
                cooldown: 500,
                resolution: { width: 1280, height: 720 },
                qrbox: 300,
                info: '🎯 Android Standart - Hassas okuma modu'
            }
        };

        // Desktop/diğer cihazlar için
        const defaultConfigs = {
            turbo: {
                fps: 25,
                cooldown: 250,
                resolution: { width: 1920, height: 1080 },
                qrbox: 300,
                info: '🚀 Turbo - Hızlı tarama modu'
            },
            optimize: {
                fps: 20,
                cooldown: 400,
                resolution: { width: 1280, height: 720 },
                qrbox: 280,
                info: '⚡ Optimize - Dengeli mod (Önerilen)'
            },
            standart: {
                fps: 10,
                cooldown: 600,
                resolution: { width: 1280, height: 720 },
                qrbox: 300,
                info: '🎯 Standart - Hassas okuma'
            }
        };

        if (this.isIOS) {
            return iosConfigs[mode] || iosConfigs.optimize;
        } else if (this.isAndroid) {
            return androidConfigs[mode] || androidConfigs.optimize;
        } else {
            return defaultConfigs[mode] || defaultConfigs.optimize;
        }
    }

    setScanMode(mode) {
        this.currentScanMode = mode;

        // Tarayıcı tipini belirle (MSI için QuaggaJS, diğerleri için Html5Qrcode)
        if (mode === 'msi') {
            this.currentScanner = 'quagga';
        } else {
            this.currentScanner = 'html5';
        }

        // FPS ve Cooldown ayarları moda göre
        const modeSettings = {
            turbo: { fps: 30, cooldown: 200, info: '🚀 Turbo mod - Maksimum hız, sürekli tarama' },
            optimize: { fps: 25, cooldown: 300, info: '⚡ Optimize mod - Hız ve doğruluk dengesi (Önerilen)' },
            standart: { fps: 15, cooldown: 500, info: '🎯 Standart mod - En hassas okuma, düşük pil tüketimi' },
            msi: { fps: 15, cooldown: 400, info: '🏭 MSI mod - MSI, Codabar, I2of5, Code-39/93/128 destekli' },
            lazer: { fps: 30, cooldown: 150, info: '🔴 LAZER mod - Endüstriyel güç, görüntü işleme destekli' }
        };

        const settings = modeSettings[mode] || modeSettings.optimize;
        this.currentModeConfig = { fps: settings.fps };
        this.scanCooldown = settings.cooldown;
        this.laserMode = (mode === 'lazer');

        // UI güncelle
        document.querySelectorAll('.scan-mode-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            }
        });

        // Info güncelle
        const infoEl = document.getElementById('scan-mode-info');
        if (infoEl) {
            infoEl.textContent = settings.info;
        }

        // 🔴 LAZER hız kontrolü göster/gizle
        const speedControl = document.getElementById('laser-speed-control');
        if (speedControl) {
            speedControl.style.display = this.laserMode ? 'block' : 'none';

            // Slider event listener (bir kere ekle)
            if (this.laserMode && !this.speedSliderInitialized) {
                this.initSpeedSlider();
                this.speedSliderInitialized = true;
            }
        }

        // Kaydet
        localStorage.setItem('barcode_scan_mode', mode);

        console.log(`📱 Mode: ${mode} | Scanner: ${this.currentScanner} | FPS: ${settings.fps} | Cooldown: ${this.scanCooldown}ms`);

        // Eğer tarama aktifse, yeniden başlat
        if (this.isScanning) {
            this.restartScanning();
        }
    }

    async restartScanning() {
        await this.stopScanning();
        setTimeout(() => this.startScanning(), 300);
    }

    async stopAllScanners() {
        // Html5Qrcode'u durdur
        if (this.html5QrcodeScanner) {
            try {
                await this.html5QrcodeScanner.stop();
            } catch (e) { }
            this.html5QrcodeScanner = null;
        }
        // QuaggaJS'i durdur
        this.stopQuaggaScanner();

        // 🔴 Lazer tarayıcıyı durdur
        this.stopLaserScanner();
    }

    // =============================================
    // QUAGGA JS - MSI, Codabar, I2of5 Desteği
    // =============================================

    startQuaggaScanner() {
        if (typeof Quagga === 'undefined') {
            console.log('QuaggaJS yüklenemedi');
            this.showToast('error', 'Hata', 'MSI kütüphanesi yüklenemedi');
            return;
        }

        const readerElement = document.getElementById('reader');
        if (!readerElement) return;

        // Quagga için video container oluştur
        readerElement.innerHTML = '<div id="quagga-container" style="width:100%;height:100%;"></div>';
        const quaggaContainer = document.getElementById('quagga-container');

        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: quaggaContainer,
                constraints: {
                    facingMode: "environment",
                    width: { min: 640, ideal: 1280, max: 1920 },
                    height: { min: 480, ideal: 720, max: 1080 },
                    aspectRatio: { min: 1, max: 2 }
                }
            },
            locator: {
                patchSize: "large", // Daha büyük = daha iyi algılama
                halfSample: false   // false = daha hassas
            },
            numOfWorkers: navigator.hardwareConcurrency || 4,
            frequency: 15, // Daha sık tarama
            decoder: {
                readers: [
                    "msi_reader",           // MSI / Modified Plessey
                    "codabar_reader",       // Codabar
                    "i2of5_reader",         // Interleaved 2 of 5
                    "code_128_reader",      // Code 128
                    "code_39_reader",       // Code 39
                    "ean_reader",           // EAN-13, EAN-8
                    "upc_reader",           // UPC-A, UPC-E
                    "code_93_reader"        // Code 93
                ],
                multiple: false // Tek barkod
            },
            locate: true,
            debug: false
        }, (err) => {
            if (err) {
                console.error('Quagga başlatılamadı:', err);
                this.showToast('error', 'Kamera Hatası', 'MSI modu başlatılamadı');
                return;
            }
            console.log('🏭 QuaggaJS aktif - MSI, Codabar, I2of5 desteği');
            Quagga.start();
            this.quaggaActive = true;
        });

        Quagga.onDetected((result) => this.onQuaggaDetected(result));
    }

    stopQuaggaScanner() {
        if (this.quaggaActive && typeof Quagga !== 'undefined') {
            try {
                Quagga.stop();
                this.quaggaActive = false;
                console.log('QuaggaJS durduruldu');
            } catch (e) {
                console.log('Quagga stop error:', e);
            }
        }
    }

    onQuaggaDetected(result) {
        if (!result || !result.codeResult) return;

        const barcode = result.codeResult.code;
        const format = result.codeResult.format;

        // Cooldown kontrolü
        const now = Date.now();
        if (now - this.lastScanTime < this.scanCooldown) return;

        console.log(`📦 Quagga okuma: ${barcode} (${format})`);
        this.onScanSuccess(barcode);
    }

    // =============================================
    // BARCODE SCANNING
    // =============================================

    async startScanning() {
        const container = document.getElementById('scanner-container');
        container.classList.add('active');

        document.getElementById('start-scan-btn').classList.add('hidden');
        document.getElementById('stop-scan-btn').classList.remove('hidden');

        // Önceki scanner'ları temizle
        await this.stopAllScanners();

        // MSI Mod için QuaggaJS kullan
        if (this.currentScanner === 'quagga') {
            console.log('🏭 QuaggaJS başlatılıyor - MSI Mod');
            this.startQuaggaScanner();
            this.isScanning = true;
            this.showToast('success', '🏭 MSI Mod Aktif', 'MSI, Codabar, I2of5 barkodları okunabilir');
            return;
        }

        // Standart mod için Html5Qrcode kullan
        try {
            // iOS/Apple cihaz tespiti
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

            console.log('📷 Html5Qrcode başlatılıyor - Standart Mod');

            // Kamera erişimi kontrolü
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Bu tarayıcı kamera erişimini desteklemiyor');
            }

            // 📷 YÜKSEK ÇÖZÜNÜRLÜK - Tüm barkod boyutları için optimize
            const videoConstraints = isIOS ? {
                facingMode: { ideal: 'environment' },
                // Yüksek çözünürlük: küçük ve ince barkodlar için kritik
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 },
                frameRate: { ideal: 60, min: 30 },
                // iOS için kritik optimizasyonlar
                advanced: [
                    { focusMode: 'continuous' },
                    { exposureMode: 'continuous' },
                    { whiteBalanceMode: 'continuous' },
                    { zoom: 1.5 } // Hafif zoom - uzak barkodlar için
                ]
            } : {
                facingMode: { ideal: 'environment' },
                // Android için de yüksek çözünürlük
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 },
                frameRate: { ideal: 30, min: 15 },
                advanced: [
                    { focusMode: 'continuous' }
                ]
            };

            // Önce kamera izni al ve iOS için stream'i hazırla
            let testStream;
            try {
                testStream = await navigator.mediaDevices.getUserMedia({
                    video: videoConstraints,
                    audio: false
                });

                // iOS için: Stream'i hemen kapatma, önce track ayarlarını kontrol et
                const videoTrack = testStream.getVideoTracks()[0];
                if (videoTrack) {
                    const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
                    const settings = videoTrack.getSettings();
                    console.log('Kamera özellikleri:', capabilities);
                    console.log('Kamera ayarları:', settings);

                    // iOS için otomatik odaklama ve pozlama
                    if (videoTrack.applyConstraints) {
                        try {
                            await videoTrack.applyConstraints({
                                advanced: [{ focusMode: 'continuous' }]
                            });
                        } catch (e) {
                            console.log('Odaklama ayarı uygulanamadı:', e);
                        }
                    }
                }

                testStream.getTracks().forEach(track => track.stop());
            } catch (permErr) {
                throw new Error('Kamera izni verilmedi');
            }

            this.html5QrcodeScanner = new Html5Qrcode("reader", {
                // iOS için gelişmiş ayarlar
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true // Native BarcodeDetector API kullan (çok daha hızlı!)
                },
                verbose: false
            });

            // 🎯 AKILLI TARAMA - Seçilen moda göre optimize
            // Mod config'inden değerleri al
            const modeConfig = this.currentModeConfig || this.getScanModeConfig('optimize');

            // 🔥 FULL SCREEN TARAMA - Tüm ekranı tara
            const scanConfig = {
                fps: modeConfig.fps,
                aspectRatio: 16 / 9,
                disableFlip: false,
                // TÜM DESTEKLENEN FORMATLAR - Html5Qrcode'un desteklediği her format
                formatsToSupport: [
                    // Ürün barkodları
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
                    // Endüstriyel 1D barkodlar
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.CODE_93,
                    Html5QrcodeSupportedFormats.CODABAR,  // ✅ Codabar aktif
                    Html5QrcodeSupportedFormats.ITF,
                    // GS1 DataBar (RSS)
                    Html5QrcodeSupportedFormats.RSS_14,
                    Html5QrcodeSupportedFormats.RSS_EXPANDED,
                    // 2D Barkodlar
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.DATA_MATRIX,
                    Html5QrcodeSupportedFormats.PDF_417,
                    Html5QrcodeSupportedFormats.AZTEC,
                    Html5QrcodeSupportedFormats.MAXICODE
                ]
                // ⚠️ NOT: MSI ve Pharmacode bu kütüphane tarafından DESTEKLENMİYOR
            };

            console.log(`🔥 FULL SCREEN Tarama - Mod: ${this.currentScanMode} | FPS: ${scanConfig.fps} | Tüm formatlar aktif`);

            // iOS için direkt facingMode kullan (kamera listesi yerine)
            if (isIOS) {
                console.log('🍎 iOS Mod Aktif');

                await this.html5QrcodeScanner.start(
                    { facingMode: "environment" },
                    scanConfig,
                    (decodedText) => this.onScanSuccess(decodedText),
                    () => { } // Hata callback'i boş - performans için
                );
            } else {
                // Android/Desktop için kamera listesi
                const cameras = await Html5Qrcode.getCameras();
                console.log('Bulunan kameralar:', cameras);

                if (!cameras || cameras.length === 0) {
                    throw new Error('Kamera bulunamadı');
                }

                // Arka kamerayı bul
                let cameraId = cameras[cameras.length - 1].id; // Varsayılan: son kamera
                for (const camera of cameras) {
                    const label = camera.label.toLowerCase();
                    if (label.includes('back') || label.includes('arka') ||
                        label.includes('rear') || label.includes('environment') ||
                        label.includes('wide') || label.includes('main')) {
                        cameraId = camera.id;
                        break;
                    }
                }

                console.log('Seçilen kamera:', cameraId);

                await this.html5QrcodeScanner.start(
                    cameraId,
                    scanConfig,
                    (decodedText) => this.onScanSuccess(decodedText),
                    () => { }
                );
            }

            this.isScanning = true;

            // iOS için ek optimizasyonlar: Tarama alanını highlighting
            this.optimizeScannerDOM();

            // 🔴 LAZER MOD - Gelişmiş görüntü işleme
            if (this.laserMode) {
                const container = document.getElementById('scanner-container');
                container.classList.add('laser-mode');

                // Video elementini bul ve lazer taramayı başlat
                const video = document.querySelector('#reader video');
                if (video) {
                    // Video hazır olduğunda lazer taramayı başlat
                    const startLaser = () => {
                        if (video.readyState >= 2) {
                            this.startLaserScanner(video);
                        } else {
                            video.addEventListener('loadeddata', () => this.startLaserScanner(video), { once: true });
                        }
                    };
                    setTimeout(startLaser, 500);
                }

                this.showToast('success', '🔴 LAZER MOD Aktif', 'Endüstriyel güç tarama başlatıldı');
            } else {
                // Normal mod - lazer class'ını kaldır
                const container = document.getElementById('scanner-container');
                container.classList.remove('laser-mode');

                this.showToast('success', '📷 Tarama Aktif', 'Tüm barkod formatları destekleniyor');
            }

        } catch (err) {
            console.error('Kamera hatası:', err);

            // Alternatif yöntem dene (fallback)
            try {
                console.log('Fallback yöntem deneniyor...');

                if (!this.html5QrcodeScanner) {
                    this.html5QrcodeScanner = new Html5Qrcode("reader");
                }

                // Gelişmiş fallback config - geniş tarama alanı
                await this.html5QrcodeScanner.start(
                    { facingMode: "environment" },
                    {
                        fps: 20,
                        qrbox: { width: 300, height: 150 }, // Daha geniş alan
                        formatsToSupport: [
                            Html5QrcodeSupportedFormats.EAN_13,
                            Html5QrcodeSupportedFormats.EAN_8,
                            Html5QrcodeSupportedFormats.UPC_A,
                            Html5QrcodeSupportedFormats.CODE_128,
                            Html5QrcodeSupportedFormats.CODE_39,
                            Html5QrcodeSupportedFormats.ITF,
                            Html5QrcodeSupportedFormats.QR_CODE
                        ]
                    },
                    (decodedText) => this.onScanSuccess(decodedText),
                    () => { }
                );

                this.isScanning = true;
                this.showToast('success', 'Kamera Açıldı', 'Barkodu tarama alanına getirin');

            } catch (fallbackErr) {
                console.error('Fallback hatası:', fallbackErr);
                this.showToast('error', 'Kamera Hatası', err.message || 'Kamera başlatılamadı');
                this.resetScannerUI();
            }
        }
    }

    // iOS için DOM optimizasyonu - rendering performansı
    optimizeScannerDOM() {
        const reader = document.getElementById('reader');
        const container = document.getElementById('scanner-container');

        // iOS tespiti
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        // Turbo mod göstergesi ekle
        if (container && isIOS) {
            container.classList.add('turbo-mode');
        }

        if (reader) {
            // Hardware acceleration
            reader.style.transform = 'translateZ(0)';
            reader.style.backfaceVisibility = 'hidden';
            reader.style.perspective = '1000px';
            reader.style.willChange = 'transform';

            // Video elementi için özel stiller
            const video = reader.querySelector('video');
            if (video) {
                video.style.transform = 'translateZ(0)';
                video.setAttribute('playsinline', 'true'); // iOS için kritik
                video.setAttribute('webkit-playsinline', 'true');
                video.setAttribute('muted', 'true');
                video.setAttribute('autoplay', 'true');

                // iOS Safari için video optimizasyonu
                video.style.objectFit = 'cover';
                video.style.willChange = 'transform';

                // iOS için ek optimizasyonlar
                if (isIOS) {
                    // Video kalitesi vs hız dengesi - hız öncelikli
                    video.style.imageRendering = 'crisp-edges';
                    video.style.webkitImageRendering = 'optimizeSpeed';
                }
            }
        }
    }

    resetScannerUI() {
        this.isScanning = false;
        document.getElementById('scanner-container').classList.remove('active');
        document.getElementById('start-scan-btn').classList.remove('hidden');
        document.getElementById('stop-scan-btn').classList.add('hidden');
    }

    async stopScanning() {
        // Html5Qrcode'u durdur
        if (this.html5QrcodeScanner && this.isScanning) {
            try {
                await this.html5QrcodeScanner.stop();
            } catch (err) {
                console.error('Stop error:', err);
            }
        }

        // QuaggaJS'i durdur
        this.stopQuaggaScanner();

        this.isScanning = false;
        document.getElementById('scanner-container').classList.remove('active');
        document.getElementById('start-scan-btn').classList.remove('hidden');
        document.getElementById('stop-scan-btn').classList.add('hidden');
    }

    onScanSuccess(barcode, decodedResult) {
        const now = Date.now();
        const trimmedBarcode = barcode.trim();

        // Cooldown kontrolü
        if (now - this.lastScanTime < this.scanCooldown) return;

        // 🔴 AYNI BARKOD KONTROLÜ - 3 saniye boyunca aynı barkodu tekrar okuma
        if (this.lastScannedBarcode === trimmedBarcode && (now - this.lastBarcodeTime) < 3000) {
            console.log(`⏳ Aynı barkod (${trimmedBarcode}) - 3 saniye bekle`);
            return;
        }

        this.lastScanTime = now;
        this.lastSuccessfulScan = now;
        this.lastScannedBarcode = trimmedBarcode;
        this.lastBarcodeTime = now;

        this.addProduct(trimmedBarcode);

        // 🎯 GÖRSEL GERİ BİLDİRİM - GÜÇLÜ
        const container = document.getElementById('scanner-container');
        container.classList.add('scan-success');

        // Barkod gösterge overlay'i ekle
        this.showBarcodeOverlay(barcode);

        setTimeout(() => container.classList.remove('scan-success'), 500);

        // Vibrate on success (iPhone için önemli)
        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]); // Daha güçlü titreşim
        }

        // Sesli geri bildirim
        this.playBeep();
    }

    // Başarılı okuma göstergesi - ekranda barkod göster
    showBarcodeOverlay(barcode) {
        // Varsa eskisini kaldır
        const existing = document.getElementById('barcode-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'barcode-overlay';
        overlay.innerHTML = `
            <div class="barcode-success-icon">✅</div>
            <div class="barcode-success-text">${barcode}</div>
        `;
        overlay.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 200, 0, 0.9);
            color: white;
            padding: 20px 30px;
            border-radius: 16px;
            font-size: 18px;
            font-weight: 700;
            text-align: center;
            z-index: 100;
            animation: barcodePopIn 0.3s ease, barcodePopOut 0.3s ease 0.7s forwards;
            box-shadow: 0 10px 40px rgba(0, 200, 0, 0.5);
            pointer-events: none;
        `;

        const container = document.getElementById('scanner-container');
        if (container) {
            container.appendChild(overlay);
            setTimeout(() => overlay.remove(), 1000);
        }
    }

    playBeep() {
        console.log('🔊 Ses çalınıyor...');
        try {
            // AudioContext oluştur
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
                console.log('AudioContext desteklenmiyor');
                return;
            }

            const audioContext = new AudioContext();

            // iOS/Safari için context'i resume et
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }

            const now = audioContext.currentTime;

            // BİP SESİ 1 - Yüksek ton
            const osc1 = audioContext.createOscillator();
            const gain1 = audioContext.createGain();
            osc1.connect(gain1);
            gain1.connect(audioContext.destination);
            osc1.frequency.value = 1800;
            osc1.type = 'square'; // square daha yüksek ses çıkarır
            gain1.gain.setValueAtTime(0.8, now); // Daha yüksek volume
            gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc1.start(now);
            osc1.stop(now + 0.1);

            // BİP SESİ 2 - Daha yüksek ton
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.frequency.value = 2400;
            osc2.type = 'square';
            gain2.gain.setValueAtTime(0.9, now + 0.12);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc2.start(now + 0.12);
            osc2.stop(now + 0.25);

            // Context'i temizle
            setTimeout(() => {
                audioContext.close().catch(() => { });
            }, 500);

            console.log('🔊 Ses çalındı!');
        } catch (e) {
            console.error('Ses hatası:', e);
        }
    }

    // =============================================
    // PRODUCT MANAGEMENT
    // =============================================

    addManualEntry() {
        const barcodeInput = document.getElementById('manual-barcode');
        const quantityInput = document.getElementById('manual-quantity');

        const barcode = barcodeInput.value.trim();
        const quantity = parseInt(quantityInput.value) || 1;

        if (!barcode) {
            this.showToast('error', 'Hata', 'Barkod numarası girin');
            return;
        }

        this.addProduct(barcode, quantity);

        barcodeInput.value = '';
        quantityInput.value = '1';
        barcodeInput.focus();
    }

    addProduct(barcode, quantity = 1) {
        const existingIndex = this.products.findIndex(p => p.barcode === barcode);

        if (existingIndex !== -1) {
            this.products[existingIndex].quantity += quantity;
            this.products[existingIndex].lastScan = new Date().toISOString();
            this.showToast('success', 'Stok Güncellendi', `${barcode} - Yeni miktar: ${this.products[existingIndex].quantity}`);
        } else {
            this.products.unshift({
                barcode,
                name: '',
                quantity,
                firstScan: new Date().toISOString(),
                lastScan: new Date().toISOString()
            });
            this.showToast('success', 'Yeni Ürün', `${barcode} eklendi`);
        }

        this.saveToStorage();
        this.renderProducts();
        this.updateStats();
        document.getElementById('last-scan').textContent = barcode.slice(-6);
    }

    updateProductQuantity(barcode, delta) {
        const product = this.products.find(p => p.barcode === barcode);
        if (!product) return;

        product.quantity = Math.max(1, product.quantity + delta);
        product.lastScan = new Date().toISOString();

        this.saveToStorage();
        this.renderProducts();
        this.updateStats();
    }

    deleteProduct(barcode) {
        this.products = this.products.filter(p => p.barcode !== barcode);
        this.saveToStorage();
        this.renderProducts();
        this.updateStats();
        this.showToast('success', 'Silindi', 'Ürün listeden kaldırıldı');
    }

    clearAllProducts() {
        this.products = [];
        this.saveToStorage();
        this.renderProducts();
        this.updateStats();
        this.hideDeleteModal();
        this.showToast('success', 'Temizlendi', 'Tüm veriler silindi');
    }

    // =============================================
    // UI RENDERING
    // =============================================

    renderProducts(filter = '') {
        const container = document.getElementById('product-list');
        const filtered = filter
            ? this.products.filter(p =>
                p.barcode.toLowerCase().includes(filter.toLowerCase()) ||
                (p.name && p.name.toLowerCase().includes(filter.toLowerCase()))
            )
            : this.products;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">${filter ? '🔍' : '📭'}</div>
                    <h3>${filter ? 'Sonuç bulunamadı' : 'Henüz ürün yok'}</h3>
                    <p>${filter ? 'Farklı bir arama deneyin' : 'Barkod tarayarak veya manuel girerek başlayın'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(product => `
            <div class="product-card" data-barcode="${product.barcode}">
                <div class="product-icon">📦</div>
                <div class="product-info">
                    <div class="product-barcode">${product.barcode}</div>
                    ${product.name ? `<div class="product-name">${product.name}</div>` : ''}
                    <div class="product-time">${this.formatTime(product.lastScan)}</div>
                </div>
                <div class="product-quantity">
                    <div class="product-actions">
                        <button class="quick-btn decrease" data-action="decrease" data-barcode="${product.barcode}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="quantity-badge">${product.quantity}</div>
                    <div class="product-actions">
                        <button class="quick-btn increase" data-action="increase" data-barcode="${product.barcode}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // Bind card click events
        container.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.quick-btn')) return;
                this.showEditModal(card.dataset.barcode);
            });
        });

        // Bind quick action buttons
        container.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const barcode = btn.dataset.barcode;
                this.updateProductQuantity(barcode, action === 'increase' ? 1 : -1);
            });
        });

        // Swipe to delete özelliği
        this.bindSwipeToDelete(container);
    }

    bindSwipeToDelete(container) {
        container.querySelectorAll('.product-card').forEach(card => {
            let startX = 0;
            let currentX = 0;
            let isDragging = false;

            card.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                isDragging = true;
                card.style.transition = 'none';
            }, { passive: true });

            card.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                currentX = e.touches[0].clientX;
                const diff = currentX - startX;

                // Sadece sola kaydırma
                if (diff < 0) {
                    const translateX = Math.max(diff, -120);
                    card.style.transform = `translateX(${translateX}px)`;

                    // Silme göstergesi
                    if (translateX < -80) {
                        card.classList.add('swipe-delete');
                    } else {
                        card.classList.remove('swipe-delete');
                    }
                }
            }, { passive: true });

            card.addEventListener('touchend', () => {
                isDragging = false;
                card.style.transition = 'transform 0.3s ease';

                const diff = currentX - startX;

                if (diff < -80) {
                    // Sil
                    const barcode = card.dataset.barcode;
                    card.style.transform = 'translateX(-100%)';
                    card.style.opacity = '0';
                    setTimeout(() => {
                        this.deleteProduct(barcode);
                        this.showToast('info', '🗑️ Silindi', `${barcode} silindi`);
                    }, 300);
                } else {
                    // Geri al
                    card.style.transform = 'translateX(0)';
                    card.classList.remove('swipe-delete');
                }

                startX = 0;
                currentX = 0;
            });
        });
    }

    filterProducts(query) {
        this.renderProducts(query);
    }

    updateStats() {
        document.getElementById('total-products').textContent = this.products.length;
        document.getElementById('total-count').textContent = this.products.reduce((sum, p) => sum + p.quantity, 0);
    }

    formatTime(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Az önce';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} dk önce`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} saat önce`;

        return date.toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // =============================================
    // MODALS
    // =============================================

    showDeleteModal() {
        document.getElementById('delete-modal').classList.remove('hidden');
    }

    hideDeleteModal() {
        document.getElementById('delete-modal').classList.add('hidden');
    }

    showEditModal(barcode) {
        const product = this.products.find(p => p.barcode === barcode);
        if (!product) return;

        this.editingProduct = product;

        document.getElementById('edit-barcode').value = product.barcode;
        document.getElementById('edit-name').value = product.name || '';
        document.getElementById('edit-quantity').value = product.quantity;
        document.getElementById('edit-modal').classList.remove('hidden');
    }

    hideEditModal() {
        document.getElementById('edit-modal').classList.add('hidden');
        this.editingProduct = null;
    }

    saveEdit() {
        if (!this.editingProduct) return;

        const name = document.getElementById('edit-name').value.trim();
        const quantity = parseInt(document.getElementById('edit-quantity').value) || 1;

        this.editingProduct.name = name;
        this.editingProduct.quantity = Math.max(1, quantity);
        this.editingProduct.lastScan = new Date().toISOString();

        this.saveToStorage();
        this.renderProducts();
        this.updateStats();
        this.hideEditModal();
        this.showToast('success', 'Kaydedildi', 'Ürün bilgileri güncellendi');
    }

    deleteCurrentProduct() {
        if (!this.editingProduct) return;
        this.deleteProduct(this.editingProduct.barcode);
        this.hideEditModal();
    }

    adjustEditQuantity(delta) {
        const input = document.getElementById('edit-quantity');
        const current = parseInt(input.value) || 1;
        input.value = Math.max(1, current + delta);
    }

    // =============================================
    // EXCEL EXPORT
    // =============================================

    exportToExcel() {
        if (this.products.length === 0) {
            this.showToast('error', 'Hata', 'Dışa aktarılacak ürün yok');
            return;
        }

        const data = this.products.map((p, i) => ({
            'Sıra': i + 1,
            'Barkod': p.barcode,
            'Ürün Adı': p.name || '-',
            'Adet': p.quantity
        }));

        // Add summary row
        data.push({});
        data.push({
            'Sıra': '',
            'Barkod': 'TOPLAM',
            'Ürün Adı': `${this.products.length} çeşit ürün`,
            'Adet': this.products.reduce((sum, p) => sum + p.quantity, 0)
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();

        // Set column widths
        ws['!cols'] = [
            { wch: 6 },
            { wch: 20 },
            { wch: 25 },
            { wch: 8 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Stok Sayım');

        const date = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `stok_sayim_${date}.xlsx`);

        this.showToast('success', 'İndirildi', 'Excel dosyası oluşturuldu');
    }

    // =============================================
    // STORAGE
    // =============================================

    saveToStorage() {
        localStorage.setItem('barcode_stock_products', JSON.stringify(this.products));
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem('barcode_stock_products');
            this.products = saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Storage load error:', e);
            this.products = [];
        }
    }

    // =============================================
    // TOAST NOTIFICATIONS
    // =============================================

    showToast(type, title, message) {
        const container = document.getElementById('toast-container');
        const icons = { success: '✅', error: '❌', warning: '⚠️' };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon">${icons[type]}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
        `;

        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // =============================================
    // 🔴 LAZER TARAMA SİSTEMİ - Endüstriyel Güç
    // =============================================

    // Lazer taramayı başlat
    async startLaserScanner(video) {
        console.log('🔴 Lazer tarama sistemi başlatılıyor...');

        // LaserImageProcessor'ı başlat
        if (window.laserProcessor) {
            this.laserProcessor = window.laserProcessor;
        } else if (window.LaserImageProcessor) {
            this.laserProcessor = new window.LaserImageProcessor();
        } else {
            console.warn('LaserImageProcessor yüklenemedi, standart tarama kullanılacak');
            return;
        }

        this.videoElement = video;

        // Video track'i al
        if (video.srcObject) {
            const tracks = video.srcObject.getVideoTracks();
            if (tracks.length > 0) {
                this.videoTrack = tracks[0];
                await this.optimizeCameraForLaser();
            }
        }

        // Tap-to-focus ekle
        this.setupTapToFocus(video);

        // Focus recovery başlat
        this.startFocusRecovery();

        // Lazer tarama döngüsünü başlat
        this.startLaserScanLoop();

        console.log('🔴 Lazer tarama aktif!');
    }

    // Kamerayı lazer tarama için optimize et
    async optimizeCameraForLaser() {
        if (!this.videoTrack) return;

        try {
            const capabilities = this.videoTrack.getCapabilities ? this.videoTrack.getCapabilities() : {};
            const constraints = { advanced: [] };

            // Sürekli otomatik odaklama
            if (capabilities.focusMode) {
                constraints.advanced.push({ focusMode: 'continuous' });
            }

            // Sürekli pozlama
            if (capabilities.exposureMode) {
                constraints.advanced.push({ exposureMode: 'continuous' });
            }

            // Beyaz denge
            if (capabilities.whiteBalanceMode) {
                constraints.advanced.push({ whiteBalanceMode: 'continuous' });
            }

            // Zoom ayarı (1.2x - barkodları yakınlaştır)
            if (capabilities.zoom && capabilities.zoom.max >= 1.2) {
                constraints.advanced.push({ zoom: 1.2 });
            }

            if (constraints.advanced.length > 0) {
                await this.videoTrack.applyConstraints(constraints);
                console.log('📷 Kamera lazer modu için optimize edildi');
            }
        } catch (e) {
            console.log('Kamera optimizasyonu uygulanamadı:', e);
        }
    }

    // Tap-to-Focus özelliği
    setupTapToFocus(video) {
        if (!video) return;

        // Önceki listener'ı kaldır
        video.removeEventListener('click', this.handleTapToFocus);

        this.handleTapToFocus = async (event) => {
            if (!this.videoTrack) return;

            const rect = video.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;

            console.log(`👆 Tap-to-focus: (${x.toFixed(2)}, ${y.toFixed(2)})`);

            // Focus göstergesi
            this.showFocusIndicator(event.clientX, event.clientY);

            try {
                const capabilities = this.videoTrack.getCapabilities ? this.videoTrack.getCapabilities() : {};

                // Point of interest desteği varsa kullan
                if (capabilities.pointsOfInterest) {
                    await this.videoTrack.applyConstraints({
                        advanced: [{
                            focusMode: 'single-shot',
                            pointsOfInterest: [{ x, y }]
                        }]
                    });
                } else if (capabilities.focusMode) {
                    // Yoksa sadece single-shot focus yap
                    await this.videoTrack.applyConstraints({
                        advanced: [{ focusMode: 'single-shot' }]
                    });
                }

                // 3 saniye sonra continuous focus'a geri dön
                setTimeout(async () => {
                    if (this.videoTrack && this.isScanning) {
                        try {
                            await this.videoTrack.applyConstraints({
                                advanced: [{ focusMode: 'continuous' }]
                            });
                        } catch (e) { }
                    }
                }, 3000);

            } catch (e) {
                console.log('Tap-to-focus uygulanamadı:', e);
            }
        };

        // Video yerine container'a ekle (overlay video'yu blokluyor)
        const container = document.getElementById('scanner-container');
        if (container) {
            container.style.cursor = 'crosshair';
            container.addEventListener('click', this.handleTapToFocus);
            // Overlay'i de tıklanabilir yap
            const overlay = container.querySelector('.scanner-overlay');
            if (overlay) {
                overlay.style.pointerEvents = 'auto';
            }
        }
        video.addEventListener('click', this.handleTapToFocus);
        video.style.cursor = 'crosshair';
    }

    // Focus göstergesi animasyonu
    showFocusIndicator(x, y) {
        // Varsa eskisini kaldır
        const existing = document.getElementById('focus-indicator');
        if (existing) existing.remove();

        const indicator = document.createElement('div');
        indicator.id = 'focus-indicator';
        indicator.style.cssText = `
            position: fixed;
            left: ${x - 30}px;
            top: ${y - 30}px;
            width: 60px;
            height: 60px;
            border: 3px solid #ff0000;
            border-radius: 50%;
            pointer-events: none;
            z-index: 9999;
            animation: focusPulse 0.6s ease-out forwards;
        `;

        document.body.appendChild(indicator);
        setTimeout(() => indicator.remove(), 600);
    }

    // 🔴 Hız slider'ı başlat
    initSpeedSlider() {
        const slider = document.getElementById('scan-speed-slider');
        const valueEl = document.getElementById('speed-value');
        const msEl = document.getElementById('speed-ms');

        if (!slider) return;

        // Kayıtlı değeri yükle
        const savedSpeed = localStorage.getItem('laser_scan_speed');
        if (savedSpeed) {
            slider.value = savedSpeed;
            this.updateSpeedDisplay(parseInt(savedSpeed), valueEl, msEl);
        }

        slider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.updateSpeedDisplay(value, valueEl, msEl);

            // Scan interval güncelle (ters orantı: düşük ms = hızlı tarama)
            this.laserScanIntervalMs = 250 - value; // 50-200 arası -> 200-50ms

            // Cooldown da ayarla (yavaş = uzun cooldown, hızlı = kısa cooldown)
            // Yavaş (50) -> 500ms cooldown, Hızlı (200) -> 150ms cooldown
            this.scanCooldown = Math.max(150, 550 - value * 2);
            console.log(`🔴 Tarama: ${this.laserScanIntervalMs}ms aralık, ${this.scanCooldown}ms cooldown`);

            // Kaydet
            localStorage.setItem('laser_scan_speed', value);

            // Aktif tarama varsa interval'i yeniden başlat
            if (this.isScanning && this.laserMode) {
                this.restartLaserScanLoop();
            }
        });
    }

    // Hız göstergesi güncelle
    updateSpeedDisplay(value, valueEl, msEl) {
        let label = 'Orta';
        if (value < 100) label = 'Yavaş';
        else if (value > 150) label = 'Hızlı';
        else if (value > 180) label = 'Çok Hızlı';

        if (valueEl) valueEl.textContent = label;
        if (msEl) msEl.textContent = 250 - value;
    }

    // Lazer tarama döngüsünü yeniden başlat
    restartLaserScanLoop() {
        if (this.laserScanInterval) {
            clearInterval(this.laserScanInterval);
        }
        this.startLaserScanLoop();
    }

    // Focus recovery loop - takılan focus'u düzelt
    startFocusRecovery() {
        if (this.focusRecoveryTimer) {
            clearInterval(this.focusRecoveryTimer);
        }

        this.focusRecoveryTimer = setInterval(async () => {
            if (!this.isScanning || !this.videoTrack) return;

            const timeSinceLastScan = Date.now() - this.lastSuccessfulScan;

            // 5 saniyedir başarılı tarama yoksa focus reset
            if (timeSinceLastScan > 5000 && this.lastSuccessfulScan > 0) {
                console.log('🔄 Focus recovery - odaklama sıfırlanıyor...');

                try {
                    // Önce manual sonra continuous
                    await this.videoTrack.applyConstraints({
                        advanced: [{ focusMode: 'manual' }]
                    });

                    await new Promise(r => setTimeout(r, 200));

                    await this.videoTrack.applyConstraints({
                        advanced: [{ focusMode: 'continuous' }]
                    });

                    console.log('✅ Focus recovery tamamlandı');
                } catch (e) {
                    console.log('Focus recovery hatası:', e);
                }
            }
        }, 5000); // Her 5 saniyede kontrol
    }

    // Lazer tarama döngüsü - Canvas tabanlı
    startLaserScanLoop() {
        if (this.laserScanInterval) {
            clearInterval(this.laserScanInterval);
        }

        // Slider'dan gelen değeri kullan, yoksa varsayılan 100ms
        const scanInterval = this.laserScanIntervalMs || 100;
        console.log(`🔴 Lazer tarama aralığı: ${scanInterval}ms`);

        this.laserScanInterval = setInterval(() => {
            if (!this.isScanning || !this.videoElement || !this.laserProcessor) return;

            // Cooldown kontrolü
            const now = Date.now();
            if (now - this.lastScanTime < this.scanCooldown) return;

            this.processFrameWithLaser();
        }, scanInterval);
    }

    // Frame'i lazer işleme ile tara
    async processFrameWithLaser() {
        if (!this.laserProcessor || !this.videoElement) return;

        try {
            // Görüntü işleme
            const result = this.laserMode
                ? this.laserProcessor.processForLaserScan(this.videoElement)
                : this.laserProcessor.fastLaserScan(this.videoElement);

            if (!result || !result.canvas) return;

            // Canvas'tan decode et
            await this.decodeFromCanvas(result.canvas);

        } catch (e) {
            // Hata görmezden gel, sürekli tarama
        }
    }

    // Canvas'tan barkod decode et
    async decodeFromCanvas(canvas) {
        if (!this.html5QrcodeScanner) return;

        try {
            // Html5Qrcode'un scanFile metodunu canvas ile kullan
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

            // Blob oluştur
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const file = new File([blob], 'frame.jpg', { type: 'image/jpeg' });

            // Decode et
            const result = await this.html5QrcodeScanner.scanFile(file, false);

            if (result) {
                this.onScanSuccess(result);
            }
        } catch (e) {
            // Barkod bulunamadı - normal durum
        }
    }

    // Lazer tarayıcıyı durdur
    stopLaserScanner() {
        if (this.laserScanInterval) {
            clearInterval(this.laserScanInterval);
            this.laserScanInterval = null;
        }

        if (this.focusRecoveryTimer) {
            clearInterval(this.focusRecoveryTimer);
            this.focusRecoveryTimer = null;
        }

        if (this.videoElement && this.handleTapToFocus) {
            this.videoElement.removeEventListener('click', this.handleTapToFocus);
        }

        this.videoTrack = null;
        this.videoElement = null;
        this.laserProcessor = null;

        console.log('🔴 Lazer tarama durduruldu');
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BarcodeStockApp();
});
