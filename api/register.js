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

  const { code, owner_name, owner_cedula, owner_email, owner_password } = req.body;

  if (!code || !owner_name || !owner_cedula) {
    return res.status(400).json({ error: 'Código, nombre y cédula son requeridos' });
  }

  try {
    const { data, error } = await supabase
      .from('nfc_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Código no encontrado' });
    }

    if (data.activated) {
      return res.status(200).json({
        success: false,
        already_registered: true,
        message: 'Esta gorra ya fue registrada.',
        owner_name: data.owner_name,
        activated_at: data.activated_at
      });
    }

    const cedula = owner_cedula.trim();
    const nombre = owner_name.trim();
    const now = new Date().toISOString();

    // 1) Marcar la gorra como registrada
    const { error: updateError } = await supabase
      .from('nfc_codes')
      .update({
        activated: true,
        activated_at: now,
        owner_name: nombre,
        owner_cedula: cedula,
        scan_count: 1
      })
      .eq('code', code.toUpperCase());

    if (updateError) throw updateError;

    // 2) Buscar usuario por cedula
    let { data: user } = await supabase
      .from('milionari_users')
      .select('*')
      .eq('cedula', cedula)
      .single();

    let cuentaCreada = false;

    // 3) Si NO existe, crear la cuenta (requiere correo + contrasena)
    if (!user && owner_email && owner_password) {
      const correo = owner_email.trim().toLowerCase();

      // Verificar que ese correo no este usado por otra persona
      const { data: correoExiste } = await supabase
        .from('milionari_users')
        .select('id')
        .eq('correo', correo)
        .single();

      if (correoExiste) {
        return res.status(400).json({
          success: false,
          error: 'Ese correo ya está en uso por otra cuenta. Usa otro correo o inicia sesión.'
        });
      }

      const { data: nuevoUser, error: createError } = await supabase
        .from('milionari_users')
        .insert({
          nombre: nombre,
          cedula: cedula,
          correo: correo,
          password_hash: hashPassword(owner_password),
          puntos: 0
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creando usuario:', createError);
      } else {
        user = nuevoUser;
        cuentaCreada = true;
      }
    }

    // 4) Sumar 100 puntos si hay usuario (existente o recien creado)
    let puntosGanados = 0;
    if (user) {
      await supabase
        .from('milionari_users')
        .update({ puntos: user.puntos + 100 })
        .eq('cedula', cedula);

      await supabase
        .from('milionari_puntos')
        .insert({
          user_id: user.id,
          cedula: cedula,
          concepto: 'Registro gorra: ' + data.model + ' #' + data.unit_number,
          puntos: 100
        });

      puntosGanados = 100;
    }

    // 5) Enviar notificacion por correo (no critico)
    try {
      await fetch('https://verificar.milionarihats.com/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'registro_gorra',
          data: {
            code: code.toUpperCase(),
            model: data.model,
            unit_number: data.unit_number,
            total_units: data.total_units,
            owner_name: nombre,
            owner_cedula: cedula,
            owner_email: user ? user.correo : (owner_email || null)
          }
        })
      });
    } catch (emailErr) {
      console.log('Email error (no crítico):', emailErr);
    }

    return res.status(200).json({
      success: true,
      message: '¡Gorra registrada exitosamente!',
      model: data.model,
      unit_number: data.unit_number,
      total_units: data.total_units,
      owner_name: nombre,
      activated_at: now,
      puntos_ganados: puntosGanados,
      tiene_cuenta: !!user,
      cuenta_creada: cuentaCreada
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
