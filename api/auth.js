const { createClient } = require('@supabase/supabase-js');
const { createToken, hashPassword, checkPassword, createResetToken, readResetToken, passwordFingerprint } = require('../lib/session');
const { sendRecuperarContrasena } = require('../lib/mail');
const { acreditarGorrasPendientes } = require('../lib/gorras');

const RESET_PAGE = 'https://milionarihats.com/pages/mi-cuenta-milionari';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function publicUser(u) {
  return { id: u.id, nombre: u.nombre, correo: u.correo, cedula: u.cedula, puntos: u.puntos };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, nombre, cedula, correo, password, reset_token } = req.body || {};

  // REGISTRO
  if (action === 'register') {
    if (!nombre || !cedula || !correo || !password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const ced = String(cedula).replace(/[\s.]/g, '');
    const mail = String(correo).trim().toLowerCase();

    // Dos consultas separadas (antes se armaba un filtro con el texto del usuario).
    const { data: porCedula } = await supabase.from('milionari_users').select('id').eq('cedula', ced).maybeSingle();
    const { data: porCorreo } = await supabase.from('milionari_users').select('id').eq('correo', mail).maybeSingle();
    if (porCedula || porCorreo) {
      return res.status(400).json({ error: 'Ya existe una cuenta con ese correo o cédula' });
    }

    const { data, error } = await supabase
      .from('milionari_users')
      .insert({
        nombre: String(nombre).trim(),
        cedula: ced,
        correo: mail,
        password_hash: hashPassword(password),
        puntos: 0
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Error al crear cuenta' });

    // Si esta cédula ya tenía gorras registradas sin cuenta, recibe ahora sus puntos.
    let pendientes = { gorras: 0, puntos: 0 };
    try { pendientes = await acreditarGorrasPendientes(supabase, data); } catch (e) { console.error('Puntos pendientes:', e); }

    return res.status(200).json({
      success: true,
      message: pendientes.puntos
        ? '¡Cuenta creada! Sumamos ' + pendientes.puntos + ' puntos por tus gorras registradas.'
        : '¡Cuenta creada exitosamente!',
      puntos_acreditados: pendientes.puntos,
      user: publicUser(data),
      token: createToken(data)
    });
  }

  // LOGIN
  if (action === 'login') {
    if (!correo || !password) {
      return res.status(400).json({ error: 'Correo y contraseña requeridos' });
    }

    const { data } = await supabase
      .from('milionari_users')
      .select('*')
      .eq('correo', String(correo).trim().toLowerCase())
      .maybeSingle();

    const check = data ? checkPassword(password, data.password_hash) : { ok: false };
    if (!check.ok) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    // Contraseña antigua (SHA-256 sin sal): se actualiza al formato seguro.
    if (check.needsUpgrade) {
      await supabase.from('milionari_users').update({ password_hash: hashPassword(password) }).eq('id', data.id);
    }

    return res.status(200).json({
      success: true,
      user: publicUser(data),
      token: createToken(data)
    });
  }

  // OLVIDÉ MI CONTRASEÑA: envía un enlace al correo.
  // Siempre responde lo mismo, exista o no la cuenta, para no revelar qué correos están registrados.
  if (action === 'forgot') {
    const okMsg = { success: true, message: 'Si ese correo tiene una cuenta, te enviamos un enlace para crear una nueva contraseña.' };
    if (!correo) return res.status(400).json({ error: 'Escribe tu correo' });
    try {
      const { data } = await supabase
        .from('milionari_users')
        .select('id, nombre, correo, password_hash')
        .eq('correo', String(correo).trim().toLowerCase())
        .maybeSingle();
      if (data) {
        const link = RESET_PAGE + '?reset=' + encodeURIComponent(createResetToken(data));
        await sendRecuperarContrasena(data.correo, data.nombre, link);
      }
    } catch (e) {
      console.error('Error en forgot:', e);
    }
    return res.status(200).json(okMsg);
  }

  // CREAR NUEVA CONTRASEÑA con el enlace del correo.
  if (action === 'reset') {
    const bad = { success: false, error: 'El enlace venció o ya se usó. Pide uno nuevo.' };
    if (!reset_token || !password) return res.status(400).json({ error: 'Faltan datos' });
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const info = readResetToken(reset_token);
    if (!info) return res.status(400).json(bad);

    const { data: user } = await supabase.from('milionari_users').select('*').eq('id', info.uid).maybeSingle();
    if (!user || passwordFingerprint(user.password_hash) !== info.fp) return res.status(400).json(bad);

    const nuevo = hashPassword(password);
    const { error } = await supabase.from('milionari_users').update({ password_hash: nuevo }).eq('id', user.id);
    if (error) return res.status(500).json({ error: 'No se pudo guardar la contraseña' });

    user.password_hash = nuevo;
    return res.status(200).json({
      success: true,
      message: 'Contraseña actualizada.',
      user: publicUser(user),
      token: createToken(user)
    });
  }

  return res.status(400).json({ error: 'Acción no válida' });
};
