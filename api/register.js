// Registro de una gorra a nombre de su dueño (lo llama la página de verificación).
//
// Orden seguro: primero se revisa todo (autorización de datos, correo libre, contraseña)
// y solo después se marca la gorra como registrada, para que nunca quede a medias.
const { createClient } = require('@supabase/supabase-js');
const { hashPassword, createToken } = require('../lib/session');
const { sendRegistroGorra } = require('../lib/mail');
const { PUNTOS_POR_GORRA, normalizarCodigo, nombreParcial, conceptoGorra, acreditarGorrasPendientes } = require('../lib/gorras');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CORREO_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, owner_name, owner_cedula, owner_email, owner_password, acepta_datos } = req.body || {};
  const codigo = normalizarCodigo(code);
  const nombre = String(owner_name || '').trim().slice(0, 120);
  const cedula = String(owner_cedula || '').replace(/[\s.]/g, '').slice(0, 20);
  const correo = String(owner_email || '').trim().toLowerCase();
  const password = owner_password ? String(owner_password) : '';

  if (!codigo || !nombre || !cedula) {
    return res.status(400).json({ success: false, error: 'Código, nombre y cédula son requeridos.' });
  }
  if (!/^\d{5,15}$/.test(cedula)) {
    return res.status(400).json({ success: false, error: 'Escribe tu cédula solo con números.' });
  }
  if (acepta_datos !== true) {
    return res.status(400).json({ success: false, error: 'Debes autorizar el tratamiento de tus datos para registrar la gorra.' });
  }

  try {
    const { data: gorra, error } = await supabase
      .from('nfc_codes')
      .select('*')
      .eq('code', codigo)
      .maybeSingle();

    if (error) throw error;
    if (!gorra) return res.status(404).json({ success: false, error: 'Código no encontrado.' });

    if (gorra.activated) {
      return res.status(200).json({
        success: false,
        already_registered: true,
        message: 'Esta gorra ya fue registrada.',
        owner_name: nombreParcial(gorra.owner_name),
        activated_at: gorra.activated_at
      });
    }

    // ── 1) Revisar la cuenta ANTES de tocar la gorra ──
    let { data: user } = await supabase.from('milionari_users').select('*').eq('cedula', cedula).maybeSingle();
    const crearCuenta = !user && correo && password;

    if (crearCuenta) {
      if (!CORREO_OK.test(correo)) {
        return res.status(400).json({ success: false, error: 'Revisa tu correo, parece que tiene un error.' });
      }
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
      }
      const { data: correoUsado } = await supabase.from('milionari_users').select('id').eq('correo', correo).maybeSingle();
      if (correoUsado) {
        return res.status(400).json({
          success: false,
          error: 'Ese correo ya tiene una cuenta Milionari con otra cédula. Usa otro correo.'
        });
      }
    }

    // ── 2) Marcar la gorra como registrada (solo si sigue libre) ──
    const now = new Date().toISOString();
    const cambios = { activated: true, activated_at: now, owner_name: nombre, owner_cedula: cedula };
    let upd = await supabase.from('nfc_codes')
      .update(Object.assign({ datos_autorizados_at: now }, cambios))
      .eq('code', codigo).eq('activated', false).select('code');
    // Si la columna datos_autorizados_at todavía no existe en la base, registra sin ella.
    if (upd.error && /datos_autorizados_at/.test(upd.error.message || '')) {
      upd = await supabase.from('nfc_codes').update(cambios)
        .eq('code', codigo).eq('activated', false).select('code');
    }
    if (upd.error) throw upd.error;
    if (!upd.data || !upd.data.length) {
      // Otra persona la registró en este mismo instante.
      return res.status(200).json({ success: false, already_registered: true, message: 'Esta gorra ya fue registrada.' });
    }

    // ── 3) Crear la cuenta si hace falta ──
    let cuentaCreada = false;
    let avisoCuenta = '';
    if (crearCuenta) {
      const { data: nuevo, error: createError } = await supabase
        .from('milionari_users')
        .insert({ nombre, cedula, correo, password_hash: hashPassword(password), puntos: 0 })
        .select()
        .single();
      if (createError) {
        console.error('Error creando usuario:', createError);
        avisoCuenta = 'Tu gorra quedó registrada, pero no pudimos crear tu cuenta. Créala en Mi Cuenta con esta misma cédula y recibirás tus puntos.';
      } else {
        user = nuevo;
        cuentaCreada = true;
      }
    }

    // ── 4) Puntos ──
    let puntosGanados = 0;
    if (user) {
      if (cuentaCreada) {
        // Cuenta nueva: suma esta gorra y cualquier otra que tuviera registrada sin cuenta.
        puntosGanados = (await acreditarGorrasPendientes(supabase, user)).puntos;
      } else {
        await supabase.from('milionari_puntos').insert({
          user_id: user.id, cedula, concepto: conceptoGorra(gorra), puntos: PUNTOS_POR_GORRA
        });
        await supabase.from('milionari_users').update({ puntos: (user.puntos || 0) + PUNTOS_POR_GORRA }).eq('id', user.id);
        user.puntos = (user.puntos || 0) + PUNTOS_POR_GORRA;
        puntosGanados = PUNTOS_POR_GORRA;
      }
    }

    // ── 5) Aviso por correo (no crítico) ──
    try {
      await sendRegistroGorra({
        code: codigo,
        model: gorra.model,
        unit_number: gorra.unit_number,
        total_units: gorra.total_units,
        owner_name: nombre,
        owner_cedula: cedula,
        owner_email: user ? user.correo : (correo || null)
      });
    } catch (emailErr) {
      console.log('Email error (no crítico):', emailErr);
    }

    const resp = {
      success: true,
      message: '¡Gorra registrada exitosamente!',
      model: gorra.model,
      unit_number: gorra.unit_number,
      total_units: gorra.total_units,
      owner_name: nombreParcial(nombre),
      activated_at: now,
      puntos_ganados: puntosGanados,
      tiene_cuenta: !!user,
      cuenta_creada: cuentaCreada
    };
    if (avisoCuenta) resp.aviso = avisoCuenta;
    // Solo quien acaba de crear su contraseña recibe la sesión (entra directo a Mi Cuenta).
    if (cuentaCreada) {
      resp.token = createToken(user);
      resp.user = { id: user.id, nombre: user.nombre, correo: user.correo, cedula: user.cedula, puntos: user.puntos };
    }
    return res.status(200).json(resp);
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor. Intenta de nuevo.' });
  }
};
