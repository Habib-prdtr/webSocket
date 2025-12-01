// generate-cert.js
const { execSync } = require('child_process');
const fs = require('fs');

console.log('🔐 Generating self-signed SSL certificate...');

// Generate private key
execSync('openssl genrsa -out localhost-key.pem 2048');

// Generate CSR
execSync('openssl req -new -key localhost-key.pem -out localhost.csr -subj "/C=ID/ST=Java/L=Jakarta/O=Dev/CN=localhost"');

// Generate certificate
execSync('openssl x509 -req -in localhost.csr -signkey localhost-key.pem -out localhost.pem -days 365');

// Clean up
fs.unlinkSync('localhost.csr');

console.log('✅ SSL certificate generated:');
console.log('   - localhost-key.pem (private key)');
console.log('   - localhost.pem (certificate)');
console.log('');
console.log('🚀 Run: node app.js');