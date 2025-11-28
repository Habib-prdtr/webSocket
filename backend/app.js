require('dotenv').config();

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.warn('WARNING: JWT_SECRET not set in .env. Set JWT_SECRET to a strong secret.');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'))); // serve public/ from project root

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

// Register
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

// Login
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

    // mark online true (will also be set on WS connect but set here for REST-based clients)
    await pool.query('UPDATE users SET is_online = 1 WHERE id = ?', [user.id]);

    return res.json({ token, id: user.id, username: user.username });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get initial data (users, rooms, some messages)
app.get('/api/init', authMiddleware, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, username, is_online FROM users ORDER BY username ASC');
    const [rooms] = await pool.query('SELECT id, name FROM rooms ORDER BY id ASC');
    const [msgs] = await pool.query(
      `SELECT m.*, u.username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       ORDER BY m.id ASC
       LIMIT 500`
    );

    return res.json({ users, rooms, messages: msgs });
  } catch (e) {
    console.error('init error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get all rooms (public)
app.get('/api/rooms', async (req, res) => {
  try {
    const [rooms] = await pool.query('SELECT id, name FROM rooms ORDER BY id ASC');
    return res.json(rooms);
  } catch (e) {
    console.error('rooms error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Create room (auth)
app.post('/api/rooms', authMiddleware, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Room name required' });

  try {
    const [exists] = await pool.query('SELECT id FROM rooms WHERE name = ?', [name]);
    if (exists.length) return res.status(400).json({ error: 'Room already exists' });

    const [result] = await pool.query('INSERT INTO rooms (name, created_by) VALUES (?, ?)', [name, req.user.id]);
    const room = { id: result.insertId, name };

    // broadcast to ws clients
    broadcastAll({ type: 'room_created', room });

    return res.json({ room });
  } catch (e) {
    console.error('create room error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET room messages (paginated)
app.get('/api/rooms/:id/messages', authMiddleware, async (req, res) => {
  try {
    const roomId = parseInt(req.params.id, 10);
    if (Number.isNaN(roomId)) return res.status(400).json({ error: 'Invalid room id' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(200, Math.max(10, parseInt(req.query.limit || '50', 10)));
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT m.id, m.sender_id, m.recipient_id, m.room_id, m.content, m.created_at, u.username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.room_id = ?
       ORDER BY m.id ASC
       LIMIT ? OFFSET ?`,
      [roomId, limit, offset]
    );

    const [countRes] = await pool.query('SELECT COUNT(*) AS total FROM messages WHERE room_id = ?', [roomId]);
    const total = countRes[0]?.total || 0;

    return res.json({ roomId, page, limit, total, messages: rows });
  } catch (e) {
    console.error('room messages error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET private messages between two users (auth)
app.get('/api/private/:me/:target', authMiddleware, async (req, res) => {
  try {
    const me = req.params.me;
    const target = req.params.target;

    // resolve ids
    const [[u1]] = await pool.query('SELECT id FROM users WHERE username = ?', [me]);
    const [[u2]] = await pool.query('SELECT id FROM users WHERE username = ?', [target]);

    if (!u1 || !u2) return res.status(404).json({ error: 'User not found' });

    const [rows] = await pool.query(
      `SELECT m.*, u.username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
       ORDER BY m.id ASC`,
      [u1.id, u2.id, u2.id, u1.id]
    );

    return res.json(rows);
  } catch (e) {
    console.error('private messages error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// -------------------------
// WEBSOCKET server
// -------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Map of ws -> { userId, username }
const clients = new Map();

// helper: broadcast to all connected clients
function broadcastAll(obj) {
  const msg = JSON.stringify(obj);
  for (const [ws] of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

// handle upgrading HTTP to WS
server.on('upgrade', (request, socket, head) => {
  // Only accept ws upgrade on /ws path
  if (!request.url.startsWith('/ws')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', async (ws, req) => {
  try {
    // parse token from query
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

    // send init payload (rooms + users + maybe recent messages)
    const [rooms] = await pool.query('SELECT id, name FROM rooms ORDER BY id ASC');
    const [users] = await pool.query('SELECT id, username, is_online FROM users ORDER BY username ASC');

    // we will send an 'init' event to this client only
    ws.send(JSON.stringify({ type: 'init', rooms, users }));

    // handle messages from this ws
    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw);

        // Join room: client may set ws.currentRoom
        if (data.type === 'join_room') {
          ws.currentRoom = data.roomId || data.room_id || null;
          ws.send(JSON.stringify({ type: 'joined_room', roomId: ws.currentRoom }));
        }

        // Room message (store + broadcast to all)
        else if (data.type === 'room_message') {
          const roomId = data.roomId || data.room_id || ws.currentRoom || null;
          if (!roomId) {
            // ignore messages without room
            return;
          }
          const content = data.content || data.message || '';
          const [insert] = await pool.query(
            'INSERT INTO messages (sender_id, room_id, content) VALUES (?, ?, ?)',
            [user.id, roomId, content]
          );

          const [msgRow] = await pool.query(
            `SELECT m.*, u.username FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
            [insert.insertId]
          );

          // broadcast to all clients (frontend will filter by room)
          broadcastAll({ type: 'room_message', message: msgRow[0] });
        }

        // Private message
        else if (data.type === 'private_message') {
          const recipientId = data.recipientId || data.to || null;
          if (!recipientId) return;

          const content = data.content || data.message || '';

          const [insert] = await pool.query(
            'INSERT INTO messages (sender_id, recipient_id, content) VALUES (?, ?, ?)',
            [user.id, recipientId, content]
          );

          const [msgRow] = await pool.query(
            `SELECT m.*, u.username FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
            [insert.insertId]
          );

          // send only to sender & recipient
          for (const [clientWS, clientInfo] of clients) {
            if (clientWS.readyState !== clientWS.OPEN) continue;
            if (clientInfo.userId === user.id || clientInfo.userId === Number(recipientId)) {
              clientWS.send(JSON.stringify({ type: 'private_message', message: msgRow[0] }));
            }
          }
        }

      } catch (e) {
        console.error('ws message handling error', e);
      }
    });

    ws.on('close', async () => {
      clients.delete(ws);
      // mark offline
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

// start server
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
