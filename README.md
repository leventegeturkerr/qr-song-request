# QR ile Şarkı İstek Uygulaması 🎶

Canlı müzik mekanları için: müşteriler masadaki QR kodu okutur, açılan sayfadan
şarkı ister veya listede olan bir şarkıyı beğenir (+1). DJ/grup, `/dashboard`
adresindeki panelden istekleri canlı olarak görür, "çalındı" işaretler veya siler.

## Özellikler
- Şarkı isteği gönderme, aynı şarkı tekrar istenirse otomatik oy sayısı artar
- Oy sayısına göre otomatik sıralanan kuyruk
- Socket.IO ile gerçek zamanlı güncelleme (sayfa yenilemeden)
- Şifreli DJ paneli (`/dashboard`)
- Panelde otomatik QR kod üretimi (yazdırıp masalara koyabilirsin)
- IP bazlı basit spam/istek sınırlaması

## Kurulum (yerelde deneme)
```bash
npm install
cp .env.example .env      # .env dosyasını aç, ADMIN_PASSWORD'ü değiştir
npm start
```
Sonra tarayıcıda:
- Müşteri sayfası: `http://localhost:3000/`
- DJ paneli: `http://localhost:3000/dashboard`

## Gerçek bir mekanda kullanım için yayına alma
Bu bir Node.js uygulaması, herhangi bir Node destekleyen sunucuya konabilir:

1. **Ucuz/kolay seçenekler:** Railway, Render, Fly.io, bir VPS (DigitalOcean,
   Hetzner) veya kendi sunucun. Hepsinde mantık aynı: repoyu yükle,
   `ADMIN_PASSWORD` ve `SESSION_SECRET` ortam değişkenlerini gir, `npm start`
   ile çalıştır.
2. **Alan adı:** Aldığın alan adını (örn. `sarkiiste.com`) sunucunun IP'sine
   yönlendir, önüne Nginx gibi bir ters proxy koyup HTTPS (Let's Encrypt/Certbot
   ile ücretsiz) ekle. HTTPS önemli çünkü müşteriler telefonlarından QR ile
   girecek.
3. **QR kod:** Yayına aldıktan sonra `/dashboard` sayfasını aç, giriş yap;
   panelin üstünde gerçek adresine göre otomatik üretilen QR kodu göreceksin.
   Onu indirip masalara/mekana bastırabilirsin. Farklı masalar için ayrı QR
   istiyorsan, adrese `?masa=5` gibi bir parametre ekleyip o QR'ı ayrıca
   üretebilirsin (`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=SITEADRESIN/?masa=5`).
4. **Veri kalıcılığı:** İstekler `data.json` dosyasında tutulur. Sunucu
   yeniden başlasa bile istekler kaybolmaz. Küçük/orta trafikli bir mekan için
   yeterlidir; çok yoğun/çok şubeli kullanım planlıyorsan ileride bunu gerçek
   bir veritabanına (Postgres, SQLite vb.) taşımak kolaydır çünkü tüm
   veritabanı işlemleri `server.js` içinde tek bir yerde toplanmış durumda.

## Güvenlik notları
- `ADMIN_PASSWORD` ve `SESSION_SECRET` değerlerini mutlaka değiştir, varsayılan
  değerlerle yayına alma.
- Uygulamayı mutlaka HTTPS arkasında yayınla (oturum çerezleri için önemli).
- Spam'i tamamen engellemek istersen, hız sınırlamasını (`server.js` içindeki
  `rateLimited` fonksiyonu) daha da sıkılaştırabilir veya bir CAPTCHA
  ekleyebilirsin.

## Yapıyı genişletmek istersen
- Birden fazla mekan/şube desteği: her isteğe bir `venueId` alanı ekleyip
  filtrelemek yeterli.
- Spotify/YouTube entegrasyonu: `song`/`artist` alanlarını ilgili API'ye
  gönderip kapak resmi, süre gibi bilgiler eklenebilir.
- Anlık "şu an çalıyor" ekranı: `db.requests` içinden `status: 'playing'`
  diye ayrı bir durum ekleyip büyük ekranda göstermek mümkün.
