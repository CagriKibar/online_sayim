// =============================================
// BARKOD STOK SAYIM - MAIN APPLICATION
// =============================================

class BarcodeStockApp {
    constructor() {
        this.products = [];
        this.html5QrcodeScanner = null;
        this.isScanning = false;
        this.editingProduct = null;
        this.lastScanTime = 0;
        this.scanCooldown = 350; // ⚡ TURBO: Çok hızlı ardışık tarama

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
    }

    // =============================================
    // BARCODE SCANNING
    // =============================================

    async startScanning() {
        const container = document.getElementById('scanner-container');
        container.classList.add('active');

        document.getElementById('start-scan-btn').classList.add('hidden');
        document.getElementById('stop-scan-btn').classList.remove('hidden');

        try {
            // Önceki scanner'ı temizle
            if (this.html5QrcodeScanner) {
                try {
                    await this.html5QrcodeScanner.stop();
                } catch (e) { }
                this.html5QrcodeScanner = null;
            }

            // iOS/Apple cihaz tespiti
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

            console.log('iOS Cihaz:', isIOS, 'Safari:', isSafari);

            // Kamera erişimi kontrolü
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Bu tarayıcı kamera erişimini desteklemiyor');
            }

            // iOS için özel kamera constraint'leri - YÜKSEK PERFORMANS
            const videoConstraints = isIOS ? {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 60, min: 30 },
                // iOS için kritik optimizasyonlar
                advanced: [
                    { focusMode: 'continuous' },
                    { exposureMode: 'continuous' },
                    { whiteBalanceMode: 'continuous' }
                ]
            } : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30, min: 15 }
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

            // ⚡ iOS İÇİN TURBO HIZLI KONFIGÜRASYON ⚡
            const turboConfig = {
                fps: isIOS ? 30 : 20, // iOS için maksimum FPS
                qrbox: isIOS ? { width: 280, height: 120 } : { width: 250, height: 100 },
                aspectRatio: isIOS ? 1.7777 : 1.5, // 16:9 iOS için daha iyi
                disableFlip: false,
                // Sadece barkod formatları - QR kod hariç (çok daha hızlı tarama!)
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.CODE_93,
                    Html5QrcodeSupportedFormats.CODABAR,
                    Html5QrcodeSupportedFormats.ITF
                ]
            };

            // iOS için direkt facingMode kullan (kamera listesi yerine)
            if (isIOS) {
                console.log('🍎 iOS Turbo Mod Aktif');

                await this.html5QrcodeScanner.start(
                    { facingMode: "environment" },
                    turboConfig,
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
                    turboConfig,
                    (decodedText) => this.onScanSuccess(decodedText),
                    () => { }
                );
            }

            this.isScanning = true;

            // iOS için ek optimizasyonlar: Tarama alanını highlighting
            this.optimizeScannerDOM();

            this.showToast('success', '⚡ Turbo Mod', isIOS ? 'iOS optimizasyonu aktif!' : 'Barkodu tarama alanına getirin');

        } catch (err) {
            console.error('Kamera hatası:', err);

            // Alternatif yöntem dene (fallback)
            try {
                console.log('Fallback yöntem deneniyor...');

                if (!this.html5QrcodeScanner) {
                    this.html5QrcodeScanner = new Html5Qrcode("reader");
                }

                // Basit fallback config
                await this.html5QrcodeScanner.start(
                    { facingMode: "environment" },
                    {
                        fps: 15,
                        qrbox: { width: 250, height: 100 },
                        formatsToSupport: [
                            Html5QrcodeSupportedFormats.EAN_13,
                            Html5QrcodeSupportedFormats.EAN_8,
                            Html5QrcodeSupportedFormats.CODE_128
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
        if (this.html5QrcodeScanner && this.isScanning) {
            try {
                await this.html5QrcodeScanner.stop();
            } catch (err) {
                console.error('Stop error:', err);
            }
        }

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
