// app.js (full - replace your current file)
require('dotenv').config();

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.warn('WARNING: JWT_SECRET not set in .env. Set JWT_SECRET to a strong secret.');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'))); // serve public/

const activeCalls = new Map();

// MySQL pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'chat_campus',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper: sign token
function generateToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

// Middleware auth for REST
function authMiddleware(req, res, next) {
  const hdr = req.headers.authorization || '';
  if (!hdr.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  const token = hdr.split(' ')[1];
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// -------------------------
// REST API
// -------------------------

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username & password required' });

  try {
    const [exists] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (exists.length) return res.status(400).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);

    const token = generateToken({ id: result.insertId, username });
    return res.json({ token, id: result.insertId, username });
  } catch (e) {
    console.error('register error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username & password required' });

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length) return res.status(400).json({ error: 'User not found' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Wrong password' });

    const token = generateToken({ id: user.id, username: user.username });

    // mark online true
    await pool.query('UPDATE users SET is_online = 1 WHERE id = ?', [user.id]);

    return res.json({ token, id: user.id, username: user.username });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get initial data (users, rooms, some messages) - INI YANG HILANG!
app.get('/api/init', authMiddleware, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, username, is_online FROM users ORDER BY username ASC');
    const [rooms] = await pool.query('SELECT id, name FROM rooms ORDER BY id ASC');

    // Global messages DENGAN FILTER cleared_chats
    const [msgs] = await pool.query(
      `SELECT m.*, u.username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.room_id IS NULL AND m.recipient_id IS NULL
         AND m.created_at > COALESCE(
           (SELECT cleared_at FROM user_chat_clears
             WHERE user_id = ? AND room_id IS NULL AND contact_id IS NULL
             LIMIT 1),
           '1970-01-01'
         )
       ORDER BY m.id ASC
       LIMIT 500`,
      [req.user.id]  // 👈 FILTER BERDASARKAN USER YANG LOGIN
    );

    return res.json({ users, rooms, messages: msgs });
  } catch (e) {
    console.error('init error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/rooms', async (req, res) => {
  try {
    const [rooms] = await pool.query('SELECT id, name FROM rooms ORDER BY id ASC');
    return res.json(rooms);
  } catch (e) {
    console.error('rooms error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/rooms', authMiddleware, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Room name required' });

  try {
    const [exists] = await pool.query('SELECT id FROM rooms WHERE name = ?', [name]);
    if (exists.length) return res.status(400).json({ error: 'Room already exists' });

    const [result] = await pool.query('INSERT INTO rooms (name, created_by) VALUES (?, ?)', [name, req.user.id]);
    const room = { id: result.insertId, name };

    broadcastAll({ type: 'room_created', room });

    return res.json({ room });
  } catch (e) {
    console.error('create room error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/rooms/:id/messages', authMiddleware, async (req, res) => {
  try {
    const roomId = parseInt(req.params.id, 10);
    if (Number.isNaN(roomId)) return res.status(400).json({ error: 'Invalid room id' });

    // Cek cleared_at untuk user ini di room ini
    const [clearCheck] = await pool.query(
      'SELECT cleared_at FROM user_chat_clears WHERE user_id = ? AND room_id = ? AND contact_id IS NULL',
      [req.user.id, roomId]
    );

    let clearedAt = '1970-01-01';
    if (clearCheck.length > 0) {
      clearedAt = clearCheck[0].cleared_at;
    }

    console.log('🔍 ROOM CLEAR CHECK:', {
      userId: req.user.id,
      roomId: roomId,
      clearedAt: clearedAt
    });

    const [rows] = await pool.query(
      `SELECT m.id, m.sender_id, m.file_url, m.file_type, m.content,
              m.created_at, u.username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.room_id = ? AND m.created_at > ?
       ORDER BY m.id ASC`,
      [roomId, clearedAt]
    );

    console.log(`✅ ROOM MESSAGES: Found ${rows.length} messages after clearance`);

    const [countRes] = await pool.query('SELECT COUNT(*) AS total FROM messages WHERE room_id = ?', [roomId]);
    const total = countRes[0]?.total || 0;

    return res.json({ roomId, messages: rows, total });
  } catch (e) {
    console.error('room messages error', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// GET private messages between two users (expects usernames in URL)
app.get('/api/private/:me/:target', authMiddleware, async (req, res) => {
  try {
    const me = req.params.me;
    const target = req.params.target;
    const currentUserId = req.user.id;

    // resolve ids
    const [[u1]] = await pool.query('SELECT id FROM users WHERE username = ?', [me]);
    const [[u2]] = await pool.query('SELECT id FROM users WHERE username = ?', [target]);

    if (!u1 || !u2) return res.status(404).json({ error: 'User not found' });

    // Cek cleared_at untuk user ini dengan contact ini
    const [clearCheck] = await pool.query(
      'SELECT cleared_at FROM user_chat_clears WHERE user_id = ? AND contact_id = ?',
      [currentUserId, u2.id]
    );

    let clearedAt = null;
    if (clearCheck.length > 0) {
      clearedAt = clearCheck[0].cleared_at;
    }

    console.log('🔍 PRIVATE CLEAR CHECK:', {
      currentUser: currentUserId,
      contactId: u2.id,
      hasClearRecord: clearCheck.length > 0,
      clearedAt: clearedAt
    });

    // JIKA TIDAK ADA CLEAR RECORD, ambil semua pesan
    if (!clearedAt) {
      const [rows] = await pool.query(
        `SELECT m.id, m.sender_id, m.recipient_id, m.room_id,
                m.content, m.file_url, m.file_type,
                m.created_at, u.username
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE ((m.sender_id = ? AND m.recipient_id = ?)
             OR (m.sender_id = ? AND m.recipient_id = ?))
         ORDER BY m.id ASC`,
        [u1.id, u2.id, u2.id, u1.id]
      );
      console.log(`✅ RETURN ALL: ${rows.length} messages (no clearance)`);
      return res.json({ messages: rows });
    }

    // JIKA ADA CLEAR RECORD, ambil hanya pesan yang dibuat SETELAH cleared_at
    const [rows] = await pool.query(
      `SELECT m.id, m.sender_id, m.recipient_id, m.room_id,
              m.content, m.file_url, m.file_type,
              m.created_at, u.username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE ((m.sender_id = ? AND m.recipient_id = ?)
           OR (m.sender_id = ? AND m.recipient_id = ?))
         AND m.created_at > ?
       ORDER BY m.id ASC`,
      [u1.id, u2.id, u2.id, u1.id, clearedAt]
    );

    console.log(`✅ RETURN FILTERED: ${rows.length} messages after clearance`);

    return res.json({ messages: rows });
  } catch (e) {
    console.error('Private messages error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// -------------------------
// WEBSOCKET server
// -------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ path: "/ws", server });

// Map of ws -> { userId, username }
const clients = new Map();

// helper: broadcast to all connected clients
// helper: broadcast to all connected clients dengan debug
function broadcastAll(obj) {
  const msg = JSON.stringify(obj);
  let sentCount = 0;
  
  for (const [ws, clientInfo] of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
      sentCount++;
    }
  }
  
  console.log(`📢 BROADCAST: ${obj.type} to ${sentCount} clients`);
}

wss.on('connection', async (ws, req) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close();
      return;
    }

    let user;
    try {
      user = jwt.verify(token, SECRET);
    } catch (e) {
      ws.close();
      return;
    }

    // store client
    clients.set(ws, { userId: user.id, username: user.username });

    // mark online in DB
    await pool.query('UPDATE users SET is_online = 1 WHERE id = ?', [user.id]);

    // notify all clients
    broadcastAll({ type: 'user_online', user: { id: user.id, username: user.username } });

    // send init payload (rooms + users)
    const [rooms] = await pool.query('SELECT id, name FROM rooms ORDER BY id ASC');
    const [users] = await pool.query('SELECT id, username, is_online FROM users ORDER BY username ASC');

    ws.send(JSON.stringify({ type: 'init', rooms, users }));

    // handle messages from this ws
    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw);
        const userInfo = clients.get(ws);
        if (!userInfo) return;

        const senderId = userInfo.userId;
        const senderName = userInfo.username;

        // Global message
        if (data.type === "global_message") {
          const content = data.content || "";
          if (!content) return;

          await pool.query('INSERT INTO messages (sender_id, room_id, content) VALUES (?, NULL, ?)', [senderId, content]);

          broadcastAll({
            type: "global_message",
            message: {
              sender_id: senderId,
              content,
              username: `Global — ${senderName}`,
              room_id: null,
              recipient_id: null
            }
          });
          return;
        }

        // Room message
        if (data.type === "room_message") {
          const roomId = data.roomId;
          const content = data.content || "";
          if (!roomId || !content) return;

          await pool.query('INSERT INTO messages (sender_id, room_id, content) VALUES (?, ?, ?)', [senderId, roomId, content]);

          broadcastAll({
            type: "room_message",
            message: {
              sender_id: senderId,
              content,
              username: senderName,
              room_id: roomId
            }
          });
          return;
        }

        // Private text message (NEW)
        if (data.type === "private_message") {
          const recipientId = data.recipientId;
          const content = data.content || "";
          if (!recipientId || !content) return;

          // Save to DB
          await pool.query(
            'INSERT INTO messages (sender_id, recipient_id, content) VALUES (?, ?, ?)',
            [senderId, recipientId, content]
          );

          // Send only to sender and recipient
          for (const [clientWS, clientInfo] of clients) {
            if (clientWS.readyState !== clientWS.OPEN) continue;

            if (clientInfo.userId === senderId || clientInfo.userId === Number(recipientId)) {
              clientWS.send(JSON.stringify({
                type: "private_message",
                message: {
                  sender_id: senderId,
                  recipient_id: recipientId,
                  content,
                  username: senderName,
                  room_id: null
                }
              }));
            }
          }
          return;
        }

        // File message (image/voice)
        if (data.type === "file_message") {
          const fileUrl = data.file_path;
          const fileType = data.file_type || "file";
          const roomId = data.room_id || null;
          const recId = data.recipient_id || null;

          // send to relevant clients (room or private)
          for (const [clientWS, clientInfo] of clients) {
            if (clientWS.readyState !== clientWS.OPEN) continue;

            if (
              roomId ||
              (clientInfo.userId === senderId || clientInfo.userId === Number(recId))
            ) {
              clientWS.send(JSON.stringify({
                type: "file_message",
                message: {
                  sender_id: senderId,
                  username: senderName,
                  file_url: fileUrl,
                  file_type: fileType,
                  room_id: roomId,
                  recipient_id: recId
                }
              }));
            }
          }
          return;
        }

        if (data.type === "call_offer") {
          const { targetUserId, offer, callId } = data;
          console.log(`📞 CALL OFFER: User ${userInfo.userId} -> User ${targetUserId}`);

          // Simpan info panggilan
          activeCalls.set(callId, {
            callerId: userInfo.userId,
            callerName: userInfo.username,
            targetId: targetUserId,
            offer: offer
          });

          // Kirim offer ke target user
          const sent = sendToUser(targetUserId, {
            type: "call_offer",
            callerId: userInfo.userId,
            callerName: userInfo.username,
            offer: offer,
            callId: callId
          });

          if (!sent) {
            // Target tidak online
            ws.send(JSON.stringify({
              type: "call_failed",
              reason: "User tidak online"
            }));
            activeCalls.delete(callId);
          }
          return;
        }

        if (data.type === "call_answer") {
          const { callId, answer } = data;
          console.log(`📞 CALL ANSWER: Untuk panggilan ${callId}`);

          const call = activeCalls.get(callId);
          if (call) {
            // Kirim answer ke caller
            sendToUser(call.callerId, {
              type: "call_answer",
              answer: answer,
              callId: callId
            });
          }
          return;
        }

        if (data.type === "ice_candidate") {
          const { callId, candidate, targetUserId } = data;
          console.log(`📞 ICE CANDIDATE: Untuk panggilan ${callId}`);

          // Kirim candidate ke user lain
          sendToUser(targetUserId, {
            type: "ice_candidate",
            candidate: candidate,
            callId: callId
          });
          return;
        }

        if (data.type === "call_end") {
          const { callId } = data;
          console.log(`📞 CALL END: Panggilan ${callId} diakhiri`);

          const call = activeCalls.get(callId);
          if (call) {
            // Beri tahu kedua user bahwa panggilan berakhir
            sendToUser(call.callerId, { type: "call_end", callId });
            sendToUser(call.targetId, { type: "call_end", callId });
            activeCalls.delete(callId);
          }
          return;
        }

        if (data.type === "call_reject") {
          const { callId } = data;
          console.log(`📞 CALL REJECT: Panggilan ${callId} ditolak`);

          const call = activeCalls.get(callId);
          if (call) {
            // Beri tahu caller bahwa panggilan ditolak
            sendToUser(call.callerId, {
              type: "call_rejected",
              callId: callId,
              reason: "Panggilan ditolak"
            });
            activeCalls.delete(callId);
          }
          return;
        }

      } catch (err) {
        console.error("ws message handling error", err);
      }
    });

    ws.on('close', async () => {
      clients.delete(ws);
      try {
        await pool.query('UPDATE users SET is_online = 0 WHERE id = ?', [user.id]);
      } catch (e) { /* ignore */ }
      broadcastAll({ type: 'user_offline', user: { id: user.id } });
    });

  } catch (e) {
    console.error('ws connection error', e);
    try { ws.close(); } catch (e) {}
  }
});

function sendToUser(userId, data) {
  for (const [ws, clientInfo] of clients) {
    if (clientInfo.userId === userId && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
  }
  return false;
}

function createStorage(subFolder) {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      const folder = path.join(__dirname, `uploads/${subFolder}`);
      fs.mkdirSync(folder, { recursive: true });
      cb(null, folder);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      const filename = Date.now() + "_" + Math.random().toString(36).slice(2) + ext;
      cb(null, filename);
    }
  });
}

const uploadImage = multer({ storage: createStorage("images") });
const uploadVoice = multer({ storage: createStorage("voices") });

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.post("/api/upload/image", authMiddleware, uploadImage.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const senderId = req.user.id;
  const roomId = req.body.roomId || null;
  const recipientId = req.body.recipientId || null;
  const fileUrl = "/uploads/images/" + req.file.filename;

  try {
    // Simpan ke database
    const [result] = await pool.query(
      `INSERT INTO messages (sender_id, room_id, recipient_id, file_url, file_type)
       VALUES (?, ?, ?, ?, ?)`,
      [senderId, roomId, recipientId, fileUrl, "image"]
    );

    const messageId = result.insertId;

    console.log('📤 IMAGE UPLOAD SAVED:', { 
      messageId, senderId, roomId, recipientId, fileUrl 
    });

    // Dapatkan username untuk response
    const [[user]] = await pool.query('SELECT username FROM users WHERE id = ?', [senderId]);
    const username = user.username;

    // 🔥 PERBAIKI: Broadcast yang lebih robust
    const messageData = {
      type: "file_message",
      message: {
        id: messageId,
        sender_id: senderId,
        username: username,
        file_url: fileUrl,
        file_type: "image",
        room_id: roomId,
        recipient_id: recipientId,
        created_at: new Date().toISOString()
      }
    };

    console.log('📨 BROADCASTING FILE MESSAGE:', messageData);

    // Logic broadcast yang lebih baik
    if (roomId) {
      // Room message - broadcast ke semua yang di room
      broadcastAll(messageData);
      console.log(`✅ BROADCASTED to ROOM ${roomId}`);
    } else if (recipientId) {
      // Private message - kirim hanya ke sender dan recipient
      let sentCount = 0;
      for (const [clientWS, clientInfo] of clients) {
        if (clientWS.readyState === clientWS.OPEN) {
          const shouldSend = 
            clientInfo.userId === senderId || 
            clientInfo.userId === Number(recipientId);
          
          if (shouldSend) {
            clientWS.send(JSON.stringify(messageData));
            sentCount++;
            console.log(`✅ SENT to user ${clientInfo.userId} (${clientInfo.username})`);
          }
        }
      }
      console.log(`✅ PRIVATE FILE: Sent to ${sentCount} users`);
    } else {
      // Global message
      broadcastAll(messageData);
      console.log(`✅ BROADCASTED GLOBALLY`);
    }

    return res.json({ fileUrl });
  } catch (err) {
    console.error("Image upload error:", err);
    return res.status(500).json({ error: "DB error" });
  }
});

// UPLOAD VOICE - PERBAIKI Private Message Broadcast
app.post("/api/upload/voice", authMiddleware, uploadVoice.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const senderId = req.user.id;
  const roomId = req.body.roomId || null;
  const recipientId = req.body.recipientId || null;
  const fileUrl = "/uploads/voices/" + req.file.filename;

  try {
    // Simpan ke database
    const [result] = await pool.query(
      `INSERT INTO messages (sender_id, room_id, recipient_id, file_url, file_type)
       VALUES (?, ?, ?, ?, ?)`,
      [senderId, roomId, recipientId, fileUrl, "audio"]
    );

    const messageId = result.insertId;

    console.log('📤 VOICE UPLOAD SAVED:', { 
      messageId, senderId, roomId, recipientId, fileUrl 
    });

    // Dapatkan username untuk response
    const [[user]] = await pool.query('SELECT username FROM users WHERE id = ?', [senderId]);
    const username = user.username;

    // 🔥 PERBAIKI: Broadcast yang lebih robust
    const messageData = {
      type: "file_message",
      message: {
        id: messageId,
        sender_id: senderId,
        username: username,
        file_url: fileUrl,
        file_type: "audio",
        room_id: roomId,
        recipient_id: recipientId,
        created_at: new Date().toISOString()
      }
    };

    console.log('📨 BROADCASTING VOICE MESSAGE:', messageData);

    // Logic broadcast yang lebih baik
    if (roomId) {
      // Room message
      broadcastAll(messageData);
      console.log(`✅ BROADCASTED to ROOM ${roomId}`);
    } else if (recipientId) {
      // Private message - kirim hanya ke sender dan recipient
      let sentCount = 0;
      for (const [clientWS, clientInfo] of clients) {
        if (clientWS.readyState === clientWS.OPEN) {
          const shouldSend = 
            clientInfo.userId === senderId || 
            clientInfo.userId === Number(recipientId);
          
          if (shouldSend) {
            clientWS.send(JSON.stringify(messageData));
            sentCount++;
            console.log(`✅ SENT to user ${clientInfo.userId} (${clientInfo.username})`);
          }
        }
      }
      console.log(`✅ PRIVATE VOICE: Sent to ${sentCount} users`);
    } else {
      // Global message
      broadcastAll(messageData);
      console.log(`✅ BROADCASTED GLOBALLY`);
    }

    return res.json({ fileUrl });
  } catch (err) {
    console.error("Voice upload error:", err);
    return res.status(500).json({ error: "DB error" });
  }
});

// CLEAR PRIVATE CHAT - HAPUS FISIK TAPI ONE-SIDED
// CLEAR PRIVATE CHAT - ONE-SIDED DENGAN TIMESTAMP
app.delete("/api/chat/clear/private/:contactId", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const contactId = req.params.contactId;

  try {
    // SIMPAN TIMESTAMP CLEAR (bukan hapus fisik)
    await pool.query(
      "INSERT INTO user_chat_clears (user_id, room_id, contact_id, cleared_at) VALUES (?, NULL, ?, NOW()) ON DUPLICATE KEY UPDATE cleared_at = NOW()",
      [userId, contactId]
    );

    console.log(`✅ ONE-SIDED CLEAR: User ${userId} cleared chat with contact ${contactId} at ${new Date()}`);

    return res.json({ 
      success: true,
      message: "Chat berhasil dibersihkan (hanya untuk Anda)" 
    });
  } catch (err) {
    console.error('Clear chat error:', err);
    return res.status(500).json({ error: "Database error" });
  }
});

// CLEAR ROOM CHAT - ONE-SIDED DENGAN TIMESTAMP
app.delete("/api/chat/clear/room/:roomId", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const roomId = req.params.roomId;
  
  try {
    await pool.query(
      "INSERT INTO user_chat_clears (user_id, room_id, contact_id, cleared_at) VALUES (?, ?, NULL, NOW()) ON DUPLICATE KEY UPDATE cleared_at = NOW()",
      [userId, roomId]
    );

    console.log(`✅ ONE-SIDED CLEAR ROOM: User ${userId} cleared room ${roomId} at ${new Date()}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// CLEAR GLOBAL CHAT - ONE-SIDED DENGAN TIMESTAMP
app.delete("/api/chat/clear/global", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  
  try {
    await pool.query(
      "INSERT INTO user_chat_clears (user_id, room_id, contact_id, cleared_at) VALUES (?, NULL, NULL, NOW()) ON DUPLICATE KEY UPDATE cleared_at = NOW()",
      [userId]
    );

    console.log(`✅ ONE-SIDED CLEAR GLOBAL: User ${userId} cleared global chat at ${new Date()}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});
// start server
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
