// =============================================
// BARKOD STOK SAYIM - MAIN APPLICATION
// =============================================

class BarcodeStockApp {
    constructor() {
        this.products = [];
        this.html5QrcodeScanner = null;
        this.quaggaActive = false; // QuaggaJS aktif mi?
        this.isScanning = false;
        this.editingProduct = null;
        this.lastScanTime = 0;
        this.scanCooldown = 350;
        this.currentScanMode = 'optimize';
        this.currentModeConfig = null;

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

        // Kaydedilmiş modu yükle veya varsayılan olarak "standard" kullan
        const savedMode = localStorage.getItem('barcode_scan_mode') || 'standard';
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

        // Tarayıcı tipini belirle
        if (mode === 'msi') {
            this.currentScanner = 'quagga';
        } else {
            this.currentScanner = 'html5';
        }

        // Cooldown ayarla
        this.scanCooldown = mode === 'msi' ? 400 : 300;

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
            if (mode === 'msi') {
                infoEl.textContent = '🏭 MSI Mod - MSI, Codabar, I2of5, Code-39/93/128 destekli';
            } else {
                infoEl.textContent = '📷 Standart mod - QR, EAN, UPC, CODE-128, ITF, DataMatrix destekli';
            }
        }

        // Kaydet
        localStorage.setItem('barcode_scan_mode', mode);

        console.log(`📱 Scanner: ${this.currentScanner} | Mode: ${mode} | Cooldown: ${this.scanCooldown}ms`);

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

            // QuaggaJS'i paralel olarak başlat (MSI, Codabar desteği için)
            // NOT: Quagga aynı video stream'i kullanamayacağı için ayrı çalışmayacak
            // Ama Html5Qrcode zaten Codabar destekliyor

            this.showToast('success', '📷 Tarama Aktif', 'Tüm barkod formatları destekleniyor');

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
        if (now - this.lastScanTime < this.scanCooldown) return;
        this.lastScanTime = now;

        this.addProduct(barcode.trim());

        // Görsel geri bildirim - tarama animasyonu
        const container = document.getElementById('scanner-container');
        container.classList.add('scan-success');
        setTimeout(() => container.classList.remove('scan-success'), 500);

        // Vibrate on success (iPhone için önemli)
        if (navigator.vibrate) {
            navigator.vibrate([50, 30, 50]); // Kısa titreşim paterni
        }

        // Sesli geri bildirim (opsiyonel - kullanıcı ayarlarına göre)
        this.playBeep();
    }

    playBeep() {
        try {
            // iOS için AudioContext'i resume et
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // iOS'ta ses çalmak için context'i resume etmek gerekli
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }

            // Market tarayıcı bip sesi - çift tonlu
            const now = audioContext.currentTime;

            // İlk ton (yüksek)
            const osc1 = audioContext.createOscillator();
            const gain1 = audioContext.createGain();
            osc1.connect(gain1);
            gain1.connect(audioContext.destination);
            osc1.frequency.value = 1800; // Hz - yüksek ton
            osc1.type = 'sine';
            gain1.gain.setValueAtTime(0.5, now);
            gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc1.start(now);
            osc1.stop(now + 0.08);

            // İkinci ton (daha yüksek) - hemen arkasından
            const osc2 = audioContext.createOscillator();
            const gain2 = audioContext.createGain();
            osc2.connect(gain2);
            gain2.connect(audioContext.destination);
            osc2.frequency.value = 2400; // Hz - daha yüksek ton
            osc2.type = 'sine';
            gain2.gain.setValueAtTime(0.6, now + 0.1);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc2.start(now + 0.1);
            osc2.stop(now + 0.2);

            // Context'i temizle
            setTimeout(() => audioContext.close(), 500);
        } catch (e) {
            console.log('Ses çalınamadı:', e);
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
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BarcodeStockApp();
});
