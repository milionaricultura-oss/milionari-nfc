// Panel admin de Milionari.
//
// Entrar:   POST {action:'login', password}            -> {token} (12 h)
// Después:  Authorization: Bearer <token> en cada llamada:
//   {action:'datos'}                                    todo lo que muestra el panel
//   {action:'gorra', code, chip_grabado?, chip_bloqueado?, entregada?}
//   {action:'anular_registro', code}                    devolución / retracto
//   {action:'ajustar_puntos', cedula, puntos, motivo}   suma (+) o resta (-)
//   {action:'canje_estado', id, estado}                 'pendiente' | 'entregado'
//   {action:'borrar_cliente', cedula}                   solicitud de borrado de datos
//   {action:'producto_guardar', id?, nombre, descripcion, puntos_requeridos, stock, activo}
//
// Compatibilidad: si llega {password} sin token, se acepta igual (panel viejo).
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { createAdminToken, verifyAdminToken, tokenFromRequest, ADMIN_HOURS } = require('../lib/session');
const { normalizarCodigo, conceptoGorra } = require('../lib/gorras');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ALERTA_ESCANEOS = 25;

function igual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function claveCorrecta(password) {
  return !!(password && process.env.ADMIN_PASSWORD && igual(password, process.env.ADMIN_PASSWORD));
}
function err(res, code, msg) { return res.status(code).json({ success: false, error: msg }); }

async function datos() {
  const [g, c, p, k, pr] = await Promise.all([
    supabase.from('nfc_codes').select('*').order('model', { ascending: true }).order('unit_number', { ascending: true }),
    supabase.from('milionari_users').select('*').order('created_at', { ascending: false }),
    supabase.from('milionari_puntos').select('*').order('created_at', { ascending: false }),
    supabase.from('milionari_canjes').select('*, milionari_users(nombre, cedula), milionari_productos(nombre)').order('created_at', { ascending: false }),
    supabase.from('milionari_productos').select('*').order('puntos_requeridos', { ascending: true })
  ]);
  const gorras = g.data || [], clientes = c.data || [], puntos = p.data || [], canjesRaw = k.data || [];

  const conCuenta = {};
  clientes.forEach(u => { if (u.cedula) conCuenta[u.cedula] = true; });
  const porCedula = {};
  gorras.forEach(x => { if (x.owner_cedula) porCedula[x.owner_cedula] = (porCedula[x.owner_cedula] || 0) + 1; });

  const gorrasOut = gorras.map(x => Object.assign({}, x, {
    tiene_cuenta: !!(x.owner_cedula && conCuenta[x.owner_cedula]),
    estado: x.activated ? 'registrada' : (x.entregada ? 'entregada' : 'bodega'),
    alerta_escaneos: (x.scan_count || 0) >= ALERTA_ESCANEOS
  }));
  const clientesOut = clientes.map(u => {
    const o = Object.assign({}, u, { gorras_count: porCedula[u.cedula] || 0 });
    delete o.password_hash;
    return o;
  });
  const canjes = canjesRaw.map(x => ({
    id: x.id,
    user_nombre: x.milionari_users ? x.milionari_users.nombre : '—',
    cedula: x.milionari_users ? x.milionari_users.cedula : null,
    producto_nombre: x.milionari_productos ? x.milionari_productos.nombre : '—',
    puntos_usados: x.puntos_usados,
    estado: x.estado,
    created_at: x.created_at
  }));

  // Resumen por modelo (prefijo del código: BCR, MRK…)
  const modelos = {};
  gorrasOut.forEach(x => {
    const pref = String(x.code).split('-')[0];
    const m = modelos[pref] || (modelos[pref] = { prefijo: pref, modelo: x.model, total: 0, registradas: 0, entregadas: 0, grabados: 0, bloqueados: 0, escaneos: 0 });
    m.total++;
    if (x.estado === 'registrada') m.registradas++;
    if (x.estado === 'entregada') m.entregadas++;
    if (x.chip_grabado) m.grabados++;
    if (x.chip_bloqueado) m.bloqueados++;
    m.escaneos += x.scan_count || 0;
  });

  return {
    success: true,
    gorras: gorrasOut,
    clientes: clientesOut,
    puntos,
    canjes,
    productos: pr.data || [],
    modelos: Object.values(modelos),
    columnas_chip: gorras.length ? ('chip_grabado' in gorras[0]) : true,
    stats: {
      gorras_total: gorras.length,
      gorras_registradas: gorrasOut.filter(x => x.estado === 'registrada').length,
      entregadas_sin_registrar: gorrasOut.filter(x => x.estado === 'entregada').length,
      clientes: clientes.length,
      duenos_sin_cuenta: gorrasOut.filter(x => x.estado === 'registrada' && !x.tiene_cuenta).length,
      puntos_totales: clientes.reduce((s, u) => s + (u.puntos || 0), 0),
      canjes: canjes.length,
      canjes_pendientes: canjes.filter(x => x.estado === 'pendiente').length,
      alertas_escaneos: gorrasOut.filter(x => x.alerta_escaneos).length
    }
  };
}

async function moverPuntos(user, delta, concepto) {
  const nuevo = Math.max(0, (user.puntos || 0) + delta);
  const real = nuevo - (user.puntos || 0);
  if (real !== 0) {
    await supabase.from('milionari_puntos').insert({ user_id: user.id, cedula: user.cedula, concepto, puntos: real });
    await supabase.from('milionari_users').update({ puntos: nuevo }).eq('id', user.id);
  }
  return { antes: user.puntos || 0, ahora: nuevo, movidos: real };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = body.action || 'datos';

  // ── Entrar ──
  if (action === 'login') {
    if (!claveCorrecta(body.password)) {
      await new Promise(r => setTimeout(r, 800)); // frena a quien prueba claves
      return err(res, 401, 'Contraseña incorrecta');
    }
    return res.status(200).json({ success: true, token: createAdminToken(), horas: ADMIN_HOURS });
  }

  const autorizado = verifyAdminToken(tokenFromRequest(req)) || claveCorrecta(body.password);
  if (!autorizado) return res.status(401).json({ success: false, error: 'Tu sesión venció. Entra de nuevo.', session_expired: true });

  try {
    if (action === 'datos' || action === 'stats') {
      return res.status(200).json(await datos());
    }

    if (action === 'gorra') {
      const code = normalizarCodigo(body.code);
      if (!code) return err(res, 400, 'Código inválido');
      const cambios = {};
      ['chip_grabado', 'chip_bloqueado', 'entregada'].forEach(k => { if (typeof body[k] === 'boolean') cambios[k] = body[k]; });
      if (!Object.keys(cambios).length) return err(res, 400, 'Nada que cambiar');
      const { data, error } = await supabase.from('nfc_codes').update(cambios).eq('code', code).select('code');
      if (error) return err(res, 500, /column/.test(error.message || '') ? 'Falta crear las columnas nuevas en Supabase (paso SQL).' : 'No se pudo guardar');
      if (!data || !data.length) return err(res, 404, 'Gorra no encontrada');
      return res.status(200).json({ success: true });
    }

    if (action === 'anular_registro') {
      const code = normalizarCodigo(body.code);
      const { data: g } = await supabase.from('nfc_codes').select('*').eq('code', code).maybeSingle();
      if (!g) return err(res, 404, 'Gorra no encontrada');
      if (!g.activated) return err(res, 400, 'Esa gorra no está registrada');

      let puntos = null;
      if (g.owner_cedula) {
        const { data: u } = await supabase.from('milionari_users').select('*').eq('cedula', g.owner_cedula).maybeSingle();
        const { data: mov } = await supabase.from('milionari_puntos').select('id').eq('cedula', g.owner_cedula).eq('concepto', conceptoGorra(g)).limit(1);
        if (u && mov && mov.length) puntos = await moverPuntos(u, -100, 'Anulado: ' + conceptoGorra(g));
      }
      const limpia = { activated: false, activated_at: null, owner_name: null, owner_cedula: null };
      let up = await supabase.from('nfc_codes').update(Object.assign({ datos_autorizados_at: null }, limpia)).eq('code', code);
      if (up.error) up = await supabase.from('nfc_codes').update(limpia).eq('code', code);
      if (up.error) return err(res, 500, 'No se pudo anular');
      return res.status(200).json({ success: true, puntos });
    }

    if (action === 'ajustar_puntos') {
      const delta = parseInt(body.puntos, 10);
      const motivo = String(body.motivo || '').trim().slice(0, 80);
      if (!delta || Math.abs(delta) > 100000) return err(res, 400, 'Escribe una cantidad de puntos válida');
      if (!motivo) return err(res, 400, 'Escribe el motivo');
      const { data: u } = await supabase.from('milionari_users').select('*').eq('cedula', String(body.cedula || '')).maybeSingle();
      if (!u) return err(res, 404, 'Cliente no encontrado');
      const r = await moverPuntos(u, delta, 'Ajuste: ' + motivo);
      return res.status(200).json({ success: true, puntos: r });
    }

    if (action === 'canje_estado') {
      const estado = body.estado === 'entregado' ? 'entregado' : 'pendiente';
      const { data, error } = await supabase.from('milionari_canjes').update({ estado }).eq('id', body.id).select('id');
      if (error || !data || !data.length) return err(res, 400, 'No se pudo actualizar el canje');
      return res.status(200).json({ success: true });
    }

    if (action === 'borrar_cliente') {
      const cedula = String(body.cedula || '');
      const { data: u } = await supabase.from('milionari_users').select('id').eq('cedula', cedula).maybeSingle();
      if (!u) return err(res, 404, 'Cliente no encontrado');
      await supabase.from('milionari_canjes').delete().eq('user_id', u.id);
      await supabase.from('milionari_puntos').delete().eq('cedula', cedula);
      const del = await supabase.from('milionari_users').delete().eq('id', u.id);
      if (del.error) return err(res, 500, 'No se pudo borrar el cliente');
      // Las gorras siguen registradas como auténticas, pero sin datos personales.
      await supabase.from('nfc_codes').update({ owner_name: 'Registro anónimo', owner_cedula: null }).eq('owner_cedula', cedula);
      return res.status(200).json({ success: true });
    }

    if (action === 'producto_guardar') {
      const nombre = String(body.nombre || '').trim().slice(0, 80);
      const pts = parseInt(body.puntos_requeridos, 10);
      const stock = parseInt(body.stock, 10);
      if (!nombre) return err(res, 400, 'Escribe el nombre del producto');
      if (!(pts > 0)) return err(res, 400, 'Los puntos deben ser mayores que 0');
      if (!(stock >= 0)) return err(res, 400, 'Escribe las unidades disponibles');
      const fila = { nombre, descripcion: String(body.descripcion || '').slice(0, 240), puntos_requeridos: pts, stock, activo: body.activo !== false };
      const q = body.id
        ? supabase.from('milionari_productos').update(fila).eq('id', body.id).select().single()
        : supabase.from('milionari_productos').insert(fila).select().single();
      const { data, error } = await q;
      if (error) return err(res, 500, 'No se pudo guardar el producto');
      return res.status(200).json({ success: true, producto: data });
    }

    return err(res, 400, 'Acción no válida');
  } catch (e) {
    console.error('Error admin:', e);
    return err(res, 500, 'Error interno del servidor');
  }
};
