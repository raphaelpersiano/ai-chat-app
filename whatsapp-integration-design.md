# Desain Arsitektur Integrasi WhatsApp dengan Sistem AI

## Analisis Sistem AI yang Sudah Ada

### Komponen Utama:
1. **Express Server** dengan Socket.IO untuk real-time chat
2. **Google OAuth** untuk autentikasi user
3. **PostgreSQL** untuk data kredit user (main database)
4. **Supabase** untuk logging chat dan session management
5. **OpenRouter API** dengan model `google/gemini-2.0-flash-exp:free`
6. **Knowledge Base** dari PDF yang di-fetch secara dinamis

### Session Management:
- Session dibuat per koneksi Socket.IO
- User ID dari Google OAuth digunakan sebagai identifier
- Chat history disimpan di Supabase dengan session_id
- Conversation history disimpan dalam memory per socket

## Arsitektur Integrasi WhatsApp

### 1. Endpoint Webhook WhatsApp
- **URL**: `/webhook/whatsapp`
- **Method**: POST (untuk menerima pesan)
- **Method**: GET (untuk verifikasi webhook)

### 2. Meta Developer Credentials (Environment Variables)
```env
# Meta WhatsApp Business API
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
META_PHONE_NUMBER_ID=your_phone_number_id
META_BUSINESS_ACCOUNT_ID=your_business_account_id
META_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
META_ACCESS_TOKEN=your_access_token
```

### 3. Mapping WhatsApp ke Sistem AI

#### User Identification:
- **WhatsApp Phone Number** → **User ID** (gunakan nomor telepon sebagai unique identifier)
- Buat user dummy di database jika belum ada (mirip dengan Google OAuth flow)

#### Session Management:
- **WhatsApp Phone Number** → **Session ID**
- Buat session baru untuk setiap percakapan WhatsApp
- Gunakan ChatLogger yang sudah ada untuk logging

#### Message Flow:
```
WhatsApp User → Meta Webhook → Express Endpoint → AI Processing → Response → WhatsApp API → User
```

### 4. Adaptasi Sistem yang Ada

#### Modifikasi yang Diperlukan:
1. **Buat endpoint webhook baru** untuk menerima pesan WhatsApp
2. **Adaptasi generateAIResponse()** untuk menerima input dari WhatsApp
3. **Buat session management** berdasarkan nomor telepon
4. **Integrasikan dengan ChatLogger** untuk logging pesan WhatsApp
5. **Tambahkan WhatsApp API client** untuk mengirim respons

#### Komponen Baru:
1. **WhatsApp Webhook Handler**
2. **WhatsApp Session Manager**
3. **WhatsApp API Client**
4. **Phone Number to User ID Mapper**

### 5. Flow Diagram

```
1. User mengirim pesan ke WhatsApp Business Number
2. Meta mengirim webhook ke /webhook/whatsapp
3. Server memverifikasi webhook signature
4. Extract phone number dan message content
5. Map phone number ke user_id (buat jika belum ada)
6. Buat/ambil session untuk user tersebut
7. Log user message ke ChatLogger
8. Proses message dengan AI (gunakan existing generateAIResponse logic)
9. Log AI response ke ChatLogger
10. Kirim response ke WhatsApp API
11. WhatsApp mengirim response ke user
```

### 6. Buffering Strategy
Implementasikan buffering 15 detik seperti di sistem yang ada:
- Reset timer setiap ada pesan baru dari nomor yang sama
- Setelah 15 detik, proses semua pesan yang ter-buffer
- Generate satu respons AI yang menggabungkan semua pesan

### 7. Error Handling
- Webhook verification failure
- WhatsApp API rate limiting
- AI API failures
- Database connection issues
- Invalid phone number format

### 8. Security Considerations
- Verifikasi webhook signature dari Meta
- Validate phone number format
- Rate limiting per phone number
- Sanitize input messages

