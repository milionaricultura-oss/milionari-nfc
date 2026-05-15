const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Código requerido' });
  }

  try {
    const { data, error } = await supabase
      .from('nfc_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (error || !data) {
      return res.status(404).json({
        valid: false,
        status: 'invalid',
        message: 'Código no encontrado. Esta gorra podría ser falsa.'
      });
    }

    if (data.activated) {
      return res.status(200).json({
        valid: true,
        status: 'already_activated',
        message: 'Este chip ya fue registrado anteriormente.',
        model: data.model,
        unit_number: data.unit_number,
        total_units: data.total_units,
        activated_at: data.activated_at,
        scan_count: data.scan_count + 1,
        page_url: data.page_url
      });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('nfc_codes')
      .update({ activated: true, activated_at: now, scan_count: 1 })
      .eq('code', code.toUpperCase());

    if (updateError) throw updateError;

    return res.status(200).json({
      valid: true,
      status: 'first_activation',
      message: '¡Primera activación exitosa!',
      model: data.model,
      unit_number: data.unit_number,
      total_units: data.total_units,
      activated_at: now,
      scan_count: 1,
      page_url: data.page_url
    });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
