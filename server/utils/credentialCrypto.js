const crypto = require('crypto');

// ── Shared encryption helpers for stored third-party credentials ──────────────
// Uses a dedicated ENCRYPTION_KEY env var, separate from JWT_SECRET.
// Falls back to JWT_SECRET with a deprecation warning so existing deployments
// continue to work; set ENCRYPTION_KEY to rotate to a proper dedicated secret.
// `salt` domain-separates the derived key per credential type (e.g. 'shiplabel'),
// so the same ENCRYPTION_KEY produces different derived keys for each.
function getKey(salt) {
  const raw = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!raw) {
    throw new Error(
      'Neither ENCRYPTION_KEY nor JWT_SECRET is set. ' +
      'Set ENCRYPTION_KEY (preferred) to enable credential encryption.'
    );
  }
  if (!process.env.ENCRYPTION_KEY && process.env.JWT_SECRET) {
    console.warn(
      `[credentialCrypto] ENCRYPTION_KEY is not set — falling back to JWT_SECRET for "${salt}". ` +
      'Set a dedicated ENCRYPTION_KEY in your .env file.'
    );
  }
  return crypto.scryptSync(raw, `${salt}-credential-salt-v1`, 32);
}

function encrypt(plainText, salt) {
  const iv        = crypto.randomBytes(16);
  const cipher    = crypto.createCipheriv('aes-256-cbc', getKey(salt), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return { encrypted: encrypted.toString('hex'), iv: iv.toString('hex') };
}

function decrypt(encryptedHex, ivHex, salt) {
  const decipher  = crypto.createDecipheriv('aes-256-cbc', getKey(salt), Buffer.from(ivHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
