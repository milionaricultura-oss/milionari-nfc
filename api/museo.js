// Accesos especiales del Museo Virtual. Las claves viven SOLO aquí (variables de Vercel),
// nunca en el código de la página.
//
//   POST {action:'vip'}  + Authorization: Bearer <sesión de Mi Cuenta>
//        -> entra si el cliente tiene al menos una gorra registrada a su nombre.
//   POST {action:'vip', pin}      -> entra si el PIN coincide con VIP_PIN.
//   POST {action:'ceo', password, uid?} -> entra como CEO si coincide con CEO_PASSWORD; con uid
//        lo marca en Firebase (museo/ceo/<uid>) usando FIREBASE_DB_URL y FIREBASE_DB_SECRET.
//   POST {action:'slot'}          -> la máquina de la suerte: el SERVIDOR decide si ganas,
//        cuenta las jugadas del día y entrega un código de descuento único de un solo uso
//        (tabla milionari_slot_codigos). Variables: SLOT_WIN_CHANCE (% , por defecto 2),
//        SLOT_MAX_PLAYS (por día, por defecto 7), SLOT_DISCOUNT_PCT (por defecto 20).
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
const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };

// Identifica al jugador sin guardar datos personales: la cédula (si tiene sesión de Mi Cuenta)
// o una huella de su conexión, ambas pasadas por un hash con clave.
function jugador(req, ses) {
  const sal = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY || 'milionari';
  const base = ses && ses.ced
    ? 'ced:' + ses.ced
    : 'ip:' + String((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.headers['x-real-ip'] || '') + '|' + String(req.headers['user-agent'] || '').slice(0, 120);
  return crypto.createHmac('sha256', sal).update(base).digest('hex').slice(0, 32);
}
function hoyBogota() {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

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

    if (action === 'slot') {
      const ses = verifyToken(tokenFromRequest(req));
      const quien = jugador(req, ses);
      const dia = hoyBogota();
      const max = Math.max(1, Math.round(num(process.env.SLOT_MAX_PLAYS, 7)));
      const prob = Math.min(100, Math.max(0, num(process.env.SLOT_WIN_CHANCE, 2)));
      const pct = Math.round(num(process.env.SLOT_DISCOUNT_PCT, 20));

      const { data: fila } = await supabase.from('milionari_slot_jugadas').select('*').eq('quien', quien).eq('dia', dia).maybeSingle();
      const jugadas = fila ? fila.jugadas : 0;
      if (jugadas >= max) return res.status(200).json({ success: false, limite: true, error: 'Ya usaste tus ' + max + ' jugadas de hoy. Vuelve mañana.' });

      // ¿Ya ganó alguna vez? Un premio por persona.
      const { data: yaGano } = await supabase.from('milionari_slot_codigos').select('code').eq('quien', quien).limit(1);
      let gano = !(yaGano && yaGano.length) && (crypto.randomInt(0, 10000) < prob * 100);
      let code = null;
      if (gano) {
        const { data: libres } = await supabase.from('milionari_slot_codigos').select('code').is('entregado_at', null).limit(5);
        for (const c of (libres || [])) {
          const { data: tomado } = await supabase.from('milionari_slot_codigos')
            .update({ entregado_at: new Date().toISOString(), quien })
            .eq('code', c.code).is('entregado_at', null).select('code');
          if (tomado && tomado.length) { code = tomado[0].code; break; }
        }
        if (!code) gano = false; // se acabaron los códigos: cuenta como no ganador
      }

      if (fila) await supabase.from('milionari_slot_jugadas').update({ jugadas: jugadas + 1 }).eq('quien', quien).eq('dia', dia);
      else await supabase.from('milionari_slot_jugadas').insert({ quien, dia, jugadas: 1 });

      return res.status(200).json({ success: true, gano, code, pct: gano ? pct : undefined, restantes: max - jugadas - 1 });
    }

    if (action === 'ceo') {
      if (igual(password, process.env.CEO_PASSWORD)) {
        // Si llega la identidad anónima de Firebase del visitante, se marca como CEO en Firebase
        // (las reglas solo dejan usar el avatar y el nombre FELIX a quien esté en museo/ceo).
        const uid = String((req.body || {}).uid || '');
        let firebase = false;
        if (/^[A-Za-z0-9]{20,40}$/.test(uid) && process.env.FIREBASE_DB_URL && process.env.FIREBASE_DB_SECRET) {
          try {
            const url = process.env.FIREBASE_DB_URL.replace(/\/+$/, '') + '/museo/ceo/' + uid + '.json?auth=' + encodeURIComponent(process.env.FIREBASE_DB_SECRET);
            const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: 'true' });
            firebase = r.ok;
            if (!r.ok) console.error('Firebase CEO', r.status, await r.text());
          } catch (e) { console.error('Firebase CEO', e); }
        }
        return res.status(200).json({ success: true, firebase });
      }
      await espera(700);
      return res.status(200).json({ success: false, error: 'Incorrecta' });
    }

    return res.status(400).json({ error: 'Acción no válida' });
  } catch (e) {
    console.error('Error museo:', e);
    return res.status(500).json({ success: false, error: 'Error del servidor' });
  }
};
