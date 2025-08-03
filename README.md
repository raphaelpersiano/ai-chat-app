# Chat App dengan Login Google & Asisten Kredit AI (Simulasi via PostgreSQL)

Ini adalah aplikasi web sederhana yang memungkinkan pengguna login menggunakan akun Google mereka dan berinteraksi dalam ruang chat dengan admin yang didukung oleh AI. Aplikasi ini juga mencakup **simulasi** asisten kredit, di mana AI dapat memberikan wawasan dan saran berdasarkan **data kredit fiktif** pengguna yang disimpan dalam database **PostgreSQL** (misalnya, menggunakan layanan cloud seperti Neon).

**PENTING:** Fitur asisten kredit menggunakan data pengguna yang sepenuhnya **fiktif** untuk tujuan demonstrasi. Anda perlu menyiapkan database PostgreSQL dan memasukkan data fiktif sendiri.

## Fitur

*   Login pengguna melalui Google OAuth 2.0.
*   **Antarmuka Chat:** Antarmuka chat real-time seperti WhatsApp menggunakan Socket.IO, dengan header yang berisi ikon refresh dan logout..
*   Admin chat yang didukung oleh AI (model Llama melalui OpenRouter).
*   **Simulasi Asisten Kredit:** AI dapat menjawab pertanyaan tentang data kredit fiktif pengguna (skor, riwayat pembayaran) dan memberikan saran berdasarkan data tersebut dari database PostgreSQL.
*   Server backend menggunakan Node.js dan Express.
*   Frontend modern menggunakan **Tailwind CSS**.
*   **Deteksi Tautan Otomatis:** Tautan (URL) dalam respons AI secara otomatis dideteksi dan ditampilkan sebagai tombol "Click Here" yang dapat diklik, membuka tautan di tab baru.

## Prasyarat

*   Node.js (versi 18 atau lebih baru direkomendasikan)
*   npm (biasanya terinstal bersama Node.js)
*   Akun Google Cloud untuk kredensial OAuth 2.0.
*   API Key dari OpenRouter (atau penyedia LLM lain yang kompatibel).
*   **Database PostgreSQL:** Database PostgreSQL yang dapat diakses oleh aplikasi (misalnya, dari Neon, Supabase, ElephantSQL, atau PostgreSQL lokal jika menjalankan aplikasi secara lokal).
*   Alat untuk mengelola database PostgreSQL (misalnya, DBeaver, psql).

## Setup dan Instalasi

1.  **Ekstrak File Zip:**
    *   Unduh file zip kode sumber.
    *   Ekstrak isinya ke direktori pilihan Anda. Anda akan mendapatkan folder `chat-app`.

2.  **Setup Database PostgreSQL:**
    *   Pastikan Anda memiliki database PostgreSQL yang aktif dan dapat diakses.
    *   Dapatkan **Connection String** (URL koneksi) database Anda (misalnya, dari dashboard Neon).
    *   Gunakan alat database Anda (DBeaver, psql) untuk terhubung ke database.
    *   Jalankan perintah SQL dari file `schema.sql` yang disertakan dalam proyek ini untuk membuat tabel-tabel yang diperlukan (`UserCreditInsights`, `UserTradelineData`, `UserPaymentHistory`).
    *   **Penting:** Masukkan data dummy (fiktif) ke dalam tabel-tabel ini agar simulasi dapat berjalan. Contoh perintah `INSERT` ada di dalam file `README.md` ini (lihat bagian Pengujian Lokal).

3.  **Konfigurasi Variabel Lingkungan:**
    *   Navigasi ke dalam folder `chat-app`.
    *   Salin file `.env.example` menjadi file baru bernama `.env`.
    *   Buka file `.env` dan isi nilai-nilai berikut:
        *   `DATABASE_URL`: **Wajib.** Connection String database PostgreSQL Anda (misalnya, `postgresql://user:password@host:port/database`).
        *   `GOOGLE_CLIENT_ID`: **Wajib.** Client ID Anda dari Google Cloud Console.
        *   `GOOGLE_CLIENT_SECRET`: **Wajib.** Client Secret Anda dari Google Cloud Console.
        *   `CALLBACK_URL`: **Wajib.** URL callback yang Anda daftarkan di Google Cloud Console (misalnya, `http://localhost:3000/auth/google/callback` untuk lokal).
        *   `SESSION_SECRET`: **Wajib.** String acak yang panjang dan aman.
        *   `OPENROUTER_API_KEY`: **Wajib.** API Key Anda dari OpenRouter (atau penyedia LLM lain).
        *   `PORT`: Port server (default: 3000).
        *   `OPENROUTER_URL`: URL endpoint API OpenRouter (default: `https://openrouter.ai/api/v1/chat/completions`).

4.  **Instal Dependensi:**
    *   Buka terminal atau command prompt.
    *   Navigasi ke direktori `chat-app`.
    *   Jalankan perintah berikut:
        ```bash
        npm install
        ```
    *   Ini akan menginstal semua dependensi, termasuk `pg` (driver PostgreSQL) dan dependensi pengembangan untuk Tailwind CSS.

## Menjalankan Aplikasi

1.  **Pastikan Database Berjalan & Terkonfigurasi:** Aplikasi memerlukan koneksi yang valid ke database PostgreSQL melalui `DATABASE_URL` di file `.env` untuk berfungsi.

2.  **Mode Pengembangan (Lokal):**
    *   Perintah ini akan menjalankan server menggunakan `nodemon` (untuk restart otomatis saat file server berubah) **dan** menjalankan proses `tailwindcss --watch` untuk memantau perubahan pada file HTML/JS dan secara otomatis membangun ulang file `tailwind.css`.
        ```bash
        npm run dev
        ```
    *   Server akan berjalan di `http://localhost:PORT` (default: `http://localhost:3000`).

3.  **Mode Produksi (Misalnya di Render):**
    *   Perintah ini akan terlebih dahulu membangun versi minified dari file CSS Tailwind, kemudian menjalankan server Node.js.
        ```bash
        npm start
        ```
    *   Pastikan environment variable `DATABASE_URL` dan variabel lainnya sudah diatur dengan benar di platform hosting Anda.

## Pengembangan Frontend (Tailwind CSS)

*   **Styling:** Styling utama dilakukan menggunakan utility classes Tailwind langsung di file HTML (`public/login.html`, `public/chat.html`).
*   **Konfigurasi Tailwind:** File `tailwind.config.js` mengkonfigurasi path file yang dipindai oleh Tailwind untuk mencari class yang digunakan.
*   **Input CSS:** File `src/input.css` berisi direktif dasar Tailwind. Anda dapat menambahkan CSS kustom di sini jika diperlukan.
*   **Output CSS:** Proses build Tailwind menghasilkan file `public/css/tailwind.css`.
*   **Build Manual:** `npm run build:css`
*   **Deteksi Tautan:** Logika untuk mendeteksi dan mengubah tautan menjadi tombol ada di dalam fungsi `addMessageToUI` di file `public/js/chat.js`.

## Simulasi Asisten Kredit

*   **Cara Kerja:** Ketika pengguna mengirim pesan, server mengambil data kredit fiktif dari database **PostgreSQL** untuk pengguna yang sedang login (menggunakan ID Google yang terotentikasi). Data ini kemudian dimasukkan ke dalam prompt yang dikirim ke API LLM.
*   **Keamanan:** Sistem secara otomatis menggunakan ID Google pengguna yang terotentikasi untuk mengambil data dari database, memastikan bahwa pengguna hanya dapat mengakses data mereka sendiri.
*   **Pengguna Simulasi:** Untuk menguji fitur ini, Anda perlu login dengan akun Google Anda, dan memastikan bahwa data kredit fiktif untuk ID Google Anda telah dimasukkan ke dalam database PostgreSQL.
*   **Contoh Pertanyaan:** Coba tanyakan (sesuaikan dengan data dummy yang Anda masukkan):
    *   "Berapa skor kredit saya?"
    *   "Bagaimana riwayat pembayaran kartu kredit saya?"
    *   "Apakah saya punya denda keterlambatan?"
    *   "Berikan saran untuk meningkatkan skor kredit saya."

## Skema Database Simulasi (PostgreSQL - lihat `schema.sql`)

File `schema.sql` berisi perintah `CREATE TABLE` untuk database PostgreSQL Anda.

## Struktur Proyek

```
chat-app/
├── public/
│   ├── css/
│   │   └── tailwind.css
│   ├── img/
│   ├── js/
│   │   └── chat.js       # Logika frontend chat, termasuk deteksi tautan
│   ├── chat.html
│   └── login.html
├── src/
│   ├── config/
│   │   ├── database.js   # Koneksi PostgreSQL (via Pool)
│   │   └── passport.js
│   ├── input.css
│   └── server.js
├── .env                # Variabel lingkungan (DIBUAT MANUAL)
├── .env.example
├── .gitignore
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── schema.sql          # Skema database PostgreSQL
└── README.md           # Dokumentasi ini
```

## Catatan Penting

*   **Wajib Konfigurasi `.env`:** Aplikasi **tidak akan berjalan** tanpa konfigurasi `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, dan `OPENROUTER_API_KEY` yang valid di file `.env` (atau environment variables di hosting).
*   **Simulasi:** Fitur asisten kredit adalah simulasi dengan data fiktif yang Anda masukkan ke database PostgreSQL.
*   **Keamanan:** Jangan pernah commit file `.env` atau Connection String database Anda ke Git.
*   **Persistensi Riwayat Chat:** Riwayat percakapan chat masih disimpan di memori server dan akan hilang saat restart.
