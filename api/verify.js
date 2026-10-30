// Verificación de gorras.
//
// 1) El chip abre:  /api/verify?code=XXX   (o la ruta corta /v/XXX)
//    -> suma 1 al contador de escaneos y lleva a la página del modelo SOLO con el código:
//       https://milionarihats.com/pages/<pagina-del-modelo>?code=XXX
//
// 2) Esa página pregunta aquí qué dice la base de datos:
//    /api/verify?code=XXX&format=json
//    -> { valid, code, model, unit_number, total_units, activated, activated_at, owner, scan_count, page_url }
//
// La página nunca confía en datos escritos en el enlace: todo lo que muestra sale de esta respuesta.
const { createClient } = require('@supabase/supabase-js');
const { normalizarCodigo, nombreParcial } = require('../lib/gorras');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const HOME = 'https://milionarihats.com';
// Página a la que va un código que no existe: muestra "No reconocida".
const NO_RECONOCIDA = process.env.VERIFY_NOT_FOUND_PAGE || 'https://milionarihats.com/pages/verificacion-benjamin-crystal-1';

function conCodigo(url, code) {
  return url + (url.includes('?') ? '&' : '?') + 'code=' + encodeURIComponent(code);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const json = req.query.format === 'json';
  const code = normalizarCodigo(req.query.code);

  if (!code) {
    return json ? res.status(200).json({ valid: false }) : res.redirect(HOME);
  }

  try {
    const { data, error } = await supabase
      .from('nfc_codes')
      .select('code, model, unit_number, total_units, activated, activated_at, owner_name, scan_count, page_url')
      .eq('code', code)
      .maybeSingle();

    if (error) throw error;

    // ── Consulta de la página ──
    if (json) {
      if (!data) return res.status(200).json({ valid: false, code });
      return res.status(200).json({
        valid: true,
        code: data.code,
        model: data.model,
        unit_number: data.unit_number,
        total_units: data.total_units,
        activated: !!data.activated,
        activated_at: data.activated ? data.activated_at : null,
        owner: data.activated ? nombreParcial(data.owner_name) : '',
        scan_count: data.scan_count || 0,
        page_url: data.page_url
      });
    }

    // ── Escaneo del chip ──
    if (!data) return res.redirect(conCodigo(NO_RECONOCIDA, code));

    await supabase
      .from('nfc_codes')
      .update({ scan_count: (data.scan_count || 0) + 1 })
      .eq('code', code);

    return res.redirect(conCodigo(data.page_url || NO_RECONOCIDA, code));
  } catch (err) {
    console.error('Error en verify:', err);
    return json ? res.status(500).json({ error: 'No se pudo verificar' }) : res.redirect(HOME);
  }
};
