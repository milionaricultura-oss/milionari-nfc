const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.query;

  if (!code) {
    return res.redirect('https://milionarihats.com');
  }

  try {
    const { data, error } = await supabase
      .from('nfc_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (error || !data) {
      return res.redirect('https://milionarihats.com');
    }

    // Construir nombre parcial (primer nombre + inicial del apellido)
    let ownerParcial = '';
    if (data.owner_name) {
      const partes = data.owner_name.trim().split(/\s+/);
      const primerNombre = partes[0] || '';
      const inicialApellido = partes.length > 1 ? partes[partes.length - 1].charAt(0).toUpperCase() + '.' : '';
      ownerParcial = (primerNombre + ' ' + inicialApellido).trim();
    }

    // Formatear fecha de registro (dd mmm yyyy en espanol)
    let fechaReg = '';
    if (data.activated_at) {
      const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const f = new Date(data.activated_at);
      if (!isNaN(f)) {
        fechaReg = f.getDate() + ' ' + meses[f.getMonth()] + ' ' + f.getFullYear();
      }
    }

    // Redirigir a la pagina de Shopify con todos los datos
    const params = new URLSearchParams({
      code: code.toUpperCase(),
      status: data.activated ? 'registered' : 'new',
      unit: data.unit_number,
      total: data.total_units
    });
    if (ownerParcial) params.set('owner', ownerParcial);
    if (fechaReg) params.set('fecha', fechaReg);

    return res.redirect(`${data.page_url}?${params.toString()}`);
  } catch (err) {
    console.error('Error:', err);
    return res.redirect('https://milionarihats.com');
  }
};
