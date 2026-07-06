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

    // Redirigir a la página de Shopify con el código, número de unidad y total
    return res.redirect(`${data.page_url}?code=${code.toUpperCase()}&status=${data.activated ? 'registered' : 'new'}&unit=${data.unit_number}&total=${data.total_units}`);
  } catch (err) {
    console.error('Error:', err);
    return res.redirect('https://milionarihats.com');
  }
};
