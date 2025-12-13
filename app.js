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
        this.scanCooldown = 800; // Hızlı ardışık tarama için optimize edildi

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
        try {
            const container = document.getElementById('scanner-container');
            container.classList.add('active');

            document.getElementById('start-scan-btn').classList.add('hidden');
            document.getElementById('stop-scan-btn').classList.remove('hidden');

            this.html5QrcodeScanner = new Html5Qrcode("reader");

            // iPhone ve ince barkodlar için optimize edilmiş yapılandırma
            const config = {
                fps: 30, // Yüksek frame rate - daha hızlı okuma
                qrbox: (viewfinderWidth, viewfinderHeight) => {
                    // Dinamik tarama alanı - ekranın %75'i
                    const minEdgePercentage = 0.75;
                    const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
                    const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
                    return {
                        width: Math.min(qrboxSize, 400),
                        height: Math.min(Math.floor(qrboxSize * 0.4), 180)
                    };
                },
                aspectRatio: 1.777778, // 16:9 en-boy oranı
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.CODE_93,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.ITF,
                    Html5QrcodeSupportedFormats.CODABAR,
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.DATA_MATRIX
                ],
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true // Native API kullan (daha hızlı)
                },
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: true
            };

            // Yüksek çözünürlüklü kamera ayarları - iPhone için kritik
            const cameraConfig = {
                facingMode: "environment",
                advanced: [
                    { width: { min: 1280, ideal: 1920, max: 2560 } },
                    { height: { min: 720, ideal: 1080, max: 1440 } },
                    { focusMode: "continuous" },
                    { exposureMode: "continuous" },
                    { whiteBalanceMode: "continuous" }
                ]
            };

            await this.html5QrcodeScanner.start(
                cameraConfig,
                config,
                (decodedText, decodedResult) => this.onScanSuccess(decodedText, decodedResult),
                () => { }
            );

            // Kamera akışı başladıktan sonra odak ve zoom ayarla
            this.optimizeCameraSettings();

            this.isScanning = true;
        } catch (err) {
            console.error('Scanner start error:', err);
            // Yüksek çözünürlük başarısız olursa fallback dene
            await this.startScanningFallback();
        }
    }

    async startScanningFallback() {
        try {
            console.log('Fallback scanner moduna geçiliyor...');

            const config = {
                fps: 20,
                qrbox: { width: 300, height: 150 },
                aspectRatio: 1.5,
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.QR_CODE
                ],
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true
                }
            };

            await this.html5QrcodeScanner.start(
                { facingMode: "environment" },
                config,
                (decodedText, decodedResult) => this.onScanSuccess(decodedText, decodedResult),
                () => { }
            );

            this.isScanning = true;
        } catch (err) {
            console.error('Fallback scanner error:', err);
            this.showToast('error', 'Kamera Hatası', 'Kamera erişimi sağlanamadı. Lütfen kamera izinlerini kontrol edin.');
            this.stopScanning();
        }
    }

    async optimizeCameraSettings() {
        try {
            const videoElement = document.querySelector('#reader video');
            if (videoElement && videoElement.srcObject) {
                const track = videoElement.srcObject.getVideoTracks()[0];
                if (track) {
                    const capabilities = track.getCapabilities ? track.getCapabilities() : {};

                    const constraints = {};

                    // Sürekli otomatik odak (ince barkodlar için kritik)
                    if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                        constraints.focusMode = 'continuous';
                    }

                    // Sürekli pozlama
                    if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
                        constraints.exposureMode = 'continuous';
                    }

                    // Zoom - ince barkodlar için hafif zoom
                    if (capabilities.zoom) {
                        // Zoom aralığının %20-30'unda tut
                        const zoomRange = capabilities.zoom.max - capabilities.zoom.min;
                        constraints.zoom = capabilities.zoom.min + (zoomRange * 0.25);
                    }

                    if (Object.keys(constraints).length > 0) {
                        await track.applyConstraints({ advanced: [constraints] });
                        console.log('Kamera ayarları optimize edildi:', constraints);
                    }
                }
            }
        } catch (err) {
            console.log('Kamera optimizasyonu uygulanamadı:', err);
        }
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
            'Adet': p.quantity,
            'İlk Okuma': new Date(p.firstScan).toLocaleString('tr-TR'),
            'Son Okuma': new Date(p.lastScan).toLocaleString('tr-TR')
        }));

        // Add summary row
        data.push({});
        data.push({
            'Sıra': '',
            'Barkod': 'TOPLAM',
            'Ürün Adı': `${this.products.length} çeşit ürün`,
            'Adet': this.products.reduce((sum, p) => sum + p.quantity, 0),
            'İlk Okuma': '',
            'Son Okuma': ''
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();

        // Set column widths
        ws['!cols'] = [
            { wch: 6 },
            { wch: 20 },
            { wch: 25 },
            { wch: 8 },
            { wch: 20 },
            { wch: 20 }
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
