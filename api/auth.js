const { createClient } = require('@supabase/supabase-js');
const { createToken, hashPassword, checkPassword } = require('../lib/session');

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

  const { action, nombre, cedula, correo, password } = req.body || {};

  // REGISTRO
  if (action === 'register') {
    if (!nombre || !cedula || !correo || !password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const ced = String(cedula).trim();
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

    return res.status(200).json({
      success: true,
      message: '¡Cuenta creada exitosamente!',
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

  return res.status(400).json({ error: 'Acción no válida' });
};
