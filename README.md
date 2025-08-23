# Music DL 🎵

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Platform: Windows | Linux](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey.svg)
![Node.js](https://img.shields.io/badge/Node.js-16.x+-blue.svg)

**Music DL** adalah sebuah alat baris perintah (CLI) sederhana untuk mengunduh musik dari YouTube dan Spotify (Track, Playlist, Album) langsung dari terminal Anda.

Alat ini bekerja dengan cara mengambil metadata (judul, artis) dari URL Spotify, lalu mencari dan mengunduh audio yang paling cocok dari YouTube dalam format MP3.

## ✨ Fitur

-   Unduh lagu dengan mencari judulnya.
-   Unduh video tunggal dari YouTube.
-   Unduh seluruh playlist dari YouTube.
-   Unduh lagu tunggal dari Spotify.
-   Unduh seluruh playlist atau album dari Spotify.
-   Menyimpan file dalam format `.mp3` dengan metadata (judul, artis, album) dan *thumbnail*.
-   Dapat digunakan di Windows dan Linux.

---

## ⚙️ Prasyarat (Wajib Diinstal Terlebih Dahulu)

Sebelum menginstal Music DL, pastikan Anda sudah memiliki **Node.js**, **yt-dlp**, dan **FFmpeg**.

### 1. Instalasi Node.js

Pastikan Anda memiliki Node.js versi 16 atau lebih baru.

-   **Windows**:
    1.  Unduh *installer* dari [situs resmi Node.js](https://nodejs.org/en/download/).
    2.  Jalankan file `.msi` yang telah diunduh dan ikuti petunjuk instalasinya.
    3.  Buka terminal baru (Command Prompt atau PowerShell) dan verifikasi instalasi dengan `node -v` dan `npm -v`.

-   **Linux (Debian/Ubuntu)**:
    ```bash
    # Menggunakan NodeSource (rekomendasi)
    curl -fsSL [https://deb.nodesource.com/setup_20.x](https://deb.nodesource.com/setup_20.x) | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # Verifikasi instalasi
    node -v
    npm -v
    ```

### 2. Instalasi yt-dlp

Ini adalah program inti yang digunakan untuk mengunduh audio dari YouTube.

-   **Windows**:
    1.  Unduh file `yt-dlp.exe` dari [halaman rilis terbaru di GitHub](https://github.com/yt-dlp/yt-dlp/releases/latest).
    2.  Buat sebuah folder baru, misalnya `C:\Tools`.
    3.  Pindahkan file `yt-dlp.exe` ke dalam folder `C:\Tools` tersebut.
    4.  **Tambahkan folder tersebut ke Environment Variables PATH** agar bisa diakses dari mana saja (lihat instruksi di bagian FFmpeg untuk cara menambahkan PATH).
    5.  Buka terminal **baru** dan verifikasi dengan mengetik `yt-dlp --version`.

-   **Linux**:
    ```bash
    sudo curl -L [https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp](https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp) -o /usr/local/bin/yt-dlp
    sudo chmod a+rx /usr/local/bin/yt-dlp
    
    # Verifikasi instalasi
    yt-dlp --version
    ```

### 3. Instalasi FFmpeg (Penting untuk Konversi MP3) 🎞️

FFmpeg diperlukan untuk mengubah audio yang diunduh menjadi format `.mp3` dan menambahkan metadata.

-   **Windows**:
    1.  Unduh FFmpeg dari [**gyan.dev**](https://www.gyan.dev/ffmpeg/builds/) (pilih `ffmpeg-release-essentials.zip`).
    2.  Ekstrak file `.zip` tersebut dan ganti nama foldernya menjadi `ffmpeg`.
    3.  Pindahkan folder `ffmpeg` ke `C:\` sehingga path-nya menjadi `C:\ffmpeg`.
    4.  **Tambahkan `C:\ffmpeg\bin` ke Environment Variables PATH**:
        -   Buka Start Menu, cari "Edit the system environment variables" dan buka.
        -   Klik tombol `Environment Variables...`.
        -   Di bagian "System variables", cari dan pilih variabel `Path`, lalu klik `Edit...`.
        -   Klik `New` dan tambahkan path berikut: `C:\ffmpeg\bin`.
        -   Klik `OK` untuk menyimpan.
    5.  Buka terminal **baru** dan verifikasi dengan `ffmpeg -version`.
    
    Atau bisa juga menggunakan `winget`
    ```bash
    winget install ffmpeg
    ```

-   **Linux (Debian/Ubuntu)**:
    FFmpeg dapat diinstal dengan mudah melalui manajer paket.
    ```bash
    sudo apt update
    sudo apt install ffmpeg
    
    # Verifikasi instalasi
    ffmpeg -version
    ```

---

## 🚀 Instalasi Music DL

Setelah semua prasyarat terpenuhi, Anda bisa menginstal alat ini.

1.  **Clone Repositori**
    ```bash
    git clone [https://github.com/Terror-Machine/yt-spotify-dl.git](https://github.com/Terror-Machine/yt-spotify-dl.git)
    cd yt-spotify-dl
    ```

2.  **Instal Dependensi Proyek**
    ```bash
    npm install
    ```

3.  **Instal CLI Secara Global**
    Jalankan perintah ini dari dalam direktori proyek agar perintah `music-dl` bisa diakses dari mana saja di terminal Anda.
    ```bash
    npm install -g .
    ```

    Jika Anda mendapatkan error hak akses di Linux, gunakan `sudo`:
    ```bash
    sudo npm install -g .
    ```
    
4. **Install menggunakan installer**
    Jalankan menggunakan perintah ini jika ingin langsung menggunakan installer tanpa perlu menggunakan langkah 2 dan 3.
    ```bash
    bash install.sh
    ```
    
---

## 📚 Cara Penggunaan

Gunakan perintah `music-dl` diikuti dengan query pencarian atau URL.

### Contoh Perintah:

**1. Mencari dan Mengunduh Lagu**
```bash
music-dl "imagine dragons bones"
```

**2. Mengunduh dari URL YouTube (Video Tunggal)**
```bash
music-dl "[https://www.youtube.com/watch?v=yKNxeF4KMsY](https://www.youtube.com/watch?v=yKNxeF4KMsY)"
```

**3. Mengunduh dari URL Spotify (Lagu Tunggal)**
```bash
music-dl "[https://open.spotify.com/track/4cOdK2wGLETOMsV3oXOltq](https://open.spotify.com/track/4cOdK2wGLETOMsV3oXOltq)"
```

### ## Opsi Perintah

| Opsi                  | Alias | Deskripsi                                                       |
| --------------------- | ----- | ----------------------------------------------------------------- |
| `--output <dir>`      | `-o`  | Menentukan direktori output untuk file unduhan.                   |
| `--quality <0-9>`     | `-q`  | Mengatur kualitas audio (0 adalah terbaik).                       |
| `--search`            | `-s`  | Memaksa mode pencarian, bahkan untuk URL.                         |
| `--list`              | `-l`  | Menampilkan daftar lagu dari playlist/album tanpa mengunduh.      |
| `--cookies <file>`    | `-c`  | Path ke file cookies untuk video yang butuh login (misal, cookies.txt). |
| `--verbose`           | `-v`  | Menampilkan log atau informasi proses yang lebih detail.          |
| `--help`              | `-h`  | Menampilkan pesan bantuan.                                        |

---

## 📜 Lisensi

Proyek ini dilisensikan di bawah [Lisensi MIT](LICENSE).