const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function igual(a, b) {
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

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

  // ── Verificacion de contrasena de admin ──
  const { password } = req.body || {};
  if (!password || !process.env.ADMIN_PASSWORD || !igual(String(password), process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ success: false, error: 'No autorizado' });
  }

  try {
    // Gorras
    const { data: gorras } = await supabase
      .from('nfc_codes')
      .select('*')
      .order('unit_number', { ascending: true });

    // Clientes
    const { data: clientes } = await supabase
      .from('milionari_users')
      .select('*')
      .order('created_at', { ascending: false });

    // Puntos historial
    const { data: puntos } = await supabase
      .from('milionari_puntos')
      .select('*')
      .order('created_at', { ascending: false });

    // Canjes
    const { data: canjesRaw } = await supabase
      .from('milionari_canjes')
      .select('*, milionari_users(nombre), milionari_productos(nombre)')
      .order('created_at', { ascending: false });

    // Formatear canjes
    var canjes = (canjesRaw || []).map(function(c) {
      return {
        id: c.id,
        user_nombre: c.milionari_users ? c.milionari_users.nombre : '-',
        producto_nombre: c.milionari_productos ? c.milionari_productos.nombre : '-',
        puntos_usados: c.puntos_usados,
        estado: c.estado,
        created_at: c.created_at
      };
    });

    // Contar gorras por cliente
    var gorrasCount = {};
    (gorras || []).forEach(function(g) {
      if (g.owner_cedula) {
        gorrasCount[g.owner_cedula] = (gorrasCount[g.owner_cedula] || 0) + 1;
      }
    });
    // Nunca se envían las contraseñas (ni cifradas) al navegador.
    var clientesConGorras = (clientes || []).map(function(c) {
      var limpio = Object.assign({}, c, { gorras_count: gorrasCount[c.cedula] || 0 });
      delete limpio.password_hash;
      return limpio;
    });

    // ¿El dueño de cada gorra tiene cuenta en Mi Cuenta?
    var cedulasConCuenta = {};
    (clientes || []).forEach(function(c) { if (c.cedula) cedulasConCuenta[c.cedula] = true; });
    var gorrasConCuenta = (gorras || []).map(function(g) {
      return Object.assign({}, g, { tiene_cuenta: !!(g.owner_cedula && cedulasConCuenta[g.owner_cedula]) });
    });
    var sinCuenta = gorrasConCuenta.filter(function(g) { return g.activated && !g.tiene_cuenta; }).length;

    // Stats
    var gorrasRegistradas = (gorras || []).filter(function(g) { return g.activated; }).length;
    var puntosTotal = (clientes || []).reduce(function(sum, c) { return sum + (c.puntos || 0); }, 0);

    return res.status(200).json({
      success: true,
      gorras: gorrasConCuenta,
      clientes: clientesConGorras,
      puntos: puntos || [],
      canjes: canjes,
      stats: {
        gorras_registradas: gorrasRegistradas,
        clientes: (clientes || []).length,
        puntos_totales: puntosTotal,
        canjes: (canjesRaw || []).length,
        duenos_sin_cuenta: sinCuenta
      }
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
