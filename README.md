# Chat App dengan Login Google & Admin AI

Ini adalah aplikasi web sederhana yang memungkinkan pengguna login menggunakan akun Google mereka dan berinteraksi dalam ruang chat dengan admin yang didukung oleh AI (menggunakan API OpenRouter).

## Fitur

*   Login pengguna melalui Google OAuth 2.0.
*   Antarmuka chat real-time seperti WhatsApp menggunakan Socket.IO.
*   Admin chat yang didukung oleh AI (model Llama melalui OpenRouter).
*   Server backend menggunakan Node.js dan Express.

## Prasyarat

*   Node.js (versi 18 atau lebih baru direkomendasikan)
*   npm (biasanya terinstal bersama Node.js)
*   Akun Google Cloud untuk kredensial OAuth 2.0.
*   API Key dari OpenRouter.

## Setup dan Instalasi

1.  **Ekstrak File Zip:**
    *   Unduh file `chat-app-source.zip`.
    *   Ekstrak isinya ke direktori pilihan Anda. Anda akan mendapatkan folder `chat-app`.

2.  **Konfigurasi Variabel Lingkungan:**
    *   Navigasi ke dalam folder `chat-app`.
    *   Salin file `.env.example` menjadi file baru bernama `.env`.
    *   Buka file `.env` dan isi nilai-nilai berikut:
        *   `GOOGLE_CLIENT_ID`: Client ID Anda dari Google Cloud Console (lihat `google_oauth_setup_guide.md`).
        *   `GOOGLE_CLIENT_SECRET`: Client Secret Anda dari Google Cloud Console.
        *   `CALLBACK_URL`: URL callback yang Anda daftarkan di Google Cloud Console (misalnya, `http://localhost:3000/auth/google/callback` untuk pengembangan lokal).
        *   `SESSION_SECRET`: String acak yang panjang dan aman untuk mengamankan sesi (gunakan generator password).
        *   `OPENROUTER_API_KEY`: API Key Anda dari OpenRouter.
        *   `PORT`: Port tempat server akan berjalan (default: 3000).
        *   `OPENROUTER_URL`: URL endpoint API OpenRouter (default: `https://openrouter.ai/api/v1/chat/completions`).

3.  **Instal Dependensi:**
    *   Buka terminal atau command prompt.
    *   Navigasi ke direktori `chat-app`.
    *   Jalankan perintah berikut:
        ```bash
        npm install
        ```

## Menjalankan Aplikasi

1.  **Mode Pengembangan:**
    *   Untuk menjalankan server dengan pemantauan perubahan file (menggunakan nodemon):
        ```bash
        npm run dev
        ```
    *   Server akan berjalan di `http://localhost:PORT` (default: `http://localhost:3000`).

2.  **Mode Produksi:**
    *   Untuk menjalankan server dalam mode produksi:
        ```bash
        npm start
        ```
    *   Server akan berjalan di `http://localhost:PORT`.

## Struktur Proyek

```
chat-app/
├── public/             # File statis (HTML, CSS, JS klien, gambar)
│   ├── css/
│   ├── img/
│   ├── js/
│   ├── chat.html
│   └── login.html
├── src/                # Kode sumber server
│   ├── config/         # File konfigurasi (Passport)
│   ├── middleware/     # Middleware Express (jika ada)
│   ├── routes/         # Rute Express (jika dipisah)
│   └── server.js       # File utama server Express & Socket.IO
├── .env                # Variabel lingkungan (DIBUAT MANUAL, JANGAN DI-COMMIT)
├── .env.example        # Contoh file .env
├── .gitignore          # File/folder yang diabaikan Git
├── package.json        # Metadata proyek dan dependensi
├── package-lock.json   # Versi dependensi yang terkunci
└── README.md           # Dokumentasi ini
```

## Catatan Penting

*   Pastikan file `.env` Anda tidak pernah di-commit ke sistem kontrol versi seperti Git.
*   Kredensial Google OAuth dan API Key OpenRouter bersifat rahasia.
*   Aplikasi ini menggunakan penyimpanan riwayat percakapan sederhana di memori server untuk setiap koneksi socket. Riwayat akan hilang saat server di-restart atau koneksi terputus. Untuk persistensi, diperlukan implementasi database.
