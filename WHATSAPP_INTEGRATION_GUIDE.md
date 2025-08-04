# Panduan Integrasi WhatsApp dengan Sistem AI

## Deskripsi

Dokumentasi ini menjelaskan cara mengintegrasikan sistem AI chat yang sudah ada dengan WhatsApp Business API menggunakan Meta Developer Platform. Integrasi ini memungkinkan pengguna untuk berinteraksi dengan AI melalui WhatsApp dengan memanfaatkan sistem session management dan logging yang sudah ada.

## Fitur Utama

### 1. **Integrasi WhatsApp Business API**
- Webhook untuk menerima pesan masuk dari WhatsApp
- Verifikasi signature untuk keamanan
- Pengiriman respons AI ke WhatsApp
- Support untuk typing indicator

### 2. **Session Management**
- Mapping nomor telepon WhatsApp ke user ID
- Pembuatan user dummy otomatis untuk nomor baru
- Session tracking dengan ChatLogger yang sudah ada
- Conversation history per nomor telepon

### 3. **AI Processing**
- Menggunakan sistem AI yang sama dengan web chat
- Knowledge base dari PDF yang sama
- Model AI: `google/gemini-2.0-flash-exp:free`
- Message buffering dengan debounced processing (15 detik)

### 4. **Logging dan Analytics**
- Integrasi dengan ChatLogger (Supabase)
- Tracking pesan user dan respons AI
- Session analytics dan statistics

## Struktur File Baru

```
src/
├── whatsappWebhook.js          # Handler untuk webhook WhatsApp
├── whatsappSessionManager.js   # Manajemen session WhatsApp
├── whatsappAIProcessor.js      # Processor AI untuk WhatsApp
├── server_whatsapp.js          # Server utama dengan integrasi WhatsApp
└── (file lainnya tetap sama)

.env.whatsapp.example           # Template environment variables
package_whatsapp.json           # Package.json dengan dependencies
```

## Konfigurasi Environment Variables

Salin file `.env.whatsapp.example` ke `.env` dan isi dengan nilai yang sesuai:

```env
# Original Environment Variables
PORT=3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
CALLBACK_URL=http://localhost:3000/auth/google/callback
SESSION_SECRET=your_session_secret
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_URL=https://openrouter.ai/api/v1/chat/completions

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
SUPABASE_DATABASE_URL=postgresql://username:password@supabase_host:5432/database_name

# WhatsApp Business API Configuration (Meta Developer)
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
META_PHONE_NUMBER_ID=your_phone_number_id
META_BUSINESS_ACCOUNT_ID=your_business_account_id
META_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
META_ACCESS_TOKEN=your_access_token

# Optional Configuration
ENABLE_CHAT_LOGGING=true
ENABLE_CLEANUP=true
CLEANUP_OLD_SESSIONS_DAYS=30
```

### Cara Mendapatkan Credentials Meta Developer:

1. **App ID & App Secret**: Dari Meta Developer Console > Your App > Settings > Basic
2. **Phone Number ID**: Dari WhatsApp Business API > API Setup
3. **Business Account ID**: Dari WhatsApp Business API > API Setup
4. **Access Token**: Generate dari WhatsApp Business API > API Setup
5. **Webhook Verify Token**: Buat token random untuk verifikasi webhook

## Setup Meta Developer

### 1. Konfigurasi Webhook

Di Meta Developer Console:
- URL: `https://your-domain.com/webhook/whatsapp`
- Verify Token: Sesuai dengan `META_WEBHOOK_VERIFY_TOKEN`
- Subscribe to: `messages`

### 2. Permissions

Pastikan app memiliki permissions:
- `whatsapp_business_messaging`
- `whatsapp_business_management`

## Instalasi dan Menjalankan

### 1. Install Dependencies

```bash
npm install
# atau gunakan package_whatsapp.json
cp package_whatsapp.json package.json
npm install
```

### 2. Setup Database

Pastikan database PostgreSQL dan Supabase sudah dikonfigurasi sesuai dengan sistem yang ada.

### 3. Jalankan Server

```bash
# Jalankan server dengan integrasi WhatsApp
npm start
# atau
node src/server_whatsapp.js

# Untuk development
npm run dev
# atau
nodemon src/server_whatsapp.js

# Jalankan server original (tanpa WhatsApp)
npm run start:original
```

## Cara Kerja Sistem

### 1. **Flow Pesan Masuk**

```
User WhatsApp → Meta Webhook → /webhook/whatsapp → Message Buffering → AI Processing → Response → WhatsApp API → User
```

### 2. **Message Buffering**

- Sistem menggunakan debounced processing dengan timer 15 detik
- Setiap pesan baru akan reset timer
- Setelah 15 detik tanpa pesan baru, semua pesan di-buffer akan diproses sekaligus
- AI akan generate satu respons yang menggabungkan semua pesan

### 3. **Session Management**

- Nomor telepon WhatsApp di-mapping ke user ID format: `whatsapp_{clean_number}`
- User baru otomatis dibuatkan dummy data kredit
- Session tracking menggunakan ChatLogger yang sudah ada
- Conversation history disimpan per nomor telepon

### 4. **User ID Generation**

```javascript
// Contoh: +62812345678 → whatsapp_62812345678
const userId = `whatsapp_${phoneNumber.replace(/\D/g, '')}`;
```

## API Endpoints Baru

### 1. **WhatsApp Webhook**

```
GET  /webhook/whatsapp    # Verifikasi webhook Meta
POST /webhook/whatsapp    # Menerima pesan dari WhatsApp
```

### 2. **WhatsApp Management**

```
GET  /api/whatsapp/status      # Status konfigurasi WhatsApp
POST /api/whatsapp/refresh-kb  # Refresh knowledge base
```

## Testing

### 1. **Verifikasi Konfigurasi**

```bash
curl http://localhost:3000/api/whatsapp/status
```

Response:
```json
{
  "webhook": {
    "accessToken": true,
    "phoneNumberId": true,
    "verifyToken": true,
    "appSecret": true,
    "isConfigured": true
  },
  "ai": {
    "openRouterApiKey": true,
    "databaseUrl": true,
    "knowledgeBaseLoaded": true,
    "isConfigured": true
  },
  "sessions": {
    "activeSessions": 0,
    "sessions": []
  },
  "isFullyConfigured": true
}
```

### 2. **Test Webhook Verification**

```bash
curl "http://localhost:3000/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

### 3. **Test dengan WhatsApp**

1. Kirim pesan ke nomor WhatsApp Business yang dikonfigurasi
2. Cek log server untuk melihat proses
3. Tunggu respons AI (maksimal 15 detik + processing time)

## Monitoring dan Logging

### 1. **Server Logs**

Server akan menampilkan log untuk:
- Webhook verification
- Pesan masuk dari WhatsApp
- Message buffering
- AI processing
- Pengiriman respons

### 2. **Database Logging**

Jika ChatLogger enabled:
- Session tracking di Supabase
- Message logging (user dan AI)
- Analytics dan statistics

### 3. **Error Handling**

- Invalid webhook signature
- WhatsApp API rate limiting
- AI API failures
- Database connection issues

## Troubleshooting

### 1. **Webhook Tidak Terverifikasi**

- Pastikan `META_WEBHOOK_VERIFY_TOKEN` sesuai dengan Meta Developer Console
- Cek URL webhook sudah benar
- Pastikan server dapat diakses dari internet

### 2. **Pesan Tidak Diterima**

- Cek webhook subscription di Meta Developer Console
- Pastikan `META_APP_SECRET` benar untuk signature verification
- Cek log server untuk error

### 3. **AI Tidak Merespons**

- Pastikan `OPENROUTER_API_KEY` valid
- Cek `DATABASE_URL` untuk akses data kredit
- Pastikan knowledge base ter-load dengan benar

### 4. **Respons Tidak Terkirim**

- Pastikan `META_ACCESS_TOKEN` valid dan tidak expired
- Cek `META_PHONE_NUMBER_ID` sesuai dengan nomor yang dikonfigurasi
- Pastikan nomor pengirim ter-register di WhatsApp Business

## Keamanan

### 1. **Webhook Signature Verification**

Sistem memverifikasi signature setiap webhook menggunakan `META_APP_SECRET` untuk memastikan pesan benar-benar dari Meta.

### 2. **Environment Variables**

Semua credentials disimpan di environment variables, jangan commit ke repository.

### 3. **Rate Limiting**

Sistem menggunakan message buffering untuk menghindari spam dan mengoptimalkan penggunaan AI API.

## Deployment

### 1. **Server Requirements**

- Node.js 16+
- PostgreSQL database
- Supabase account (untuk logging)
- Domain dengan SSL certificate
- Port 3000 atau sesuai konfigurasi

### 2. **Environment Setup**

```bash
# Production
NODE_ENV=production
PORT=3000

# Pastikan semua environment variables ter-set
```

### 3. **Process Management**

```bash
# Menggunakan PM2
pm2 start src/server_whatsapp.js --name "ai-chat-whatsapp"

# Atau systemd service
sudo systemctl start ai-chat-whatsapp
```

## Maintenance

### 1. **Session Cleanup**

Sistem otomatis membersihkan session WhatsApp yang tidak aktif setiap jam.

### 2. **Database Cleanup**

Jika `ENABLE_CLEANUP=true`, sistem akan membersihkan session lama setiap 24 jam.

### 3. **Knowledge Base Refresh**

Knowledge base dapat di-refresh manual melalui API:

```bash
curl -X POST http://localhost:3000/api/whatsapp/refresh-kb
```

## Kompatibilitas

### 1. **Backward Compatibility**

- Web chat tetap berfungsi normal
- Semua endpoint original tetap tersedia
- Database schema tidak berubah

### 2. **Dual Mode**

Sistem dapat menjalankan web chat dan WhatsApp chat secara bersamaan tanpa konflik.

## Support

Untuk pertanyaan atau issue, silakan cek:
1. Log server untuk error details
2. Status endpoint untuk konfigurasi
3. Meta Developer Console untuk webhook status
4. Database connection untuk data issues



## Quick Start Guide

### Langkah Cepat untuk Memulai

#### 1. **Persiapan Credentials Meta Developer**

Sebelum memulai, pastikan Anda sudah memiliki:
- App ID dari Meta Developer Console
- App Secret dari Meta Developer Console  
- Phone Number ID dari WhatsApp Business API
- Business Account ID dari WhatsApp Business API
- Access Token yang valid
- Webhook Verify Token (buat sendiri, string random)

#### 2. **Setup Environment**

```bash
# 1. Copy environment template
cp .env.whatsapp.example .env

# 2. Edit file .env dengan credentials Anda
nano .env

# 3. Pastikan isi minimal ini:
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret  
META_PHONE_NUMBER_ID=your_phone_number_id
META_BUSINESS_ACCOUNT_ID=your_business_account_id
META_WEBHOOK_VERIFY_TOKEN=your_random_token
META_ACCESS_TOKEN=your_access_token
OPENROUTER_API_KEY=your_openrouter_key
DATABASE_URL=your_postgresql_url
```

#### 3. **Install dan Jalankan**

```bash
# 1. Install dependencies
npm install

# 2. Jalankan server
node src/server_whatsapp.js

# Server akan berjalan di port 3000 (atau sesuai PORT di .env)
```

#### 4. **Konfigurasi Webhook di Meta Developer**

1. Buka Meta Developer Console
2. Pilih app Anda
3. Masuk ke WhatsApp > Configuration
4. Set Webhook URL: `https://your-domain.com/webhook/whatsapp`
5. Set Verify Token: sesuai dengan `META_WEBHOOK_VERIFY_TOKEN` di .env
6. Subscribe to: `messages`
7. Klik Verify and Save

#### 5. **Test Integrasi**

```bash
# 1. Cek status konfigurasi
curl http://localhost:3000/api/whatsapp/status

# 2. Test webhook verification
curl "http://localhost:3000/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"

# 3. Kirim pesan WhatsApp ke nomor business Anda
# AI akan merespons dalam 15 detik
```

### Troubleshooting Cepat

#### ❌ **"WhatsApp integration is not fully configured"**
- Cek semua environment variables META_* sudah diisi
- Pastikan tidak ada typo di nama variable

#### ❌ **"Invalid webhook signature"**  
- Pastikan `META_APP_SECRET` benar
- Cek webhook URL sudah HTTPS

#### ❌ **"Failed to send message"**
- Pastikan `META_ACCESS_TOKEN` valid dan tidak expired
- Cek `META_PHONE_NUMBER_ID` sesuai dengan nomor yang dikonfigurasi

#### ❌ **"AI admin belum selesai"**
- Pastikan `OPENROUTER_API_KEY` valid
- Cek koneksi internet untuk akses OpenRouter API

#### ❌ **"Database belum selesai"**
- Pastikan `DATABASE_URL` valid dan database dapat diakses
- Cek tabel `usercreditinsights`, `usertradelinedata`, `userpaymenthistory` sudah ada

### Tips Deployment

#### **Untuk Development (Local)**
```bash
# Gunakan ngrok untuk expose local server
ngrok http 3000

# Gunakan URL ngrok sebagai webhook URL di Meta Developer
```

#### **Untuk Production**
```bash
# Pastikan server dapat diakses dari internet
# Gunakan domain dengan SSL certificate
# Set NODE_ENV=production

# Contoh dengan PM2
pm2 start src/server_whatsapp.js --name "whatsapp-ai"
pm2 save
pm2 startup
```

### Monitoring

#### **Log yang Perlu Diperhatikan**
```bash
# Webhook verification berhasil
✅ WhatsApp webhook verified successfully

# Pesan diterima
📱 Received 1 messages from 628123456789

# AI processing
🤖 AI response generated in 1234ms for user whatsapp_628123456789

# Respons terkirim  
✅ Message sent to 628123456789
```

#### **Status Endpoint**
```bash
# Cek status real-time
curl http://localhost:3000/api/whatsapp/status | jq
```

Dengan mengikuti Quick Start Guide ini, integrasi WhatsApp dengan sistem AI Anda seharusnya sudah bisa berjalan dalam waktu kurang dari 30 menit.

