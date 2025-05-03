# Chat App dengan Login Google & Asisten Kredit AI (Simulasi)

Ini adalah aplikasi web sederhana yang memungkinkan pengguna login menggunakan akun Google mereka dan berinteraksi dalam ruang chat dengan admin yang didukung oleh AI. Aplikasi ini juga mencakup **simulasi** asisten kredit, di mana AI dapat memberikan wawasan dan saran berdasarkan **data kredit fiktif** pengguna. Frontend aplikasi ini menggunakan **Tailwind CSS** untuk styling.

**PENTING:** Fitur asisten kredit menggunakan database SQLite lokal (`credit_sim.db`) dengan data pengguna yang sepenuhnya **fiktif** untuk tujuan demonstrasi. Aplikasi ini **tidak** terhubung ke data biro kredit sungguhan.

## Fitur

*   Login pengguna melalui Google OAuth 2.0.
*   Antarmuka chat real-time seperti WhatsApp menggunakan Socket.IO.
*   Admin chat yang didukung oleh AI (model Llama melalui OpenRouter).
*   **Simulasi Asisten Kredit:** AI dapat menjawab pertanyaan tentang data kredit fiktif pengguna (skor, riwayat pembayaran) dan memberikan saran berdasarkan data tersebut.
*   Server backend menggunakan Node.js dan Express.
*   Database SQLite lokal untuk menyimpan data kredit fiktif.
*   Frontend modern menggunakan **Tailwind CSS**.

## Prasyarat

*   Node.js (versi 18 atau lebih baru direkomendasikan)
*   npm (biasanya terinstal bersama Node.js)
*   Akun Google Cloud untuk kredensial OAuth 2.0.
*   API Key dari OpenRouter (atau penyedia LLM lain yang kompatibel).

## Setup dan Instalasi

1.  **Ekstrak File Zip:**
    *   Unduh file zip kode sumber.
    *   Ekstrak isinya ke direktori pilihan Anda. Anda akan mendapatkan folder `chat-app`.

2.  **Konfigurasi Variabel Lingkungan:**
    *   Navigasi ke dalam folder `chat-app`.
    *   Salin file `.env.example` menjadi file baru bernama `.env`.
    *   Buka file `.env` dan isi nilai-nilai berikut:
        *   `GOOGLE_CLIENT_ID`: **Wajib.** Client ID Anda dari Google Cloud Console.
        *   `GOOGLE_CLIENT_SECRET`: **Wajib.** Client Secret Anda dari Google Cloud Console.
        *   `CALLBACK_URL`: **Wajib.** URL callback yang Anda daftarkan di Google Cloud Console (misalnya, `http://localhost:3000/auth/google/callback` untuk lokal).
        *   `SESSION_SECRET`: **Wajib.** String acak yang panjang dan aman.
        *   `OPENROUTER_API_KEY`: **Wajib.** API Key Anda dari OpenRouter (atau penyedia LLM lain).
        *   `PORT`: Port server (default: 3000).
        *   `OPENROUTER_URL`: URL endpoint API OpenRouter (default: `https://openrouter.ai/api/v1/chat/completions`).

3.  **Instal Dependensi:**
    *   Buka terminal atau command prompt.
    *   Navigasi ke direktori `chat-app`.
    *   Jalankan perintah berikut:
        ```bash
        npm install
        ```
    *   Ini akan menginstal semua dependensi, termasuk `sqlite3` dan dependensi pengembangan untuk Tailwind CSS.

## Menjalankan Aplikasi

1.  **Inisialisasi Database:** Saat pertama kali dijalankan (`npm run dev` atau `npm start`), server akan secara otomatis membuat file database SQLite bernama `credit_sim.db` di direktori root proyek dan membuat tabel-tabel yang diperlukan. Server juga akan memasukkan data kredit fiktif untuk pengguna dengan ID `dummy_google_id_123`.

2.  **Mode Pengembangan:**
    *   Perintah ini akan menjalankan server menggunakan `nodemon` (untuk restart otomatis saat file server berubah) **dan** menjalankan proses `tailwindcss --watch` untuk memantau perubahan pada file HTML/JS dan secara otomatis membangun ulang file `tailwind.css`.
        ```bash
        npm run dev
        ```
    *   Server akan berjalan di `http://localhost:PORT` (default: `http://localhost:3000`).

3.  **Mode Produksi:**
    *   Perintah ini akan terlebih dahulu membangun versi minified dari file CSS Tailwind, kemudian menjalankan server Node.js.
        ```bash
        npm start
        ```
    *   Server akan berjalan di `http://localhost:PORT`.

## Pengembangan Frontend (Tailwind CSS)

*   **Styling:** Styling utama dilakukan menggunakan utility classes Tailwind langsung di file HTML (`public/login.html`, `public/chat.html`).
*   **Konfigurasi Tailwind:** File `tailwind.config.js` mengkonfigurasi path file yang dipindai oleh Tailwind untuk mencari class yang digunakan.
*   **Input CSS:** File `src/input.css` berisi direktif dasar Tailwind (`@tailwind base;`, `@tailwind components;`, `@tailwind utilities;`). Anda dapat menambahkan CSS kustom di sini jika diperlukan.
*   **Output CSS:** Proses build Tailwind (dijalankan oleh `npm run dev` atau `npm start`) menghasilkan file `public/css/tailwind.css` yang digunakan oleh file HTML.
*   **Build Manual:** Jika Anda hanya ingin membangun ulang CSS tanpa menjalankan server, gunakan:
    ```bash
    npm run build:css
    ```

## Simulasi Asisten Kredit

*   **Cara Kerja:** Ketika pengguna mengirim pesan, server mengambil data kredit fiktif dari database SQLite untuk pengguna yang sedang aktif (saat ini di-hardcode ke `dummy_google_id_123` untuk simulasi). Data ini kemudian dimasukkan ke dalam prompt yang dikirim ke API LLM. LLM menggunakan konteks data fiktif ini untuk menghasilkan respons.
*   **Pengguna Simulasi:** Untuk menguji fitur ini, Anda perlu login dengan akun Google mana saja. Backend saat ini akan selalu mengambil data untuk `dummy_google_id_123` terlepas dari siapa yang login (ini adalah bagian dari penyederhanaan simulasi).
*   **Contoh Pertanyaan:** Coba tanyakan:
    *   "Berapa skor kredit saya?"
    *   "Bagaimana riwayat pembayaran kartu kredit saya?"
    *   "Apakah saya punya denda keterlambatan?"
    *   "Berikan saran untuk meningkatkan skor kredit saya."

## Skema Database Simulasi (SQLite - `credit_sim.db`)

```sql
CREATE TABLE UserCreditInsights (...);
CREATE TABLE UserTradelineData (...);
CREATE TABLE UserPaymentHistory (...);
-- (Skema lengkap seperti sebelumnya)
```

## Struktur Proyek

```
chat-app/
├── public/
│   ├── css/
│   │   └── tailwind.css  # CSS yang dihasilkan Tailwind (JANGAN EDIT LANGSUNG)
│   ├── img/
│   ├── js/
│   ├── chat.html
│   └── login.html
├── src/
│   ├── config/
│   │   ├── database.js
│   │   └── passport.js
│   ├── input.css         # File input untuk Tailwind
│   └── server.js
├── .env                # Variabel lingkungan (DIBUAT MANUAL)
├── .env.example
├── .gitignore
├── package.json
├── tailwind.config.js  # Konfigurasi Tailwind
├── postcss.config.js   # Konfigurasi PostCSS
├── credit_sim.db       # File database SQLite (DIBUAT OTOMATIS)
└── README.md           # Dokumentasi ini
```

## Catatan Penting

*   **Wajib Konfigurasi `.env`:** Aplikasi **tidak akan berjalan** tanpa konfigurasi `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, dan `OPENROUTER_API_KEY` yang valid di file `.env`.
*   **Simulasi:** Ingatlah bahwa fitur asisten kredit adalah simulasi dengan data fiktif.
*   **Keamanan:** Jangan pernah commit file `.env` Anda ke Git.
*   **Persistensi Riwayat Chat:** Riwayat percakapan chat masih disimpan di memori server dan akan hilang saat restart.
