// tcp-client.js - TCP Chat Client (Global Chat Only)
require('dotenv').config();
const net = require('net');
const https = require('https');
const jwt = require('jsonwebtoken');
const readline = require('readline');

const SECRET = process.env.JWT_SECRET;
let token = null;
let username = null;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

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
        'Content-Length': data.length
      },
      rejectUnauthorized: false // For self-signed cert
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.token) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'Login failed'));
          }
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

function promptLogin() {
  rl.question('Username: ', (user) => {
    rl.question('Password: ', (pass) => {
      login(user, pass).then((response) => {
        token = response.token;
        username = response.username;
        console.log(`Login successful as ${username}`);
        startChat();
      }).catch((err) => {
        console.error('Login failed:', err.message);
        promptLogin();
      });
    });
  });
}

function startChat() {
  const client = new net.Socket();

  client.connect(3002, 'localhost', () => {
    console.log('Connected to TCP server');
    console.log('This is GLOBAL CHAT ONLY via TCP. Type your messages:');

    // Authenticate
    client.write(JSON.stringify({ type: 'auth', token: token }) + '\n');

    rl.on('line', (input) => {
      if (input.trim()) {
        const msg = {
          type: 'global_message',
          content: input.trim()
        };
        client.write(JSON.stringify(msg) + '\n');
      }
    });
  });

  client.on('data', (data) => {
    const messages = data.toString().split('\n');
    messages.forEach(msg => {
      if (msg.trim()) {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.type === 'global_message') {
            console.log(`${parsed.message.username}: ${parsed.message.content}`);
          } else if (parsed.type === 'user_online') {
            console.log(`User ${parsed.username} is online`);
          } else if (parsed.type === 'user_offline') {
            console.log(`User ${parsed.username} is offline`);
          } else if (parsed.type === 'init') {
            console.log('Connected! TCP Chat supports only global messages.');
            console.log('Online users:', parsed.users.filter(u => u.is_online).map(u => u.username).join(', '));
          } else if (parsed.type === 'error') {
            console.error('Error:', parsed.message);
          } else {
            console.log('Received:', parsed);
          }
        } catch (e) {
          console.log('Raw:', msg);
        }
      }
    });
  });

  client.on('close', () => {
    console.log('Connection closed');
    rl.close();
  });

  client.on('error', (err) => {
    console.error('Connection error:', err);
  });
}

// Start with login
promptLogin();