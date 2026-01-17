# ChatHama - Perbandingan WebSocket vs TCP Chat

Proyek ini mengimplementasikan sistem chat real-time menggunakan dua protokol berbeda: WebSocket dan TCP, untuk tujuan perbandingan.

## Fitur

- **WebSocket Chat**: Chat melalui browser menggunakan WebSocket (port 3000)
- **TCP Chat**: Chat melalui terminal menggunakan TCP socket (port 3002)
- Sistem autentikasi JWT
- Chat global, room, dan private
- File upload (gambar dan suara)
- Sistem kontak
- Panggilan video (WebRTC)

## Cara Menjalankan

1. Install dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Setup database MySQL dengan file `sql/chat_campus.sql`

3. Jalankan server:
   ```bash
   npm start
   # atau
   node app.js
   ```

## Menggunakan WebSocket Chat

1. Buka browser ke `https://localhost:3000`
2. Register/Login
3. Chat di browser

## Menggunakan TCP Chat

1. Jalankan client TCP:
   ```bash
   node tcp-client.js
   ```

2. Login dengan username dan password yang sama seperti WebSocket.

3. **TCP hanya mendukung Global Chat**. Pesan akan tampil sebagai "username: pesan" dan realtime di WebSocket juga.

## Perbandingan WebSocket vs TCP

### WebSocket
- **Protokol**: HTTP Upgrade ke WebSocket
- **Transport**: TCP dengan framing WebSocket
- **Browser Support**: Native di browser modern
- **Keamanan**: Menggunakan HTTPS/WSS
- **Overhead**: Header WebSocket frame
- **Use Case**: Real-time web apps

### TCP
- **Protokol**: Raw TCP
- **Transport**: Direct TCP connection
- **Browser Support**: Tidak native, perlu library atau Node.js
- **Keamanan**: JWT authentication
- **Overhead**: Minimal
- **Real-time**: Ya, broadcast ke WebSocket clients juga
- **Use Case**: Terminal-based chat, performance comparison

## Testing

- WebSocket: Buka beberapa tab browser
- TCP: Jalankan beberapa instance `node tcp-client.js` di terminal berbeda