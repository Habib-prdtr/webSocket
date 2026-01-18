  // tcp-client.js - TCP Chat Client (Global Chat Only)
  require('dotenv').config();
  const net = require('net');
  const https = require('https');
  const readline = require('readline');

  let token = null;
  let username = null;

  /**
   * =========================
   * READLINE (LOGIN ONLY)
   * =========================
   */
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  /**
   * =========================
   * LOGIN VIA HTTPS
   * =========================
   */
  function login(usernameInput, password) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ username: usernameInput, password });

      const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        rejectUnauthorized: false
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.token) resolve(response);
            else reject(new Error(response.error || 'Login failed'));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * =========================
   * PROMPT LOGIN
   * =========================
   */
  function promptLogin() {
    rl.question('Username: ', (user) => {
      rl.question('Password: ', (pass) => {
        login(user, pass)
          .then((res) => {
            token = res.token;
            username = res.username;
            console.log(`\nLogin successful as ${username}\n`);
            rl.close();
            startChat();
          })
          .catch((err) => {
            console.error('Login failed:', err.message);
            promptLogin();
          });
      });
    });
  }

  /**
   * =========================
   * CHAT INPUT (RAW MODE)
   * =========================
   */
  let currentInput = '';
  let inputEnabled = false;

  function redrawPrompt() {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write('[Anda:] ' + currentInput);
  }

  function enableChatInput(client) {
    if (inputEnabled) return;
    inputEnabled = true;

    readline.emitKeypressEvents(process.stdin);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.resume();

    process.stdin.on('keypress', (str, key) => {
      // Ctrl + C
      if (key.sequence === '\u0003') {
        process.stdout.write('\nKeluar...\n');
        process.exit();
      }

      // ENTER
      if (key.name === 'return') {
        const msg = currentInput.trim();

        if (msg) {
          // tampilkan pesan sendiri LANGSUNG
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(`[Anda]: ${msg}\n`);

          client.write(JSON.stringify({
            type: 'global_message',
            content: msg
          }) + '\n');
        }

        currentInput = '';
        redrawPrompt();
        return;
      }

      // BACKSPACE
      if (key.name === 'backspace') {
        currentInput = currentInput.slice(0, -1);
        redrawPrompt();
        return;
      }

      // karakter biasa
      if (!key.ctrl && !key.meta && key.sequence) {
        currentInput += key.sequence;
        redrawPrompt();
      }
    });
  }

  /**
   * =========================
   * START TCP CHAT
   * =========================
   */
  function startChat() {
    const client = new net.Socket();

    client.connect(3002, 'localhost', () => {
      console.log('Connected to TCP server');
      console.log('GLOBAL CHAT (TCP)\n');

      client.write(JSON.stringify({
        type: 'auth',
        token
      }) + '\n');

      enableChatInput(client);
    });

    client.on('data', (data) => {
      const messages = data.toString().split('\n');

      messages.forEach(msg => {
        if (!msg.trim()) return;

        try {
          const parsed = JSON.parse(msg);
          if (parsed.type === 'auth_success') {
            redrawPrompt();
            return;
          }

          /**
           * ===== REALTIME MESSAGE =====
           * TAMPILKAN HANYA PESAN USER LAIN
           */
          if (
            parsed.type === 'global_message' &&
            parsed.message.username !== username
          ) {

            const receivedAt = Number(process.hrtime.bigint() / 1000000n);

            const sentAt = parsed.message.sent_at;

            let delayInfo = '';
            if (sentAt) {
              const delayMs = receivedAt - sentAt;
              delayInfo = ` (${delayMs} ms)`;
            }

            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(
              `${parsed.message.username}: ${parsed.message.content}\n`
            );
            redrawPrompt();
          }
        } catch {
          // ignore invalid JSON
        }
      });
    });

    client.on('close', () => {
      console.log('\nConnection closed');
      process.exit();
    });

    client.on('error', (err) => {
      console.error('Connection error:', err.message);
    });
  }

  /**
   * =========================
   * ENTRY POINT
   * =========================
   */
  promptLogin();
