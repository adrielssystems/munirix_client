import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getMasterKey() {
  const raw =
    process.env.ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    'munirix_dev_fallback_key_change_in_production_2026';
  return crypto.createHash('sha256').update(String(raw)).digest();
}

/**
 * Cifra un secreto con AES-256-GCM. Formato: "enc:v1:<ivHex>:<tagHex>:<cipherHex>"
 */
export function encryptSecret(plainText) {
  if (!plainText) return null;
  if (typeof plainText === 'string' && plainText.startsWith('enc:v1:')) {
    return plainText;
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descifra un secreto generado por encryptSecret.
 * Si recibe texto plano heredado (sin prefijo enc:v1:), lo devuelve tal cual para compatibilidad.
 */
export function decryptSecret(storedValue) {
  if (!storedValue) return null;
  if (typeof storedValue !== 'string' || !storedValue.startsWith('enc:v1:')) {
    return storedValue;
  }
  const parts = storedValue.split(':');
  if (parts.length !== 5) return null;
  const [, , ivHex, tagHex, cipherHex] = parts;
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getMasterKey(),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Enmascara una clave para mostrarla de forma segura en UI.
 */
export function maskSecret(plainOrEncrypted) {
  const plain = decryptSecret(plainOrEncrypted);
  if (!plain) return '';
  if (plain.length <= 8) return '••••••••';
  return `${plain.slice(0, 4)}••••••${plain.slice(-4)}`;
}

/**
 * Firma un payload JSON con HMAC-SHA256 (para state OAuth de Google).
 */
export function signState(payloadObj) {
  const data = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getMasterKey()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Verifica y decodifica un state firmado con signState.
 */
export function verifyState(stateToken, maxAgeMs = 15 * 60 * 1000) {
  if (!stateToken || !stateToken.includes('.')) return null;
  const [data, sig] = stateToken.split('.');
  const expected = crypto.createHmac('sha256', getMasterKey()).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (parsed.iat && Date.now() - parsed.iat > maxAgeMs) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Valida la cabecera X-Hub-Signature-256 de Meta Webhooks.
 */
export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) return true; // Si no hay appSecret configurado en desarrollo, no bloquea
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

