
// ============================================================
//  MILIONARI — API contador del probador AR
//  Ubicacion:  /api/tryon-count.js
//  URL final:  https://verificar.milionarihats.com/api/tryon-count
//
//  Usa las MISMAS variables de entorno que el resto de tu API:
//    SUPABASE_URL
//    SUPABASE_SERVICE_KEY
//
//  GET   -> { count: <total> }
//  POST  -> body { cap? } -> incrementa y devuelve { count: <nuevo total> }
// ============================================================
 
const { createClient } = require('@supabase/supabase-js');
 
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
 
// Origenes permitidos (tu tienda)
const ALLOWED = [
  'https://milionarihats.com',
  'https://www.milionarihats.com',
];
 
function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED[0]);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
}
 
module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
 
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('tryon_counts')
        .select('count')
        .eq('cap', 'global')
        .single();
      if (error) throw error;
      return res.status(200).json({ count: data ? Number(data.count) : 0 });
    }
 
    if (req.method === 'POST') {
      const cap = (req.body && req.body.cap) || '';
      const { data, error } = await supabase.rpc('increment_tryon', { p_cap: cap });
      if (error) throw error;
      return res.status(200).json({ count: Number(data) });
    }
 
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[tryon-count]', e);
    return res.status(500).json({ error: 'server_error' });
  }
};
 
