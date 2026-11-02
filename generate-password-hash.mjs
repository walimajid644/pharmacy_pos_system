// Utility script to generate bcrypt hash for passwords
// Usage: node generate-password-hash.mjs <password>

import bcrypt from 'bcryptjs';

const password = process.argv[2] || 'admin123';

const hash = await bcrypt.hash(password, 10);

console.log('Password:', password);
console.log('Bcrypt Hash:', hash);
console.log('\nUse this hash in your database migrations.');
