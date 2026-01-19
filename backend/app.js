// app.js - VERSI FIXED
require('dotenv').config();

const express = require('express');
const https = require('https');
const { WebSocketServer } = require('ws');
const net = require('net');
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

// Upload config
function createStorage(subFolder) {
  const folder = path.join(__dirname, `uploads/${subFolder}`);
  fs.mkdirSync(folder, { recursive: true });
  
  return multer.diskStorage({
    destination: function (req, file, cb) {
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

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const activeCalls = new Map();

const options = {
  key: fs.readFileSync('localhost-key.pem'),
  cert: fs.readFileSync('localhost.pem')
};

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

(async () => {
  await pool.query("UPDATE users SET is_online = 0");
  console.log("🔄 Semua user diset offline saat server start");
})();

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
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// -------------------------
// REST API
// -------------------------

// REGISTER
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

// LOGIN
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

    await pool.query('UPDATE users SET is_online = 1 WHERE id = ?', [user.id]);

    return res.json({ token, id: user.id, username: user.username });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==================== INIT ENDPOINT (TAMBAH LOGGING DETAIL) ====================
app.get('/api/init', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const username = req.user.username;
    
    console.log(`📦 INIT untuk user ${userId} (${username})`);
    
    // **PERBAIKAN KRITIS**: Gunakan timestamp yang konsisten
    const [globalCleared] = await pool.query(
      `SELECT cleared_at FROM user_chat_clears 
       WHERE user_id = ? AND room_id IS NULL AND contact_id IS NULL
       LIMIT 1`,
      [userId]
    );
    
    let globalClearedAt = null;
    if (globalCleared.length > 0 && globalCleared[0].cleared_at) {
      // **PERBAIKAN**: Simpan sebagai Date object, bukan string
      globalClearedAt = new Date(globalCleared[0].cleared_at);
      console.log(`✅ User ${userId} CLEARED global chat at: ${globalClearedAt.toISOString()}`);
    } else {
      console.log(`❌ User ${userId} NO global cleared record found`);
      globalClearedAt = new Date('1970-01-01'); // Default sangat lama
    }
    
    // DEBUG: Log query parameter
    console.log(`🔍 Query param cleared_at: ${globalClearedAt.toISOString()}`);
    
    // **PERBAIKAN**: Query yang benar dengan parameter binding
    const [msgs] = await pool.query(
      `SELECT m.*, u.username 
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.room_id IS NULL 
         AND m.recipient_id IS NULL
         AND m.created_at > ?
       ORDER BY m.id ASC
       LIMIT 500`,
      [globalClearedAt] // Pass Date object langsung
    );
    
    console.log(`📊 Found ${msgs.length} global messages for user ${userId}`);
    
    // **DEBUG**: Tampilkan 5 pesan pertama untuk verifikasi
    if (msgs.length > 0) {
      console.log(`📝 Sample messages (first 5):`);
      msgs.slice(0, 5).forEach((msg, i) => {
        console.log(`  ${i+1}. ID:${msg.id} | Time:${msg.created_at} | From:${msg.username}`);
      });
    }
    
    // Get other data
    const [allUsers] = await pool.query(
      'SELECT id, username, is_online, last_seen FROM users ORDER BY username ASC'
    );
    
    const [contacts] = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.is_online,
        u.last_seen
      FROM contacts c
      JOIN users u ON u.id = c.contact_id
      WHERE c.user_id = ? 
      AND c.status = 'accepted'
      ORDER BY u.username ASC
    `, [userId]);
    
    const [rooms] = await pool.query('SELECT id, name FROM rooms ORDER BY id ASC');
    
    const [[pendingCount]] = await pool.query(`
      SELECT COUNT(*) as count FROM contacts 
      WHERE contact_id = ? AND status = 'pending'
    `, [userId]);
    
    return res.json({ 
      users: allUsers,
      contacts: contacts,
      rooms: rooms, 
      messages: msgs,
      pendingCount: parseInt(pendingCount.count),
      debug: {
        clearedAt: globalClearedAt.toISOString(),
        userId: userId
      }
    });
    
  } catch (e) {
    console.error('❌ INIT ERROR:', e);
    console.error('Stack:', e.stack);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ==================== CONTACTS API ====================

// GET all contacts (accepted)
app.get('/api/contacts', authMiddleware, async (req, res) => {
  try {
    console.log(`📋 GET contacts for user ${req.user.id}`);
    
    const [contacts] = await pool.query(`
      SELECT 
        c.*,
        u.id as contact_user_id,
        u.username,
        u.is_online,
        u.last_seen
      FROM contacts c
      JOIN users u ON u.id = c.contact_id
      WHERE c.user_id = ? 
      AND c.status = 'accepted'
      ORDER BY u.username ASC
    `, [req.user.id]);
    
    console.log(`✅ Found ${contacts.length} contacts`);
    res.json({ contacts });
  } catch (error) {
    console.error('Contacts error:', error);
    res.status(500).json({ error: "Database error" });
  }
});

// GET pending contact requests
app.get('/api/contacts/pending', authMiddleware, async (req, res) => {
  try {
    console.log(`📋 GET pending requests for user ${req.user.id}`);
    
    const [pending] = await pool.query(`
      SELECT 
        c.id,
        c.user_id,
        c.contact_id,
        c.status,
        c.created_at,
        c.updated_at,
        u.username,
        u.is_online
      FROM contacts c
      JOIN users u ON u.id = c.user_id
      WHERE c.contact_id = ? 
      AND c.status = 'pending'
      ORDER BY c.created_at DESC
    `, [req.user.id]);
    
    console.log(`✅ Found ${pending.length} pending requests`);
    console.log('Pending data:', JSON.stringify(pending, null, 2));
    
    res.json({ pending });
  } catch (error) {
    console.error('Pending contacts error:', error);
    res.status(500).json({ error: "Database error" });
  }
});

// POST search users
app.post('/api/contacts/search', authMiddleware, async (req, res) => {
  try {
    const { query } = req.body;
    console.log(`🔍 Search for: "${query}" by user ${req.user.id}`);
    
    if (!query || query.length < 2) {
      console.log('⚠️  Query too short');
      return res.json({ users: [] });
    }
    
    // PERBAIKI QUERY INI: cari semua user kecuali diri sendiri
    const [users] = await pool.query(`
      SELECT 
        id,
        username,
        is_online,
        last_seen
      FROM users 
      WHERE username LIKE ? 
      AND id != ?
      ORDER BY username ASC
      LIMIT 20
    `, [`%${query}%`, req.user.id]);
    
    console.log(`✅ Found ${users.length} users for search`);
    res.json({ users });
  } catch (error) {
    console.error('Search contacts error:', error);
    res.status(500).json({ error: "Database error: " + error.message });
  }
});

// POST send contact request
app.post('/api/contacts/request', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    console.log(`📨 Contact request from ${req.user.username} to ${username}`);
    
    if (!username) {
      return res.status(400).json({ error: "Username required" });
    }
    
    // Cari user yang ingin ditambahkan
    const [[user]] = await pool.query(
      'SELECT id, username FROM users WHERE username = ?',
      [username]
    );
    
    if (!user) {
      console.log(`❌ User ${username} not found`);
      return res.status(404).json({ error: "User not found" });
    }
    
    const contactId = user.id;
    
    if (contactId === req.user.id) {
      return res.status(400).json({ 
        error: "Cannot add yourself as contact"
      });
    }
    
    // Cek apakah sudah ada kontak
    const [[existing]] = await pool.query(`
      SELECT * FROM contacts 
      WHERE user_id = ? AND contact_id = ?
    `, [req.user.id, contactId]);
    
    if (existing) {
      console.log(`⚠️  Contact already exists, status: ${existing.status}`);
      return res.status(400).json({ 
        error: "Contact already exists",
        status: existing.status
      });
    }
    
    // Buat request
    await pool.query(`
      INSERT INTO contacts (user_id, contact_id, status)
      VALUES (?, ?, 'pending')
    `, [req.user.id, contactId]);
    
    console.log(`✅ Contact request sent from ${req.user.id} to ${contactId}`);
    
    // Kirim notifikasi via WebSocket (dihandle nanti)
    // Flag untuk WebSocket
    req.contactRequestSent = {
      fromUserId: req.user.id,
      fromUsername: req.user.username,
      toUserId: contactId
    };
    
    res.json({ 
      success: true, 
      message: "Contact request sent",
      contactId: contactId
    });
  } catch (error) {
    console.error('Send contact request error:', error);
    res.status(500).json({ error: "Database error: " + error.message });
  }
});

// POST accept contact request
app.post('/api/contacts/accept/:requestId', authMiddleware, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    console.log(`✅ Accept contact request ${requestId} by user ${req.user.id}`);
    
    const [result] = await pool.query(`
      UPDATE contacts 
      SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND contact_id = ? AND status = 'pending'
    `, [requestId, req.user.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Request not found" });
    }
    
    // Dapatkan info requester
    const [[request]] = await pool.query(`
      SELECT user_id FROM contacts WHERE id = ?
    `, [requestId]);
    
    const requesterId = request.user_id;
    
    // Buat hubungan timbal balik
    const [[existingReverse]] = await pool.query(`
      SELECT * FROM contacts 
      WHERE user_id = ? AND contact_id = ?
    `, [req.user.id, requesterId]);
    
    if (!existingReverse) {
      await pool.query(`
        INSERT INTO contacts (user_id, contact_id, status)
        VALUES (?, ?, 'accepted')
      `, [req.user.id, requesterId]);
    }
    
    // Flag untuk WebSocket notification
    req.contactAccepted = {
      byUserId: req.user.id,
      byUsername: req.user.username,
      toUserId: requesterId
    };
    
    res.json({ 
      success: true, 
      message: "Contact request accepted"
    });
  } catch (error) {
    console.error('Accept contact error:', error);
    res.status(500).json({ error: "Database error" });
  }
});

// POST reject contact request
app.post('/api/contacts/reject/:requestId', authMiddleware, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    
    await pool.query(`
      DELETE FROM contacts 
      WHERE id = ? AND contact_id = ? AND status = 'pending'
    `, [requestId, req.user.id]);
    
    res.json({ 
      success: true, 
      message: "Contact request rejected"
    });
  } catch (error) {
    console.error('Reject contact error:', error);
    res.status(500).json({ error: "Database error" });
  }
});

// DELETE remove contact
app.delete('/api/contacts/:contactId', authMiddleware, async (req, res) => {
  try {
    const contactId = req.params.contactId;
    
    await pool.query(`
      DELETE FROM contacts 
      WHERE (user_id = ? AND contact_id = ?)
      OR (user_id = ? AND contact_id = ?)
    `, [req.user.id, contactId, contactId, req.user.id]);
    
    res.json({ 
      success: true, 
      message: "Contact removed"
    });
  } catch (error) {
    console.error('Remove contact error:', error);
    res.status(500).json({ error: "Database error" });
  }
});

// ==================== ROOMS API ====================

app.get('/api/rooms', authMiddleware, async (req, res) => {
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

    // Broadcast via WebSocket
    req.roomCreated = room;

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

    const [clearCheck] = await pool.query(
      'SELECT cleared_at FROM user_chat_clears WHERE user_id = ? AND room_id = ? AND contact_id IS NULL',
      [req.user.id, roomId]
    );

    let clearedAt = '1970-01-01';
    if (clearCheck.length > 0) {
      clearedAt = clearCheck[0].cleared_at;
    }

    const [rows] = await pool.query(
      `SELECT m.id, m.sender_id, m.file_url, m.file_type, m.content,
              m.created_at, u.username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.room_id = ? AND m.created_at > ?
       ORDER BY m.id ASC`,
      [roomId, clearedAt]
    );

    const [countRes] = await pool.query('SELECT COUNT(*) AS total FROM messages WHERE room_id = ?', [roomId]);
    const total = countRes[0]?.total || 0;

    return res.json({ roomId, messages: rows, total });
  } catch (e) {
    console.error('room messages error', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ==================== PRIVATE MESSAGES ====================

app.get('/api/private/:me/:target', authMiddleware, async (req, res) => {
  try {
    const me = req.params.me;
    const target = req.params.target;
    const currentUserId = req.user.id;

    // resolve ids
    const [[u1]] = await pool.query('SELECT id FROM users WHERE username = ?', [me]);
    const [[u2]] = await pool.query('SELECT id FROM users WHERE username = ?', [target]);

    if (!u1 || !u2) return res.status(404).json({ error: 'User not found' });

    // CEK KONTAK - HANYA WARNING, BUKAN ERROR
    const [[contactCheck]] = await pool.query(`
      SELECT * FROM contacts 
      WHERE ((user_id = ? AND contact_id = ?) OR (user_id = ? AND contact_id = ?))
      AND status = 'accepted'
      LIMIT 1
    `, [currentUserId, u2.id, u2.id, currentUserId]);

    if (!contactCheck) {
      console.log(`⚠️  User ${currentUserId} trying to chat with non-contact ${u2.id}`);
      // Kembalikan pesan kosong saja, jangan error
    }

    // Cek cleared_at - PERBAIKAN: Pastikan format date benar
    const [[clearCheck]] = await pool.query(
      'SELECT cleared_at FROM user_chat_clears WHERE user_id = ? AND contact_id = ?',
      [currentUserId, u2.id]
    );

    let clearedAt = '1970-01-01';
    if (clearCheck && clearCheck.cleared_at) {
      clearedAt = new Date(clearCheck.cleared_at).toISOString();
    }

    console.log(`🔍 Loading private chat ${u1.id} <-> ${u2.id}, cleared at: ${clearedAt}`);

    // Query messages setelah cleared_at
    const [rows] = await pool.query(
      `SELECT m.id, m.sender_id, m.recipient_id, m.room_id,
              m.content, m.file_url, m.file_type,
              m.created_at, u.username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE ((m.sender_id = ? AND m.recipient_id = ?)
           OR (m.sender_id = ? AND m.recipient_id = ?))
         AND m.created_at > ?
       ORDER BY m.id ASC
       LIMIT 1000`,
      [u1.id, u2.id, u2.id, u1.id, clearedAt]
    );

    console.log(`✅ Found ${rows.length} messages after clear`);

    return res.json({ messages: rows });
  } catch (e) {
    console.error('Private messages error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==================== UPLOAD ====================

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.post("/api/upload/image", authMiddleware, uploadImage.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const senderId = req.user.id;
  const roomId = req.body.roomId || null;
  const recipientId = req.body.recipientId || null;
  const fileUrl = "/uploads/images/" + req.file.filename;

  try {
    const [result] = await pool.query(
      `INSERT INTO messages (sender_id, room_id, recipient_id, file_url, file_type)
       VALUES (?, ?, ?, ?, ?)`,
      [senderId, roomId, recipientId, fileUrl, "image"]
    );

    const messageId = result.insertId;
    const [[user]] = await pool.query('SELECT username FROM users WHERE id = ?', [senderId]);
    const username = user.username;

    req.fileUploaded = {
      type: "image",
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

    return res.json({ fileUrl });
  } catch (err) {
    console.error("Image upload error:", err);
    return res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/upload/voice", authMiddleware, uploadVoice.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const senderId = req.user.id;
  const roomId = req.body.roomId || null;
  const recipientId = req.body.recipientId || null;
  const fileUrl = "/uploads/voices/" + req.file.filename;

  try {
    const [result] = await pool.query(
      `INSERT INTO messages (sender_id, room_id, recipient_id, file_url, file_type)
       VALUES (?, ?, ?, ?, ?)`,
      [senderId, roomId, recipientId, fileUrl, "audio"]
    );

    const messageId = result.insertId;
    const [[user]] = await pool.query('SELECT username FROM users WHERE id = ?', [senderId]);
    const username = user.username;

    req.fileUploaded = {
      type: "audio",
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

    return res.json({ fileUrl });
  } catch (err) {
    console.error("Voice upload error:", err);
    return res.status(500).json({ error: "DB error" });
  }
});

// ==================== CLEAR CHAT ====================
app.delete("/api/chat/clear/private/:contactId", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const contactId = req.params.contactId;

  try {
    console.log(`🧹 User ${userId} clearing PRIVATE chat dengan ${contactId}...`);
    
    await pool.query(
      `INSERT INTO user_chat_clears (user_id, room_id, contact_id, cleared_at) 
       VALUES (?, NULL, ?, NOW()) 
       ON DUPLICATE KEY UPDATE cleared_at = NOW()`,
      [userId, contactId]
    );

    console.log(`✅ Private chat with ${contactId} cleared for user ${userId}`);
    
    return res.json({ 
      success: true,
      message: "Chat berhasil dibersihkan (hanya untuk Anda)" 
    });
  } catch (err) {
    console.error('Clear private chat error:', err);
    return res.status(500).json({ error: "Database error: " + err.message });
  }
});

app.delete("/api/chat/clear/room/:roomId", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const roomId = req.params.roomId;
  
  try {
    console.log(`🧹 User ${userId} clearing ROOM chat ${roomId}...`);
    
    await pool.query(
      `INSERT INTO user_chat_clears (user_id, room_id, contact_id, cleared_at) 
       VALUES (?, ?, NULL, NOW()) 
       ON DUPLICATE KEY UPDATE cleared_at = NOW()`,
      [userId, roomId]
    );

    console.log(`✅ Room chat ${roomId} cleared for user ${userId}`);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Clear room chat error:', err);
    res.status(500).json({ error: "Database error: " + err.message });
  }
});

// ==================== CLEAR GLOBAL CHAT (FIXED VERSION) ====================
app.delete("/api/chat/clear/global", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const username = req.user.username;
  
  try {
    console.log(`🧹 User ${userId} (${username}) clearing GLOBAL chat...`);
    
    // **PERBAIKAN**: Gunakan CURRENT_TIMESTAMP() bukan NOW() untuk konsistensi
    const [result] = await pool.query(
      `INSERT INTO user_chat_clears (user_id, room_id, contact_id, cleared_at) 
       VALUES (?, NULL, NULL, CURRENT_TIMESTAMP()) 
       ON DUPLICATE KEY UPDATE cleared_at = CURRENT_TIMESTAMP()`,
      [userId]
    );
    
    // **VERIFIKASI**: Ambil data yang baru saja diinsert
    const [verify] = await pool.query(
      `SELECT 
        id,
        cleared_at,
        DATE_FORMAT(cleared_at, '%Y-%m-%d %H:%i:%s') as cleared_at_formatted
       FROM user_chat_clears 
       WHERE user_id = ? 
         AND room_id IS NULL 
         AND contact_id IS NULL
       LIMIT 1`,
      [userId]
    );
    
    if (verify.length > 0) {
      console.log(`✅ Global chat CLEARED for user ${userId}`);
      console.log(`📅 Clear timestamp: ${verify[0].cleared_at} (${verify[0].cleared_at_formatted})`);
      console.log(`📊 Affected rows: ${result.affectedRows}`);
      
      // **TEST**: Hitung berapa messages yang akan ditampilkan setelah clear
      const clearedAt = verify[0].cleared_at;
      const [[countAfterClear]] = await pool.query(
        `SELECT COUNT(*) as count 
         FROM messages 
         WHERE room_id IS NULL 
           AND recipient_id IS NULL
           AND created_at > ?`,
        [clearedAt]
      );
      
      console.log(`🔍 Messages akan ditampilkan setelah clear: ${countAfterClear.count}`);
    } else {
      console.log(`❌ ERROR: Tidak bisa verifikasi clear untuk user ${userId}`);
    }
    
    res.json({ 
      success: true,
      message: "Global chat berhasil dibersihkan",
      timestamp: new Date().toISOString(),
      debug: {
        affectedRows: result.affectedRows,
        verified: verify.length > 0 ? verify[0] : null
      }
    });
    
  } catch (err) {
    console.error('❌ Clear global chat ERROR:', err);
    console.error('Stack:', err.stack);
    return res.status(500).json({ 
      error: "Database error: " + err.message,
      code: err.code 
    });
  }
});

// ==================== GLOBAL MESSAGES ENDPOINT ====================
app.get('/api/messages/global', authMiddleware, async (req, res) => {
  try {
    console.log(`🌍 Loading global messages for user ${req.user.id} (${req.user.username})`);
    
    // Cek cleared_at untuk user ini
    const [globalCleared] = await pool.query(
      `SELECT cleared_at FROM user_chat_clears 
       WHERE user_id = ? AND room_id IS NULL AND contact_id IS NULL
       LIMIT 1`,
      [req.user.id]
    );
    
    let globalClearedAt = '1970-01-01';
    if (globalCleared.length > 0 && globalCleared[0].cleared_at) {
      globalClearedAt = new Date(globalCleared[0].cleared_at).toISOString();
      console.log(`📅 User ${req.user.id} cleared global chat at: ${globalClearedAt}`);
    }
    
    const [messages] = await pool.query(
      `SELECT m.*, u.username 
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.room_id IS NULL AND m.recipient_id IS NULL
         AND m.created_at > ?
       ORDER BY m.id ASC
       LIMIT 500`,
      [globalClearedAt]
    );
    
    console.log(`🌍 Found ${messages.length} global messages for user ${req.user.id}`);
    
    return res.json({ 
      messages: messages,
      clearedAt: globalClearedAt
    });
  } catch (e) {
    console.error('Global messages error:', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ==================== GLOBAL MESSAGES COUNT ====================
app.get('/api/messages/global/count', authMiddleware, async (req, res) => {
  try {
    const [globalCleared] = await pool.query(
      `SELECT cleared_at FROM user_chat_clears 
       WHERE user_id = ? AND room_id IS NULL AND contact_id IS NULL
       LIMIT 1`,
      [req.user.id]
    );
    
    let globalClearedAt = '1970-01-01';
    if (globalCleared.length > 0 && globalCleared[0].cleared_at) {
      globalClearedAt = new Date(globalCleared[0].cleared_at).toISOString();
    }
    
    const [[countResult]] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM messages 
       WHERE room_id IS NULL AND recipient_id IS NULL
         AND created_at > ?`,
      [globalClearedAt]
    );
    
    return res.json({ 
      count: parseInt(countResult.count),
      clearedAt: globalClearedAt
    });
  } catch (e) {
    console.error('Global count error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==================== PRIVATE MESSAGES COUNT ====================
app.get('/api/private/:me/:target/count', authMiddleware, async (req, res) => {
  try {
    const me = req.params.me;
    const target = req.params.target;
    const currentUserId = req.user.id;

    // resolve ids
    const [[u1]] = await pool.query('SELECT id FROM users WHERE username = ?', [me]);
    const [[u2]] = await pool.query('SELECT id FROM users WHERE username = ?', [target]);

    if (!u1 || !u2) return res.status(404).json({ error: 'User not found' });

    // Cek cleared_at
    const [[clearCheck]] = await pool.query(
      'SELECT cleared_at FROM user_chat_clears WHERE user_id = ? AND contact_id = ?',
      [currentUserId, u2.id]
    );

    let clearedAt = '1970-01-01';
    if (clearCheck && clearCheck.cleared_at) {
      clearedAt = new Date(clearCheck.cleared_at).toISOString();
    }

    const [[countResult]] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM messages 
       WHERE ((sender_id = ? AND recipient_id = ?)
           OR (sender_id = ? AND recipient_id = ?))
         AND created_at > ?`,
      [u1.id, u2.id, u2.id, u1.id, clearedAt]
    );

    return res.json({ 
      count: parseInt(countResult.count),
      clearedAt: clearedAt
    });
  } catch (e) {
    console.error('Private count error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// API endpoints untuk server (Node.js/Express contoh)
app.get('/api/rooms/:roomId/messages/count', async (req, res) => {
  try {
    const { roomId } = req.params;
    // Query database untuk jumlah pesan di room
    const count = await db.message.count({ where: { room_id: roomId } });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/private/:user1/:user2/count', async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    // Query database untuk jumlah pesan private antara dua user
    const count = await db.message.count({
      where: {
        OR: [
          { sender_id: user1, recipient_id: user2 },
          { sender_id: user2, recipient_id: user1 }
        ]
      }
    });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    // Query database untuk status user
    const user = await db.user.findUnique({
      where: { id: parseInt(userId) },
      select: { is_online: true, last_seen: true }
    });
    res.json(user || { is_online: false, last_seen: null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== DEBUG CLEAR STATUS ====================
app.get('/api/debug/clear-status/:userId?', authMiddleware, async (req, res) => {
  try {
    const debugUserId = req.params.userId || req.user.id;
    
    console.log(`🔍 Debug clear status untuk user ${debugUserId}`);
    
    // Ambil semua cleared chats user ini
    const [clearedChats] = await pool.query(
      'SELECT * FROM user_chat_clears WHERE user_id = ? ORDER BY cleared_at DESC',
      [debugUserId]
    );
    
    // Cek global messages tanpa filter
    const [allGlobalMsgs] = await pool.query(
      `SELECT COUNT(*) as total FROM messages 
       WHERE room_id IS NULL AND recipient_id IS NULL`
    );
    
    // Cek global messages dengan filter untuk user ini
    const globalCleared = clearedChats.find(c => c.room_id === null && c.contact_id === null);
    let globalClearedAt = '1970-01-01';
    if (globalCleared) {
      globalClearedAt = new Date(globalCleared.cleared_at).toISOString();
    }
    
    const [filteredGlobalMsgs] = await pool.query(
      `SELECT COUNT(*) as filtered FROM messages 
       WHERE room_id IS NULL AND recipient_id IS NULL
         AND created_at > ?`,
      [globalClearedAt]
    );
    
    return res.json({ 
      userId: debugUserId,
      clearedChats: clearedChats,
      globalMessages: {
        total: allGlobalMsgs[0].total,
        filtered: filteredGlobalMsgs[0].filtered,
        clearedAt: globalClearedAt,
        willShow: parseInt(filteredGlobalMsgs[0].filtered) > 0 ? 'YES' : 'NO'
      }
    });
  } catch (e) {
    console.error('Debug error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/ping', async (req, res) => {
  await new Promise(r => setTimeout(r, 300));
  res.sendStatus(204);
});



// ==================== SIMPLE TEST ENDPOINT ====================
// ==================== TEST CLEAR CHECK ENDPOINT ====================
app.get('/api/test/clear-check', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`🧪 Test clear check for user ${userId}`);
    
    // 1. Cek apakah ada record clear untuk user ini
    const [clears] = await pool.query(
      'SELECT * FROM user_chat_clears WHERE user_id = ? ORDER BY cleared_at DESC',
      [userId]
    );
    
    // 2. Hitung total global messages
    const [[allCount]] = await pool.query(
      'SELECT COUNT(*) as count FROM messages WHERE room_id IS NULL AND recipient_id IS NULL'
    );
    
    // 3. Hitung messages setelah clear
    let filteredCount = allCount.count;
    let clearedAt = '1970-01-01';
    
    if (clears.length > 0) {
      // Cari global clear (room_id IS NULL AND contact_id IS NULL)
      const globalClear = clears.find(c => c.room_id === null && c.contact_id === null);
      
      if (globalClear && globalClear.cleared_at) {
        clearedAt = new Date(globalClear.cleared_at).toISOString();
        
        const [[count]] = await pool.query(
          'SELECT COUNT(*) as count FROM messages WHERE room_id IS NULL AND recipient_id IS NULL AND created_at > ?',
          [clearedAt]
        );
        filteredCount = count.count;
      }
    }
    
    const result = {
      userId: userId,
      hasClearRecords: clears.length > 0,
      clearRecords: clears.map(c => ({
        ...c,
        cleared_at: c.cleared_at ? new Date(c.cleared_at).toISOString() : null
      })),
      totalGlobalMessages: parseInt(allCount.count),
      filteredGlobalMessages: parseInt(filteredCount),
      clearedAt: clearedAt,
      status: parseInt(filteredCount) === 0 ? 'CLEARED' : 'NOT_CLEARED',
      message: parseInt(filteredCount) === 0 ? 
        '✅ Clear bekerja! Tidak ada messages yang ditampilkan.' : 
        `❌ Masih ada ${filteredCount} messages! Clear mungkin tidak bekerja.`
    };
    
    console.log(`📊 Test result:`, {
      total: result.totalGlobalMessages,
      filtered: result.filteredGlobalMessages,
      status: result.status
    });
    
    return res.json(result);
    
  } catch (e) {
    console.error('❌ Test error:', e);
    return res.status(500).json({ 
      error: 'Test failed: ' + e.message,
      stack: e.stack 
    });
  }
});

// ==================== SIMPLE DEBUG ENDPOINT ====================
app.get('/api/debug/clear-status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`🔍 Debug clear status for user ${userId}`);
    
    // 1. Cek clears
    const [clears] = await pool.query(
      'SELECT * FROM user_chat_clears WHERE user_id = ?',
      [userId]
    );
    
    // 2. Query langsung untuk lihat apa yang terjadi
    let queryResult = [];
    
    if (clears.length > 0) {
      const globalClear = clears.find(c => c.room_id === null && c.contact_id === null);
      
      if (globalClear && globalClear.cleared_at) {
        const clearedAt = new Date(globalClear.cleared_at);
        
        // Debug query: tampilkan beberapa messages untuk lihat comparison
        [queryResult] = await pool.query(
          `SELECT 
            m.id,
            m.created_at as message_time,
            ? as cleared_time,
            m.created_at > ? as should_show
           FROM messages m
           WHERE m.room_id IS NULL 
             AND m.recipient_id IS NULL
           ORDER BY m.id DESC
           LIMIT 5`,
          [clearedAt, clearedAt]
        );
      }
    }
    
    return res.json({
      userId: userId,
      clears: clears,
      debugQuery: queryResult,
      totalClears: clears.length
    });
    
  } catch (e) {
    console.error('Debug error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// ==================== DEBUG COMPARISON ENDPOINT ====================
app.get('/api/debug/compare-clears', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`🔍 Debug comparison for user ${userId}`);
    
    // 1. Ambil cleared_at dari database
    const [clears] = await pool.query(
      'SELECT * FROM user_chat_clears WHERE user_id = ? AND room_id IS NULL AND contact_id IS NULL',
      [userId]
    );
    
    let clearedAt = '1970-01-01';
    if (clears.length > 0 && clears[0].cleared_at) {
      clearedAt = new Date(clears[0].cleared_at).toISOString();
    }
    
    console.log(`📅 User ${userId} cleared_at: ${clearedAt}`);
    
    // 2. QUERY PERTAMA (yang digunakan /api/test/clear-check)
    const [[count1]] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM messages 
       WHERE room_id IS NULL 
         AND recipient_id IS NULL
         AND created_at > ?`,
      [clearedAt]
    );
    
    // 3. QUERY KEDUA (yang digunakan /api/init - PERHATIKAN PERBEDAAN!)
    const [[count2]] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM messages m
       WHERE m.room_id IS NULL 
         AND m.recipient_id IS NULL
         AND m.created_at > ?`,
      [clearedAt]
    );
    
    // 4. Tampilkan beberapa sample messages untuk debug
    const [sampleMessages] = await pool.query(
      `SELECT 
         m.id,
         m.created_at,
         DATE_FORMAT(m.created_at, '%Y-%m-%d %H:%i:%s.%f') as created_at_full,
         ? as cleared_at_param,
         m.created_at > ? as is_after_clear
       FROM messages m
       WHERE m.room_id IS NULL 
         AND m.recipient_id IS NULL
       ORDER BY m.created_at DESC
       LIMIT 10`,
      [clearedAt, clearedAt]
    );
    
    // 5. Cek messages yang MASUK dan TIDAK MASUK
    const [messagesAfterClear] = await pool.query(
      `SELECT m.id, m.created_at 
       FROM messages m
       WHERE m.room_id IS NULL 
         AND m.recipient_id IS NULL
         AND m.created_at > ?
       ORDER BY m.created_at ASC
       LIMIT 5`,
      [clearedAt]
    );
    
    const [messagesBeforeClear] = await pool.query(
      `SELECT m.id, m.created_at 
       FROM messages m
       WHERE m.room_id IS NULL 
         AND m.recipient_id IS NULL
         AND m.created_at <= ?
       ORDER BY m.created_at DESC
       LIMIT 5`,
      [clearedAt]
    );
    
    const result = {
      userId: userId,
      clearedAt: clearedAt,
      query1Count: parseInt(count1.count),
      query2Count: parseInt(count2.count),
      sampleMessages: sampleMessages.map(m => ({
        id: m.id,
        created_at: m.created_at,
        created_at_full: m.created_at_full,
        cleared_at_param: m.cleared_at_param,
        is_after_clear: Boolean(m.is_after_clear),
        comparison: m.created_at > new Date(m.cleared_at_param) ? 'AFTER' : 'BEFORE'
      })),
      messagesAfterClear: messagesAfterClear,
      messagesBeforeClear: messagesBeforeClear,
      totalMessages: parseInt(count1.count) + messagesBeforeClear.length
    };
    
    console.log(`📊 Comparison results:`);
    console.log(`- Query1 count: ${result.query1Count}`);
    console.log(`- Query2 count: ${result.query2Count}`);
    console.log(`- Sample messages comparison:`, result.sampleMessages);
    
    return res.json(result);
    
  } catch (e) {
    console.error('❌ Comparison error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// ==================== MANUAL FIX CLEAR ====================
app.post('/api/debug/fix-clear', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { action } = req.body; // 'reset' atau 'force-clear'
    
    console.log(`🔧 Manual fix for user ${userId}, action: ${action}`);
    
    if (action === 'reset') {
      // Hapus semua clear records untuk user ini
      await pool.query('DELETE FROM user_chat_clears WHERE user_id = ?', [userId]);
      
      console.log(`✅ Reset all clears for user ${userId}`);
      
      return res.json({
        success: true,
        message: 'All clear records deleted. You will see ALL messages again.'
      });
      
    } else if (action === 'force-clear') {
      // Force clear dengan timestamp SANGAT BARU
      const forceTimestamp = new Date().toISOString();
      
      await pool.query(
        `INSERT INTO user_chat_clears (user_id, room_id, contact_id, cleared_at) 
         VALUES (?, NULL, NULL, ?) 
         ON DUPLICATE KEY UPDATE cleared_at = ?`,
        [userId, forceTimestamp, forceTimestamp]
      );
      
      console.log(`✅ Force cleared for user ${userId} at ${forceTimestamp}`);
      
      // Verifikasi
      const [[count]] = await pool.query(
        `SELECT COUNT(*) as count 
         FROM messages 
         WHERE room_id IS NULL 
           AND recipient_id IS NULL
           AND created_at > ?`,
        [forceTimestamp]
      );
      
      return res.json({
        success: true,
        message: `Force clear completed. ${count.count} messages will show.`,
        clearedAt: forceTimestamp,
        messagesAfterClear: parseInt(count.count)
      });
      
    } else if (action === 'show-all') {
      // Set cleared_at ke waktu SANGAT LAMA
      const ancientTime = '1970-01-01 00:00:00';
      
      await pool.query(
        `INSERT INTO user_chat_clears (user_id, room_id, contact_id, cleared_at) 
         VALUES (?, NULL, NULL, ?) 
         ON DUPLICATE KEY UPDATE cleared_at = ?`,
        [userId, ancientTime, ancientTime]
      );
      
      console.log(`✅ Set cleared_at to ancient time for user ${userId}`);
      
      return res.json({
        success: true,
        message: 'All messages will now show (cleared_at set to 1970).'
      });
    }
    
    return res.status(400).json({ error: 'Invalid action' });
    
  } catch (e) {
    console.error('Fix error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// ==================== WEBSOCKET SERVER ====================

const server = https.createServer(options, app);
const wss = new WebSocketServer({ 
  server,
  path: "/ws"
});

const clients = new Map();

function broadcastAll(obj) {
  const msg = JSON.stringify(obj);
  let sent = 0;
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(msg);
      sent++;
    }
  });
  console.log(`📢 Broadcast ${obj.type} to ${sent} clients`);
}

function sendToUser(userId, data) {
  let sent = false;
  wss.clients.forEach(client => {
    if (client.userId === userId && client.readyState === 1) {
      client.send(JSON.stringify(data));
      sent = true;
    }
  });
  return sent;
}

// Middleware untuk broadcast setelah response
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    // Broadcast setelah response dikirim
    setTimeout(() => {
      // Room created
      if (req.roomCreated) {
        broadcastAll({ type: 'room_created', room: req.roomCreated });
      }
      
      // Contact request
      if (req.contactRequestSent) {
        const { fromUserId, fromUsername, toUserId } = req.contactRequestSent;
        sendToUser(toUserId, {
          type: "contact_request",
          fromUserId,
          fromUsername,
          timestamp: new Date().toISOString()
        });
      }
      
      // Contact accepted
      if (req.contactAccepted) {
        const { byUserId, byUsername, toUserId } = req.contactAccepted;
        sendToUser(toUserId, {
          type: "contact_accepted",
          byUserId,
          byUsername,
          timestamp: new Date().toISOString()
        });
      }
      
      // File uploaded
      if (req.fileUploaded) {
        const messageData = {
          type: "file_message",
          message: req.fileUploaded.message
        };
        
        if (req.fileUploaded.message.room_id) {
          broadcastAll(messageData);
        } else if (req.fileUploaded.message.recipient_id) {
          // Private file - send to both users
          wss.clients.forEach(client => {
            if (client.readyState === 1) {
              if (client.userId === req.fileUploaded.message.sender_id || 
                  client.userId === Number(req.fileUploaded.message.recipient_id)) {
                client.send(JSON.stringify(messageData));
              }
            }
          });
        } else {
          broadcastAll(messageData);
        }
      }
    }, 100);
    
    return originalSend.apply(res, arguments);
  };
  next();
});

wss.on('connection', async (ws, req) => {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
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

    // Store client
    ws.userId = user.id;
    ws.username = user.username;
    clients.set(ws, { userId: user.id, username: user.username, isOnline: true });

    // Mark online
    await pool.query('UPDATE users SET is_online = 1 WHERE id = ?', [user.id]);

    // Notify others this user is online
    broadcastAll({
      type: "user_online",
      userId: user.id,
      username: user.username
    });

    // Send init data
    const [rooms] = await pool.query('SELECT id, name FROM rooms ORDER BY id ASC');
    const [allUsers] = await pool.query('SELECT id, username, is_online FROM users ORDER BY username ASC');
    
    ws.send(JSON.stringify({ 
      type: 'init', 
      rooms, 
      users: allUsers // Kirim semua user untuk compatibility
    }));

    // Send status of other users
    for (const [client, clientInfo] of clients) {
      if (clientInfo.userId !== user.id && client.readyState === 1) {
        ws.send(JSON.stringify({
          type: "user_online",
          userId: clientInfo.userId,
          username: clientInfo.username
        }));
      }
    }

    // Handle messages
    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw);

        if (data.type === 'ping') {
          // Kirim pong response dengan timestamp yang sama
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: data.timestamp,
            serverTime: new Date().toISOString()
          }));
          console.log(`📡 Sent pong for ping ${data.timestamp}`);
        }
        
        // Global message
        if (data.type === "global_message") {
          const content = data.content || "";
          if (!content) return;

          const sentAt = Date.now(); 

          await pool.query('INSERT INTO messages (sender_id, room_id, content) VALUES (?, NULL, ?)', [ws.userId, content]);

          const broadcastMessage = {
            type: "global_message",
            message: {
              sender_id: ws.userId,
              content,
              username: ws.username,
              sent_at: sentAt, // TAMBAHKAN TIMESTAMP
              room_id: null,
              recipient_id: null,
              created_at: new Date().toISOString()
            }
          };

          broadcastAll(broadcastMessage);

          tcpClients.forEach((client, sock) => {
            sock.write(JSON.stringify(broadcastMessage) + '\n');
          });
          return;
        }

        // Room message
        if (data.type === "room_message") {
          const roomId = data.roomId;
          const content = data.content || "";
          if (!roomId || !content) return;

          await pool.query('INSERT INTO messages (sender_id, room_id, content) VALUES (?, ?, ?)', [ws.userId, roomId, content]);

          broadcastAll({
            type: "room_message",
            message: {
              sender_id: ws.userId,
              content,
              username: ws.username,
              room_id: roomId,
              created_at: new Date().toISOString()
            }
          });
          return;
        }

        if (data.type === "private_message") {
          const recipientId = data.recipientId;
          const content = data.content || "";
          if (!recipientId || !content) return;

          const [result] = await pool.query(
            'INSERT INTO messages (sender_id, recipient_id, content) VALUES (?, ?, ?)',
            [ws.userId, recipientId, content]
          );

          const messageId = result.insertId;
          
          // Ambil username untuk response
          const [[user]] = await pool.query('SELECT username FROM users WHERE id = ?', [ws.userId]);
          const username = user.username;

          // Broadcast ke sender dan recipient
          wss.clients.forEach(client => {
            if (client.readyState === 1) {
              if (client.userId === ws.userId || client.userId === Number(recipientId)) {
                client.send(JSON.stringify({
                  type: "private_message",
                  message: {
                    id: messageId,
                    sender_id: ws.userId,
                    recipient_id: recipientId,
                    content,
                    username: username,
                    created_at: new Date().toISOString()
                  }
                }));
              }
            }
          });
          return;
        }

        // **PERBAIKAN KRITIS**: Handler untuk file upload notifications
        if (data.type === "file_uploaded") {
          console.log(`📤 File uploaded notification from ${ws.userId}:`, data);
          
          // Ambil message dari database berdasarkan fileUrl
          const [messages] = await pool.query(
            'SELECT m.*, u.username FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.file_url = ? ORDER BY m.id DESC LIMIT 1',
            [data.fileUrl]
          );
          
          if (messages.length > 0) {
            const message = messages[0];
            
            // Broadcast berdasarkan tipe chat
            wss.clients.forEach(client => {
              if (client.readyState === 1) {
                // Private chat
                if (message.recipient_id) {
                  if (client.userId === message.sender_id || client.userId === message.recipient_id) {
                    client.send(JSON.stringify({
                      type: "file_message",
                      message: message
                    }));
                  }
                }
                // Room chat
                else if (message.room_id) {
                  // Kirim ke semua di room tersebut
                  client.send(JSON.stringify({
                    type: "file_message",
                    message: message
                  }));
                }
                // Global chat
                else {
                  client.send(JSON.stringify({
                    type: "file_message",
                    message: message
                  }));
                }
              }
            });
            
            console.log(`✅ Broadcasted file message ${message.id} to relevant clients`);
          }
          return;
        }

        // WebSocket contact request (optional)
        if (data.type === "contact_request_ws") {
          const targetUserId = data.targetUserId;
          sendToUser(targetUserId, {
            type: "contact_request",
            fromUserId: ws.userId,
            fromUsername: ws.username,
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Call related (keep existing)
        if (data.type === "call_offer") {
          const { targetUserId, offer, callId } = data;
          activeCalls.set(callId, {
            callerId: ws.userId,
            callerName: ws.username,
            targetId: targetUserId,
            offer: offer
          });

          const sent = sendToUser(targetUserId, {
            type: "call_offer",
            callerId: ws.userId,
            callerName: ws.username,
            offer: offer,
            callId: callId
          });

          if (!sent) {
            ws.send(JSON.stringify({
              type: "call_failed",
              reason: "User tidak online"
            }));
            activeCalls.delete(callId);
          }
          return;
        }

        if (data.type === "file_upload_complete") {
        // Kirim ke semua client yang relevan
        wss.clients.forEach(client => {
          if (client.readyState === 1) {
            // Kirim ke penerima private chat
            if (data.context.type === "private") {
              if (client.userId === Number(data.context.userId) || 
                  client.userId === Number(data.senderId)) {
                client.send(JSON.stringify({
                  type: "file_upload_complete",
                  fileUrl: data.fileUrl,
                  fileType: data.fileType,
                  context: data.context,
                  senderId: data.senderId,
                  senderUsername: data.senderUsername,
                  timestamp: data.timestamp
                }));
              }
            }
            // Kirim ke semua di room
            else if (data.context.type === "room") {
              if (state.currentContext && state.currentContext.type === "room" && 
                  Number(state.currentContext.roomId) === Number(data.context.roomId)) {
                client.send(JSON.stringify(data));
              }
            }
            // Kirim ke semua untuk global
            else if (data.context.type === "global") {
              client.send(JSON.stringify(data));
            }
          }
        });
        return;
      }

      // **PERBAIKAN**: Handler untuk subscribe all
      if (data.type === "subscribe_all") {
        console.log(`👤 User ${ws.userId} subscribed to all notifications`);
        // Tidak perlu response, hanya log
        return;
      }

        // ... (other call handlers remain the same)

      } catch (err) {
        console.error("ws message handling error", err);
      }
    });

    ws.on('close', async () => {
      clients.delete(ws);

      try {
        await pool.query("UPDATE users SET is_online = 0 WHERE id = ?", [ws.userId]);
        console.log(`🔴 User ${ws.userId} Offline`);
      } catch (e) {}

      broadcastAll({
        type: "user_offline",
        userId: ws.userId
      });
    });

  } catch (e) {
    console.error('ws connection error', e);
    try { ws.close(); } catch (e) {}
  }
});

// ==================== TCP SERVER ====================

const tcpClients = new Map();

const tcpServer = net.createServer((socket) => {
  console.log('TCP client connected');

  let user = null;
  let buffer = '';

  socket.on('data', async (data) => {
    buffer += data.toString();
    let lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line

    for (let line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        
        if (msg.type === 'auth') {
          // Authenticate
          const token = msg.token;
          try {
            user = jwt.verify(token, SECRET);
            socket.userId = user.id;
            socket.username = user.username;
            tcpClients.set(socket, { userId: user.id, username: user.username });

            await pool.query('UPDATE users SET is_online = 1 WHERE id = ?', [user.id]);

            // Send init data (TCP only supports global chat)
            const [allUsers] = await pool.query('SELECT id, username, is_online FROM users ORDER BY username ASC');
            
            socket.write(JSON.stringify({ 
              type: 'init', 
              users: allUsers 
            }) + '\n');

            // Send global chat history
            const [globalMessages] = await pool.query(
              'SELECT m.id, m.sender_id, m.content, m.created_at, u.username FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.room_id IS NULL AND m.recipient_id IS NULL ORDER BY m.created_at ASC'
            );
            
            globalMessages.forEach(msg => {
              socket.write(JSON.stringify({
                type: 'global_message',
                message: {
                  sender_id: msg.sender_id,
                  content: msg.content,
                  username: msg.username,
                  room_id: null,
                  recipient_id: null,
                  created_at: msg.created_at
                }
              }) + '\n');
            });

            console.log(`TCP: User ${user.username} authenticated`);
          } catch (e) {
            socket.write(JSON.stringify({ type: 'error', message: 'Invalid token' }) + '\n');
            socket.end();
          }
          continue;
        }

        if (!user) {
          socket.write(JSON.stringify({ type: 'error', message: 'Not authenticated' }) + '\n');
          continue;
        }

        // Handle messages similar to WebSocket
        if (msg.type === 'global_message') {
          const content = msg.content || "";
          if (!content) continue;

          const sentAt = Date.now();  

          await pool.query('INSERT INTO messages (sender_id, room_id, content) VALUES (?, NULL, ?)', [socket.userId, content]);

          const broadcastMsg = {
            type: "global_message",
            message: {
              sender_id: socket.userId,
              content,
              username: socket.username + " (TCP)", // Just username, not "Global — username"
              sent_at: sentAt,
              room_id: null,
              recipient_id: null,
              created_at: new Date().toISOString()
            }
          };

          // Broadcast to TCP clients
          tcpClients.forEach((client, sock) => {
            if (sock !== socket) {
              sock.write(JSON.stringify(broadcastMsg) + '\n');
            }
          });

          // Also broadcast to WebSocket clients
          broadcastAll(broadcastMsg);
        } else {
          // TCP only supports global messages
          socket.write(JSON.stringify({ type: 'error', message: 'TCP chat only supports global messages' }) + '\n');
        }

        // No room or private messages for TCP

      } catch (err) {
        console.error('TCP message error:', err);
        socket.write(JSON.stringify({ type: 'error', message: 'Invalid message' }) + '\n');
      }
    }
  });

  socket.on('close', async () => {
    if (user) {
      tcpClients.delete(socket);
      try {
        await pool.query("UPDATE users SET is_online = 0 WHERE id = ?", [user.id]);
        console.log(`TCP: User ${user.username} disconnected`);
      } catch (e) {}
    }
  });

  socket.on('error', (err) => {
    console.error('TCP socket error:', err);
  });
});

tcpServer.listen(3002, '127.0.0.1', () => {
  console.log('✅ TCP Server listening on 127.0.0.1:3002');
});

// ==================== DEBUG ENDPOINT ====================
// ==================== DEBUG ENDPOINTS ====================


// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on https://0.0.0.0:${PORT}`);
  console.log(`✅ Contacts system ready!`);
  console.log(`✅ Global/Room chat available!`);
});