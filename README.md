# Telegram Account Manager

Telegram hesaplarını, hesap gruplarını ve zamanlı mesaj senaryolarını tek bir yerden yönetmek için hazırlanmış yerel yönetim paneli.

> **Güvenlik:** Bu uygulama Telegram session bilgileri, API anahtarları ve hesap verileriyle çalışabilir. Bu dosyalar GitHub'a gönderilmemelidir. Projedeki `.gitignore` hassas veri dosyalarını varsayılan olarak hariç tutar.

## Özellikler

- String session veya telefon numarası ile hesap ekleme
- Hesapları kullanıcı tanımlı gruplara ayırma
- Hesap grubu ile toplu katılım ve çıkış işlemleri
- Kayıtlı hedef grup/kanal linklerini hızlı seçme
- Saat bazlı mesaj ve yorum senaryoları
- Senaryoları hedef, hesap ve saat bazında akordeon görünümünde listeleme
- Senaryo koleksiyonları oluşturma, topluca aktif/pasif yapma ve başka bir hesap grubuna kopyalama
- Telegram sohbetlerini, klasörlerini, mesajlarını ve medyalarını panelden görüntüleme
- Uzun hesap ve senaryo listeleri için kaydırılabilir/daraltılabilir arayüz
- Türkçe ve English dil seçimi (tarayıcıda hatırlanır)

## Kurulum

```bash
npm install
ADMIN_PASSWORD=guclu-sifre TELEGRAM_BOT_TOKEN=bot-token TELEGRAM_ADMIN_ID=123 node bot.js
```

Panel varsayılan olarak `http://localhost:3000` adresinde açılır. Değerleri `.env.example` dosyasından alıp shell ortamına tanımlayın; gerçek `.env` dosyasını Git'e eklemeyin.

## GitHub'a yayınlamadan önce

1. `hesaplar.json`, `senaryolar.json`, `dialoglar.json`, `apiler.txt` ve `proxyler.txt` dosyalarının içeriğini paylaşmayın.
2. API anahtarlarını ve yönetici şifresini ortam değişkenlerine taşıyın.
3. Git geçmişinde daha önce hassas veri varsa yalnızca dosyayı silmek yeterli değildir; geçmişi temizleyin.
4. Canlı ekran görüntülerinde telefon, Telegram ID, grup linki ve mesaj içeriklerini maskeleyin.

## Ekran görüntüleri

Arayüz, gerçek hesap/session bilgileri kullanılmadan hazırlanmış maskeli örnek verilerle görüntülendi:

### Hesap ve grup yönetimi

![Türkçe hesap ve grup yönetimi](docs/screenshots/accounts-turkish.png)

![English account management](docs/screenshots/accounts-english.png)

### Senaryo koleksiyonları

![English scenario collections](docs/screenshots/scenarios-english.png)

## Lisans

Lisans bilgisi daha sonra eklenebilir.
