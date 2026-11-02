# TOGETHER — Premium Real-Time Couple Location Sharing Platform
> **"Always Connected, Wherever You Are."**

TOGETHER adalah platform web berbagi lokasi realtime eksklusif dua pasangan berbasis citra satelit resolusi tinggi (Esri World Imagery), GPS presisi, dan antarmuka *geospatial intelligence* yang romantis.

Dibangun dengan arsitektur **HTML5, CSS3 murni, dan Vanilla JavaScript ES6+**, tanpa framework berat (No React, No Next, No Node backend), sehingga dapat di-deploy secara instan di layanan static hosting mana pun dengan HTTPS.

---

## 🌟 Fitur Utama

1. **Satellite Map Experience (Leaflet.js)**
   - **Satellite View**: Citra satelit resolusi tinggi dari Esri World Imagery.
   - **Hybrid View**: Citra satelit Esri berpadu dengan label batas wilayah dan nama jalan resmi.
   - **Street View**: Peta jalan OpenStreetMap.
   - **Terrain View**: Kontur dan topografi medan Esri World Topo Map.
   - Animasi **Radar Pulse** konsentrik pada marker lokasi pengguna & pasangan.
   - Garis laser penghubung (*Neon Animated Polyline*) dengan lencana jarak dinamis di titik tengah (*Midpoint Distance Badge*).
   - Kontrol kamera: *Locate Me*, *Center on Partner*, *Fit Both Us*, dan *Full-screen mode*.

2. **Real-Time Location & Telemetry Engine**
   - Menggunakan W3C Geolocation API (`watchPosition` berakurasi tinggi).
   - Sinkronisasi dua arah via **Firebase Realtime Database**.
   - **Throttling Cerdas**: Koordinat hanya disiarkan jika jeda waktu memenuhi syarat (min 5 detik) atau jarak berubah signifikan (min 5 meter), guna menghemat baterai & kuota data.
   - **Kalkulator Jarak Haversine**: Mengukur jarak garis lengkung bumi eksak dalam meter atau kilometer.
   - **Arah Kompas & Kecepatan**: Menampilkan *heading bearing* (Utara, Timur Laut, dll.) dan kecepatan berkendara/berjalan (km/jam).
   - **Battery Status API**: Menampilkan sisa persentase baterai ponsel dan status pengecasan pasangan.
   - **Location Freshness Indicator**: *Live Now* (<25 detik), *Recent* (<2 menit), *Idle*, atau *Offline / Last Known Location*.

3. **Room Pairing Dua Arah Eksklusif**
   - Hasilkan kode pairing unik 6 karakter (contoh: `TOG-8F29A4`).
   - Validasi ketat: 1 Couple Room hanya dapat dihuni oleh tepat 2 akun.
   - *Reactive Wakeup*: Saat pasangan memasukkan kode dari ponselnya, layar pembuat kode langsung mendeteksi secara realtime dan berpindah ke dashboard bersama.

4. **Privasi & Keamanan (Security Rules)**
   - Aturan Firebase Database (`database.rules.json`): Hanya anggota pasangan yang memiliki izin baca/tulis di room mereka.
   - Setiap pengguna hanya dapat memperbarui koordinat miliknya sendiri.
   - Sakelar **Jeda Berbagi Lokasi** (*Pause / Ghost Mode*).
   - Tombol **Tinggalkan Couple Room** (*Unpair*) dengan konfirmasi ganda.

5. **Audio & Geofence Notification**
   - Lonceng audio lembut synthesized via Web Audio API (tanpa file mp3 eksternal).
   - Notifikasi kedatangan saat pasangan berada dalam radius dekat (<50 meter).
   - Dukungan Web Notifications API.

6. **Simulator / Demo Mode Bawaan**
   - Tanpa setup Firebase sekalipun, Anda dapat langsung menguji coba seluruh animasi peta, radar, dan pergerakan satelit pasangan melalui tombol **Mode Demo Instan (Romeo & Juliet)**!

---

## 📁 Struktur Direktori Project

```
together/
│
├── index.html                   # Cinematic Landing Page (Earth visual, orbit, feature showcase)
├── login.html                   # Halaman Masuk & Lupa Sandi
├── register.html                # Halaman Pendaftaran & Pemilihan Avatar SVG
├── pairing.html                 # Couple Room Hub (Buat / Gabung Room dengan kode)
├── dashboard.html               # Main Dashboard Peta Satelit Realtime
│
├── css/
│   ├── style.css                # Master styling, glassmorphism, palet warna neon
│   ├── animation.css            # Animasi radar pulse, orbit, laser polyline, scanner
│   └── responsive.css           # Tata letak Desktop 1920px, Tablet, dan Mobile Bottom Sheet
│
├── js/
│   ├── firebase-config.js       # Inisialisasi Firebase & deteksi mode simulator
│   ├── auth.js                  # Registrasi, Login, Profile & Auth state guard
│   ├── pairing.js               # Generator kode unik & listener sinkronisasi pasangan
│   ├── location.js              # Geolocation API, Throttling, Rumus Haversine, Baterai
│   ├── map.js                   # Leaflet engine, 4 layer satelit, custom radar markers
│   ├── dashboard.js             # Controller utama dashboard desktop & mobile
│   ├── notifications.js         # Glassmorphism toasts, chime synthesizer, web notification
│   └── app.js                   # Canvas partikel bintang, Lucide icons, ripple effect
│
├── assets/
│   ├── icons/
│   │   └── logo.svg             # Logo vektor resmi TOGETHER
│   └── avatars/
│       ├── avatar-1.svg s/d 6.svg # Koleksi avatar profil pasangan
│
├── firebase/
│   └── database.rules.json      # Aturan keamanan ketat Firebase Realtime Database
│
└── README.md                    # Dokumentasi lengkap
```

---

## 🚀 Panduan Menjalankan Aplikasi

Aplikasi ini tidak memerlukan proses compile atau build (`npm run build`). Cukup jalankan web server statis:

### Opsi A: Menggunakan VS Code Live Server
1. Buka folder `Tracking` di VS Code.
2. Klik kanan pada `index.html` -> Pilih **"Open with Live Server"**.
3. Buka URL `http://127.0.0.1:5500/index.html`.

### Opsi B: Menggunakan Node / npx serve
```bash
npx serve -l 3000 .
```
Buka di browser: `http://localhost:3000`

### Opsi C: Menggunakan Python HTTP Server
```bash
python -m http.server 8080
```
Buka di browser: `http://localhost:8080`

> 💡 **Coba Langsung Tanpa Firebase**:
> Klik tombol **"Mulai Dashboard Simulasi (Romeo & Juliet)"** di halaman `login.html` atau `pairing.html` untuk melihat radar bergerak, perhitungan jarak, dan citra satelit langsung bekerja!

---

## 🔥 Konfigurasi Firebase (Untuk Real Multi-Device Sync)

Jika Anda ingin menghubungkan dua ponsel/perangkat nyata:

### 1. Buat Proyek Firebase
1. Buka [Firebase Console](https://console.firebase.google.com/).
2. Klik **Add project**, beri nama (misal: `together-couple`).
3. Matikan Google Analytics (opsional), lalu klik **Create project**.

### 2. Aktifkan Firebase Authentication
1. Di bilah menu kiri, pilih **Build** > **Authentication**.
2. Klik **Get Started**.
3. Pada tab *Sign-in method*, pilih **Email/Password**.
4. Aktifkan opsi pertama (**Email/Password**), lalu klik **Save**.

### 3. Buat Realtime Database
1. Di bilah menu kiri, pilih **Build** > **Realtime Database**.
2. Klik **Create Database**.
3. Pilih lokasi server terdekat (misal: `Singapore` atau `United States`).
4. Pilih **Start in locked mode** lalu klik **Enable**.

### 4. Terapkan Security Rules
1. Masuk ke tab **Rules** pada Realtime Database.
2. Salin seluruh isi file [`firebase/database.rules.json`](file:///d:/StarUp/Tracking/firebase/database.rules.json) di project ini.
3. Tempelkan ke editor Rules di Firebase Console, lalu klik **Publish**.

### 5. Daftarkan Web App & Dapatkan Kredensial
1. Di halaman Project Overview, klik ikon Web (`</>`) untuk menambahkan Web App.
2. Beri nama aplikasi (misal: `together-web`).
3. Firebase akan menampilkan objek konfigurasi:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-project.firebaseapp.com",
     databaseURL: "https://your-project-default-rtdb.firebaseio.com",
     projectId: "your-project",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef..."
   };
   ```
4. Anda dapat memperbarui kredensial tersebut dengan 2 cara:
   - **Cara 1 (Langsung di file)**: Buka [`js/firebase-config.js`](file:///d:/StarUp/Tracking/js/firebase-config.js), ganti nilai pada objek `DEFAULT_FIREBASE_CONFIG`.
   - **Cara 2 (Tanpa ubah kode)**: Buka `login.html`, klik tombol **"Konfigurasi Firebase"** di bawah, tempelkan JSON konfigurasi Anda, lalu klik **Simpan & Muat Ulang**.

---

## 📱 Cara Menghubungkan Dua Perangkat Nyata

1. **Buka Aplikasi di Perangkat A (Pasangan 1)**:
   - Buka `register.html`, daftarkan akun (misal: `romeo@gmail.com`).
   - Masuk ke halaman `pairing.html`.
   - Klik **"Buat Kode Pairing Baru"**.
   - Muncul kode unik (contoh: `TOG-7X9K2M`).

2. **Buka Aplikasi di Perangkat B (Pasangan 2)**:
   - Buka `register.html`, daftarkan akun pasangan (misal: `juliet@gmail.com`).
   - Masuk ke halaman `pairing.html`.
   - Di kolom "Gabung ke Pasangan", masukkan kode `TOG-7X9K2M`.
   - Klik **"Hubungkan Sekarang"**.

3. **Sinkronisasi Otomatis**:
   - Perangkat B otomatis dialihkan ke `dashboard.html`.
   - Perangkat A secara otomatis mendeteksi bahwa Perangkat B telah bergabung, menampilkan toast romantis, dan langsung membuka `dashboard.html`.
   - Saat izin GPS disetujui di kedua ponsel, kedua marker satelit akan muncul saling terhubung dengan garis laser dan jarak eksak!

---

## 🌐 Panduan Deploy ke HTTPS

> ⚠️ **PENTING: Browser GPS API Membutuhkan HTTPS**
> W3C Geolocation API (`navigator.geolocation`) diblokir oleh browser modern jika dijalankan melalui HTTP biasa (kecuali `localhost` / `127.0.0.1`). Oleh karena itu, aplikasi wajib di-hosting dengan HTTPS agar dapat diakses dari ponsel.

### Opsi 1: Firebase Hosting (Gratis & Terintegrasi)
```bash
# 1. Install Firebase CLI
npm install -g firebase-tools

# 2. Login
firebase login

# 3. Inisialisasi di folder project
firebase init hosting
# - Pilih project Firebase Anda
# - Public directory: . (titik)
# - Configure as a single-page app: No
# - Set up automatic builds: No

# 4. Deploy
firebase deploy --only hosting
```
Situs Anda akan langsung aktif di `https://your-project.web.app` dengan sertifikat SSL gratis!

### Opsi 2: Vercel / Netlify
Cukup hubungkan repository GitHub Anda atau *drag & drop* folder `Tracking` ke dashboard Netlify/Vercel. Keduanya otomatis menyediakan HTTPS gratis.

---

## ⚠️ Keterbatasan Browser & GPS (Transparansi Teknis)

Sesuai etika dan kepatuhan standar web modern:
1. **Background Tracking Saat Tab/Browser Ditutup**:
   - Berbeda dengan aplikasi native Android/iOS (Java/Kotlin/Swift), aplikasi web murni berjalan di dalam sandbox browser.
   - Jika tab browser diminimalkan atau layar ponsel dimatikan (*locked*), sistem operasi ponsel (khususnya iOS Safari dan Android Chrome battery optimizer) akan membatasi atau menghentikan eksekusi JavaScript background.
   - **Solusi Rekomendasi**: Pasangan disarankan membiarkan tab browser tetap terbuka saat ingin membagikan lokasi realtime, atau menambahkan aplikasi ke layar utama (*Add to Home Screen*).
2. **Akurasi GPS**:
   - Akurasi GPS bergantung pada hardware perangkat dan kondisi lingkungan. Di dalam gedung beton atau basement, akurasi GPS bisa melebar hingga ±50-100 meter, sedangkan di luar ruangan (*outdoor*) mencapai ±3-10 meter. Indikator akurasi di TOGETHER selalu menampilkan lingkaran radius transparan yang jujur sesuai data satelit.

---

## 🛡️ Lisensi & Atribusi Sumber Daya

- **Citra Satelit**: [Esri World Imagery](https://www.esri.com/) & Esri Reference Boundaries.
- **Peta Jalan**: [OpenStreetMap Contributors](https://www.openstreetmap.org/copyright).
- **Pemetaan Interaktif**: [Leaflet.js](https://leafletjs.com/).
- **Ikonografi**: [Lucide Icons](https://lucide.dev/).
- **Font**: Google Fonts (*Plus Jakarta Sans* & *JetBrains Mono*).
- **Desain & Arsitektur**: Dibuat khusus untuk platform TOGETHER.

