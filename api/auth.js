const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, nombre, cedula, correo, password } = req.body;

  // REGISTRO
  if (action === 'register') {
    if (!nombre || !cedula || !correo || !password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const { data: existing } = await supabase
      .from('milionari_users')
      .select('id')
      .or(`cedula.eq.${cedula},correo.eq.${correo}`)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Ya existe una cuenta con ese correo o cédula' });
    }

    const { data, error } = await supabase
      .from('milionari_users')
      .insert({
        nombre: nombre.trim(),
        cedula: cedula.trim(),
        correo: correo.trim().toLowerCase(),
        password_hash: hashPassword(password),
        puntos: 0
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Error al crear cuenta' });

    return res.status(200).json({
      success: true,
      message: '¡Cuenta creada exitosamente!',
      user: { id: data.id, nombre: data.nombre, correo: data.correo, puntos: data.puntos }
    });
  }

  // LOGIN
  if (action === 'login') {
    if (!correo || !password) {
      return res.status(400).json({ error: 'Correo y contraseña requeridos' });
    }

    const { data, error } = await supabase
      .from('milionari_users')
      .select('*')
      .eq('correo', correo.trim().toLowerCase())
      .eq('password_hash', hashPassword(password))
      .single();

    if (error || !data) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    return res.status(200).json({
      success: true,
      user: { id: data.id, nombre: data.nombre, correo: data.correo, cedula: data.cedula, puntos: data.puntos }
    });
  }

  return res.status(400).json({ error: 'Acción no válida' });
};
