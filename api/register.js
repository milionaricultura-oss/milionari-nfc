const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, owner_name, owner_cedula } = req.body;

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

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('nfc_codes')
      .update({
        activated: true,
        activated_at: now,
        owner_name: owner_name.trim(),
        owner_cedula: owner_cedula.trim(),
        scan_count: 1
      })
      .eq('code', code.toUpperCase());

    if (updateError) throw updateError;

    // Sumar 100 puntos si el usuario existe
    const { data: user } = await supabase
      .from('milionari_users')
      .select('*')
      .eq('cedula', owner_cedula.trim())
      .single();

    if (user) {
      await supabase
        .from('milionari_users')
        .update({ puntos: user.puntos + 100 })
        .eq('cedula', owner_cedula.trim());

      await supabase
        .from('milionari_puntos')
        .insert({
          user_id: user.id,
          cedula: owner_cedula.trim(),
          concepto: 'Registro gorra: ' + data.model + ' #' + data.unit_number,
          puntos: 100
        });
    }

    return res.status(200).json({
      success: true,
      message: '¡Gorra registrada exitosamente!',
      model: data.model,
      unit_number: data.unit_number,
      total_units: data.total_units,
      owner_name: owner_name.trim(),
      activated_at: now,
      puntos_ganados: user ? 100 : 0,
      tiene_cuenta: !!user
    });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
