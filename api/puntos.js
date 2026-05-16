const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, cedula, producto_id } = req.method === 'GET' ? req.query : req.body;

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

    return res.status(200).json({
      success: true,
      user: { nombre: user.nombre, correo: user.correo, cedula: user.cedula, puntos: user.puntos },
      historial: historial || [],
      productos: productos || []
    });
  }

  // CANJEAR PUNTOS
  if (action === 'canjear') {
    if (!cedula || !producto_id) {
      return res.status(400).json({ error: 'Cédula y producto requeridos' });
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
        estado: 'completado'
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
