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

    var clientesConGorras = (clientes || []).map(function(c) {
      return Object.assign({}, c, { gorras_count: gorrasCount[c.cedula] || 0 });
    });

    // Stats
    var gorrasRegistradas = (gorras || []).filter(function(g) { return g.activated; }).length;
    var puntosTotal = (clientes || []).reduce(function(sum, c) { return sum + (c.puntos || 0); }, 0);

    return res.status(200).json({
      success: true,
      gorras: gorras || [],
      clientes: clientesConGorras,
      puntos: puntos || [],
      canjes: canjes,
      stats: {
        gorras_registradas: gorrasRegistradas,
        clientes: (clientes || []).length,
        puntos_totales: puntosTotal,
        canjes: (canjesRaw || []).length
      }
    });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
