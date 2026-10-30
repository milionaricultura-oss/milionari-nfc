// Envío de notificaciones por correo.
// Ya NO es público: solo responde si llega la clave interna NOTIFY_SECRET en el encabezado
// x-notify-secret. El registro de gorras ya no pasa por aquí: llama directo a lib/mail.js.
const crypto = require('crypto');
const { sendRegistroGorra } = require('../lib/mail');

function sameSecret(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.NOTIFY_SECRET;
  if (!secret || !sameSecret(req.headers['x-notify-secret'], secret)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { type, data } = req.body || {};
  try {
    if (type === 'registro_gorra' && data) {
      await sendRegistroGorra(data);
      return res.status(200).json({ success: true });
    }
    return res.status(400).json({ error: 'Tipo no válido' });
  } catch (err) {
    console.error('Error enviando email:', err);
    return res.status(500).json({ error: 'Error enviando notificación' });
  }
};
