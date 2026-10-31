// Accesos especiales del Museo Virtual. Las claves viven SOLO aquí (variables de Vercel),
// nunca en el código de la página.
//
//   POST {action:'vip'}  + Authorization: Bearer <sesión de Mi Cuenta>
//        -> entra si el cliente tiene al menos una gorra registrada a su nombre.
//   POST {action:'vip', pin}      -> entra si el PIN coincide con VIP_PIN.
//   POST {action:'ceo', password} -> entra como CEO si coincide con CEO_PASSWORD.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { verifyToken, tokenFromRequest } = require('../lib/session');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function igual(a, b) {
  if (!a || !b) return false;
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
const espera = ms => new Promise(r => setTimeout(r, ms));

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, pin, password } = req.body || {};

  try {
    if (action === 'vip') {
      // 1) Dueño de una gorra con sesión abierta en Mi Cuenta: entra directo.
      const ses = verifyToken(tokenFromRequest(req));
      if (ses && ses.ced) {
        const { data } = await supabase.from('nfc_codes').select('code').eq('owner_cedula', ses.ced).eq('activated', true).limit(1);
        if (data && data.length) return res.status(200).json({ success: true, via: 'cuenta' });
        if (!pin) return res.status(200).json({ success: false, sin_gorra: true });
      }
      // 2) PIN general de la sala.
      if (pin && igual(String(pin).trim(), process.env.VIP_PIN)) return res.status(200).json({ success: true, via: 'pin' });
      if (pin) await espera(700);
      return res.status(200).json({ success: false, error: pin ? 'PIN incorrecto' : 'Necesitas un PIN o iniciar sesión' });
    }

    if (action === 'ceo') {
      if (igual(password, process.env.CEO_PASSWORD)) return res.status(200).json({ success: true });
      await espera(700);
      return res.status(200).json({ success: false, error: 'Incorrecta' });
    }

    return res.status(400).json({ error: 'Acción no válida' });
  } catch (e) {
    console.error('Error museo:', e);
    return res.status(500).json({ success: false, error: 'Error del servidor' });
  }
};
