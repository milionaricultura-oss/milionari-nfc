const { createClient } = require('@supabase/supabase-js');
const { verifyToken, tokenFromRequest } = require('../lib/session');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, producto_id } = (req.method === 'GET' ? req.query : req.body) || {};

  // Sesión obligatoria: la cédula sale del token firmado, nunca de lo que mande el navegador.
  const session = verifyToken(tokenFromRequest(req));
  if (!session) {
    return res.status(401).json({ success: false, error: 'Tu sesión venció. Inicia sesión de nuevo.', session_expired: true });
  }
  const cedula = session.ced;

  // VER PUNTOS Y PERFIL
  if (action === 'perfil') {
    const { data: user, error } = await supabase
      .from('milionari_users')
      .select('*')
      .eq('cedula', cedula)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const { data: historial } = await supabase
      .from('milionari_puntos')
      .select('*')
      .eq('cedula', cedula)
      .order('created_at', { ascending: false });

    const { data: productos } = await supabase
      .from('milionari_productos')
      .select('*')
      .eq('activo', true)
      .order('puntos_requeridos', { ascending: true });

    // Sus gorras registradas y sus canjes (para "Mis gorras" y el estado de cada canje)
    const { data: gorras } = await supabase
      .from('nfc_codes')
      .select('code, model, unit_number, total_units, activated_at, scan_count, page_url')
      .eq('owner_cedula', cedula)
      .eq('activated', true)
      .order('activated_at', { ascending: true });

    const { data: canjesRaw } = await supabase
      .from('milionari_canjes')
      .select('id, estado, puntos_usados, created_at, milionari_productos(nombre)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    return res.status(200).json({
      success: true,
      user: { nombre: user.nombre, correo: user.correo, cedula: user.cedula, puntos: user.puntos },
      historial: historial || [],
      productos: productos || [],
      gorras: gorras || [],
      canjes: (canjesRaw || []).map(c => ({
        id: c.id,
        estado: c.estado === 'entregado' ? 'entregado' : 'pendiente',
        puntos_usados: c.puntos_usados,
        created_at: c.created_at,
        producto: c.milionari_productos ? c.milionari_productos.nombre : '—'
      }))
    });
  }

  // CANJEAR PUNTOS
  if (action === 'canjear') {
    if (!producto_id) {
      return res.status(400).json({ error: 'Producto requerido' });
    }

    const { data: user } = await supabase
      .from('milionari_users')
      .select('*')
      .eq('cedula', cedula)
      .single();

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { data: producto } = await supabase
      .from('milionari_productos')
      .select('*')
      .eq('id', producto_id)
      .single();

    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
    if (!producto.activo) return res.status(400).json({ error: 'Producto no disponible' });
    if (producto.stock <= 0) return res.status(400).json({ error: 'Producto sin stock' });
    if (user.puntos < producto.puntos_requeridos) {
      return res.status(400).json({ error: 'Puntos insuficientes', puntos_actuales: user.puntos, puntos_requeridos: producto.puntos_requeridos });
    }

    // Descontar puntos
    await supabase
      .from('milionari_users')
      .update({ puntos: user.puntos - producto.puntos_requeridos })
      .eq('cedula', cedula);

    // Reducir stock
    await supabase
      .from('milionari_productos')
      .update({ stock: producto.stock - 1 })
      .eq('id', producto_id);

    // Registrar canje
    await supabase
      .from('milionari_canjes')
      .insert({
        user_id: user.id,
        producto_id: producto.id,
        puntos_usados: producto.puntos_requeridos,
        estado: 'pendiente' // el admin lo marca 'entregado' desde el panel
      });

    // Registrar en historial
    await supabase
      .from('milionari_puntos')
      .insert({
        user_id: user.id,
        cedula: cedula,
        concepto: 'Canje: ' + producto.nombre,
        puntos: -producto.puntos_requeridos
      });

    return res.status(200).json({
      success: true,
      message: '¡Canje exitoso! ' + producto.nombre,
      puntos_restantes: user.puntos - producto.puntos_requeridos
    });
  }

  return res.status(400).json({ error: 'Acción no válida' });
};
