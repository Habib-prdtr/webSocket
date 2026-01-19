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
 * CHAT INPUT (FIXED VERSION)
 * =========================
 */
let currentInput = '';
let isPromptShowing = false;

function showPrompt() {
  if (!isPromptShowing) {
    process.stdout.write('>> ');
    isPromptShowing = true;
  }
}

function clearCurrentLine() {
  process.stdout.write('\r\x1b[K');
}
function enableChatInput(client) {
  // Setup stdin untuk menerima input
  process.stdin.setEncoding('utf8');
  
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  
  process.stdin.resume();
  
  // Tampilkan prompt awal
  showPrompt();
  
  // Handle input dari user
  process.stdin.on('data', (data) => {
    const char = data.toString();
    
    // Ctrl+C untuk exit
    if (char === '\u0003') {
      console.log('\nKeluar...');
      client.end();
      process.exit(0);
    }
    
    // Enter - kirim pesan
    if (char === '\n' || char === '\r') {
      const message = currentInput.trim();
      
      if (message) {
        // Clear prompt line
        clearCurrentLine();
        
        // Tampilkan pesan kita
        console.log(`[${username}]: ${message}`);
        
        // Kirim ke server
        client.write(JSON.stringify({
          type: 'global_message',
          content: message
        }) + '\n');
      }
      
      // Reset input
      currentInput = '';
      isPromptShowing = false;
      
      // Tampilkan prompt baru setelah delay kecil
      setTimeout(() => {
        showPrompt();
      }, 50);
      return;
    }
    
    // Backspace
    if (char === '\b' || char === '\x7f') {
      if (currentInput.length > 0) {
        currentInput = currentInput.slice(0, -1);
        clearCurrentLine();
        process.stdout.write('>> ' + currentInput);
      }
      return;
    }
    
    // Filter karakter yang tidak diinginkan (arrow keys, dll)
    if (char.charCodeAt(0) === 27) { // ESC sequence
      return;
    }
    
    // Karakter printable (32-126 dalam ASCII)
    if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
      currentInput += char;
      
      // Jika prompt belum ditampilkan, tampilkan dulu
      if (!isPromptShowing) {
        process.stdout.write('>> ' + currentInput);
        isPromptShowing = true;
      } else {
        // Hanya tulis karakter baru
        process.stdout.write(char);
      }
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
    console.log('GLOBAL CHAT (TCP)');
    console.log('========================');
    console.log('Type your message and press Enter to send');
    console.log('Press Ctrl+C to exit\n');

    // Authenticate
    client.write(JSON.stringify({
      type: 'auth',
      token
    }) + '\n');

    // Setup input handling
    enableChatInput(client);
  });

  client.on('data', (data) => {
    const messages = data.toString().split('\n');

    messages.forEach(msg => {
      if (!msg.trim()) return;

      try {
        const parsed = JSON.parse(msg);
        
        // Authentication response
        if (parsed.type === 'auth_success') {
          console.log('✅ Authentication successful!\n');
          return;
        }
        
        // Error response
        if (parsed.type === 'error') {
          console.error(`❌ Error: ${parsed.message}`);
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
          // Jika ada input yang sedang ditgetik, clear dulu
          if (currentInput.length > 0) {
            clearCurrentLine();
          } else if (isPromptShowing) {
            // Hanya clear prompt
            clearCurrentLine();
          }
          
          // Tampilkan pesan yang diterima
          console.log(`${parsed.message.username}: ${parsed.message.content}`);
          
          // Tampilkan prompt kembali jika user sedang mengetik
          if (currentInput.length > 0) {
            process.stdout.write('>> ' + currentInput);
          } else {
            // Reset flag dan tampilkan prompt baru
            isPromptShowing = false;
            showPrompt();
          }
        }
      } catch (error) {
        // Skip invalid JSON
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