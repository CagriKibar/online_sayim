# 📦 Barkod Stok Sayım Uygulaması

Modern, kullanımı kolay bir barkod okuyucu ve stok sayım uygulaması. Hem web tarayıcısında hem de mobil cihazlarda (PWA) çalışır.

## ✨ Özellikler

- 📷 **Kamera ile Barkod Okuma** - Telefonunuzun kamerasını kullanarak barkod tarayın
- 🔢 **Otomatik Sayım** - Aynı barkod tekrar okunduğunda otomatik olarak miktarı artırır
- ✏️ **Manuel Giriş** - Barkodu elle de girebilirsiniz
- 📊 **Excel'e Aktarma** - Tüm stok verilerini Excel dosyası olarak indirin
- 📱 **PWA Desteği** - Telefona yüklenebilir, offline çalışır
- 💾 **Yerel Depolama** - Verileriniz tarayıcıda güvenle saklanır
- 🌙 **Karanlık Tema** - Göz yormayan modern arayüz

## 🚀 Kullanım

### Online (GitHub Pages)

Uygulamayı doğrudan tarayıcınızda açın:
**https://[kullanıcı-adınız].github.io/online_sayim/**

### Telefona Yükleme (PWA)

1. Uygulamayı Chrome/Safari'de açın
2. "Ana Ekrana Ekle" seçeneğini kullanın
3. Artık uygulama telefonunuzda!

### Yerel Kullanım

1. Bu repository'yi klonlayın
2. `index.html` dosyasını bir web sunucusu ile açın
3. Veya VS Code Live Server extension kullanın

## 📱 Minimum Gereksinimler

- **Android**: 4.4+ (KitKat) - Chrome/WebView
- **iOS**: 11+ - Safari
- **Desktop**: Modern tarayıcılar (Chrome, Firefox, Edge, Safari)

## 🛠️ Teknik Detaylar

- **Barkod Okuma**: html5-qrcode kütüphanesi
- **Excel Export**: SheetJS (xlsx)
- **UI Framework**: Vanilla JavaScript (framework yok)
- **Stil**: Custom CSS (TailwindCSS yok)

## 📖 Nasıl Çalışır?

1. **Barkod Tara** butonuna tıklayın
2. Kamerayı barkoda tutun
3. Barkod okunduğunda otomatik olarak listeye eklenir
4. Aynı barkod tekrar okunursa miktar artar
5. Ürün kartına tıklayarak düzenleme yapabilirsiniz
6. **Excel'e Aktar** ile verileri indirin

## 🔒 Gizlilik

Tüm veriler **sadece cihazınızda** saklanır. Hiçbir veri sunucuya gönderilmez.

## 📄 Lisans

MIT License

## 🤝 Katkı

Pull request'ler kabul edilir. Büyük değişiklikler için önce issue açın.
