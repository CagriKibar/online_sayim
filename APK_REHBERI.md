# 📦 APK Oluşturma Rehberi

Bu belge, Barkod Stok Sayım uygulamasını APK'ya dönüştürme adımlarını açıklar.

## Yöntem 1: PWABuilder (ÖNERİLEN - En Kolay)

1. Uygulamayı GitHub Pages'a yükleyin (aşağıdaki adımları takip edin)
2. https://www.pwabuilder.com adresine gidin
3. GitHub Pages URL'nizi girin (örn: https://kullanici.github.io/online_sayim/)
4. "Start" butonuna tıklayın
5. "Package for stores" bölümünden "Android" seçin
6. APK dosyasını indirin

## Yöntem 2: AppsGeyser (Hızlı)

1. https://appsgeyser.com adresine gidin
2. "Website" seçeneğini seçin
3. PWA URL'nizi girin
4. APK'yı indirin

## Yöntem 3: Capacitor ile Yerel Build (Gelişmiş)

### Gereksinimler:
- Android Studio
- Android SDK
- Java JDK 11+

### Kurulum:
```bash
# Android Studio'yu yükleyin
# https://developer.android.com/studio

# ANDROID_HOME environment variable ayarlayın
# C:\Users\[KULLANICI]\AppData\Local\Android\Sdk

# APK oluşturun
cd android
.\gradlew.bat assembleDebug

# APK konumu:
# android\app\build\outputs\apk\debug\app-debug.apk
```

## GitHub Pages'a Yükleme

### Adım 1: Yeni Repository Oluşturun
1. GitHub.com'a gidin
2. "New Repository" oluşturun
3. İsim: `online_sayim` (veya istediğiniz bir isim)
4. Public seçin

### Adım 2: Dosyaları Yükleyin
```bash
cd C:\Users\pc\Desktop\online_sayim
git init
git add index.html styles.css app.js sw.js manifest.json icons README.md
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/[KULLANICI]/online_sayim.git
git push -u origin main
```

### Adım 3: GitHub Pages Aktifleştirin
1. Repository Settings > Pages
2. Source: Deploy from a branch
3. Branch: main, / (root)
4. Save

Birkaç dakika içinde siteniz yayında olacak:
`https://[KULLANICI].github.io/online_sayim/`

## Önemli Notlar

- PWA olarak telefona yükleyebilirsiniz (APK gerekmez!)
- Chrome'da siteyi açın > "Ana Ekrana Ekle" 
- Bu şekilde uygulama gibi çalışır, offline da kullanılabilir
