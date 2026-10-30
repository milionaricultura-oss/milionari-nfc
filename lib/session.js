// Sesiones y contraseñas de las cuentas Milionari.
//
// Sesión: al iniciar sesión (o crear la cuenta) el servidor entrega un token firmado.
// Las acciones privadas (ver perfil, canjear puntos) exigen ese token: ya no basta con la cédula.
// La firma usa SESSION_SECRET; si esa variable no existe, se deriva de SUPABASE_SERVICE_KEY,
// así el despliegue funciona sin configurar nada nuevo (se recomienda crear SESSION_SECRET).
//
// Contraseñas: las nuevas se guardan con scrypt + sal ("scrypt$sal$hash"). Las antiguas
// (SHA-256 sin sal) se siguen aceptando y se actualizan solas al iniciar sesión.
const crypto = require('crypto');

const TOKEN_DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  const base = process.env.SUPABASE_SERVICE_KEY;
  if (!base) throw new Error('Falta SESSION_SECRET o SUPABASE_SERVICE_KEY');
  return crypto.createHash('sha256').update('milionari-session:' + base).digest('hex');
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function fromB64url(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function sign(payload) {
  return b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
}

function createToken(user) {
  const body = b64url(JSON.stringify({
    uid: user.id,
    ced: user.cedula,
    exp: Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400
  }));
  return body + '.' + sign(body);
}

// Devuelve { uid, ced } si el token es válido y no ha vencido; si no, null.
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = sign(body);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(fromB64url(body).toString('utf8'));
    if (!data || !data.uid || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// Lee el token del encabezado "Authorization: Bearer ..." o del campo "token" del cuerpo.
function tokenFromRequest(req) {
  const h = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (h && /^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim();
  const src = req.method === 'GET' ? req.query : req.body;
  return (src && src.token) || null;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}

function legacyHash(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

// { ok, needsUpgrade }
function checkPassword(password, stored) {
  if (!stored) return { ok: false, needsUpgrade: false };
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$');
    const test = crypto.scryptSync(String(password), salt, 32);
    const real = Buffer.from(hash, 'hex');
    return { ok: real.length === test.length && crypto.timingSafeEqual(real, test), needsUpgrade: false };
  }
  const a = Buffer.from(legacyHash(password)), b = Buffer.from(stored);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, needsUpgrade: ok };
}

module.exports = { createToken, verifyToken, tokenFromRequest, hashPassword, checkPassword };
