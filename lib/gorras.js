// Utilidades compartidas de gorras y puntos.

const PUNTOS_POR_GORRA = 100;

// "mrk-2026-00001 " -> "MRK-2026-00001". Devuelve '' si no tiene forma de código.
function normalizarCodigo(code) {
  const c = String(code || '').trim().toUpperCase();
  return /^[A-Z0-9]{2,8}(-[A-Z0-9]{1,16}){1,3}$/.test(c) ? c : '';
}

// "Felix Andrés Morón" -> "Felix M." (no se expone el nombre completo del dueño)
function nombreParcial(n) {
  const p = String(n || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '';
  return p.length > 1 ? p[0] + ' ' + p[p.length - 1].charAt(0).toUpperCase() + '.' : p[0];
}

// Primer nombre sin tildes ni mayúsculas: "Félix Andrés" -> "felix"
function primerNombre(n) {
  return String(n || '').trim().split(/\s+/)[0]
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function conceptoGorra(g) {
  return 'Registro gorra: ' + g.model + ' #' + g.unit_number;
}

// Cuando alguien crea su cuenta DESPUÉS de haber registrado gorras sin cuenta,
// le suma los 100 puntos de cada gorra que no los recibió.
// Para evitar que otra persona reclame esos puntos solo sabiendo la cédula,
// el primer nombre de la cuenta debe coincidir con el nombre con que se registró la gorra.
async function acreditarGorrasPendientes(supabase, user) {
  const { data: gorras } = await supabase
    .from('nfc_codes')
    .select('code, model, unit_number, owner_name')
    .eq('owner_cedula', user.cedula)
    .eq('activated', true);
  if (!gorras || !gorras.length) return { gorras: 0, puntos: 0 };

  const { data: movs } = await supabase
    .from('milionari_puntos')
    .select('concepto')
    .eq('cedula', user.cedula);
  const yaAcreditadas = new Set((movs || []).map(m => m.concepto));

  const nombreCuenta = primerNombre(user.nombre);
  const pendientes = gorras.filter(g =>
    !yaAcreditadas.has(conceptoGorra(g)) && primerNombre(g.owner_name) === nombreCuenta
  );
  if (!pendientes.length) return { gorras: 0, puntos: 0 };

  const puntos = pendientes.length * PUNTOS_POR_GORRA;
  const { error: insErr } = await supabase.from('milionari_puntos').insert(pendientes.map(g => ({
    user_id: user.id,
    cedula: user.cedula,
    concepto: conceptoGorra(g),
    puntos: PUNTOS_POR_GORRA
  })));
  if (insErr) { console.error('Error acreditando puntos pendientes:', insErr); return { gorras: 0, puntos: 0 }; }

  const nuevoTotal = (user.puntos || 0) + puntos;
  await supabase.from('milionari_users').update({ puntos: nuevoTotal }).eq('id', user.id);
  user.puntos = nuevoTotal;
  return { gorras: pendientes.length, puntos };
}

module.exports = { PUNTOS_POR_GORRA, normalizarCodigo, nombreParcial, primerNombre, conceptoGorra, acreditarGorrasPendientes };
