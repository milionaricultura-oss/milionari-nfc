// Envío de correos de Milionari (uso interno: lo llaman register.js y api/notify.js).
// Todo dato que viene del cliente se escapa antes de ponerlo en el HTML del correo.
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// Para asuntos de correo: texto plano, sin saltos de línea.
function clean(v) {
  return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').slice(0, 120);
}

async function sendRegistroGorra(data) {
  // Email al admin
  await resend.emails.send({
    from: 'Milionari Hats <noreply@milionarihats.com>',
    to: 'milionaricultura@gmail.com',
    subject: '🎩 Nueva gorra registrada — ' + clean(data.model) + ' #' + clean(data.unit_number),
    html: `
      <div style="background:#000;color:#fff;font-family:Arial,sans-serif;padding:32px;max-width:500px;margin:0 auto;">
        <h2 style="color:#d4af6a;font-weight:300;margin-bottom:24px;">✦ Nueva gorra registrada</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Modelo</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#fff;font-size:14px;">${esc(data.model)}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Unidad</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#fff;font-size:14px;">#${esc(data.unit_number)} de ${esc(data.total_units)}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Código</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#d4af6a;font-size:14px;">${esc(data.code)}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Dueño</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#fff;font-size:14px;">${esc(data.owner_name)}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Cédula</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#fff;font-size:14px;">${esc(data.owner_cedula)}</td></tr>
          <tr><td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Fecha</td><td style="padding:10px 0;color:#fff;font-size:14px;">${new Date().toLocaleDateString('es-CO')}</td></tr>
        </table>
        <p style="margin-top:24px;font-size:10px;color:rgba(255,255,255,0.2);letter-spacing:2px;text-transform:uppercase;">© 2026 Milionari Hats · milionarihats.com</p>
      </div>
    `
  });

  // Email al cliente si tiene correo
  if (data.owner_email) {
    await resend.emails.send({
      from: 'Milionari Hats <noreply@milionarihats.com>',
      to: data.owner_email,
      subject: '✦ Tu gorra ' + clean(data.model) + ' está registrada',
      html: `
        <div style="background:#000;color:#fff;font-family:Arial,sans-serif;padding:32px;max-width:500px;margin:0 auto;">
          <h2 style="color:#d4af6a;font-weight:300;margin-bottom:8px;">Bienvenido a Milionari</h2>
          <p style="color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:24px;">Tu gorra es auténtica</p>
          <p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.7;margin-bottom:24px;">Hola <strong style="color:#fff;">${esc(data.owner_name)}</strong>, tu gorra <strong style="color:#d4af6a;">${esc(data.model)} #${esc(data.unit_number)}</strong> de ${esc(data.total_units)} ha sido registrada exitosamente a tu nombre.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Código</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#d4af6a;font-size:14px;font-weight:bold;">${esc(data.code)}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Puntos ganados</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#a8ffc8;font-size:14px;">+100 puntos Milionari</td></tr>
            <tr><td style="padding:10px 0;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Fecha</td><td style="padding:10px 0;color:#fff;font-size:14px;">${new Date().toLocaleDateString('es-CO')}</td></tr>
          </table>
          <a href="https://milionarihats.com/pages/mi-cuenta-milionari" style="display:block;background:#d4af6a;color:#000;text-align:center;padding:14px;text-decoration:none;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;border-radius:2px;">Ver mis puntos</a>
          <p style="margin-top:24px;font-size:10px;color:rgba(255,255,255,0.2);letter-spacing:2px;text-transform:uppercase;">© 2026 Milionari Hats · milionarihats.com</p>
        </div>
      `
    });
  }
}

async function sendRecuperarContrasena(to, nombre, link) {
  await resend.emails.send({
    from: 'Milionari Hats <noreply@milionarihats.com>',
    to,
    subject: 'Recupera tu contraseña · Milionari',
    html: `
      <div style="background:#000;color:#fff;font-family:Arial,sans-serif;padding:32px;max-width:500px;margin:0 auto;">
        <h2 style="color:#d4af6a;font-weight:300;margin-bottom:8px;">Recupera tu contraseña</h2>
        <p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.7;margin-bottom:24px;">Hola <strong style="color:#fff;">${esc(nombre)}</strong>, recibimos una solicitud para cambiar la contraseña de tu cuenta Milionari. Toca el botón para crear una nueva. El enlace vence en 1 hora y solo funciona una vez.</p>
        <a href="${esc(link)}" style="display:block;background:#d4af6a;color:#000;text-align:center;padding:14px;text-decoration:none;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;border-radius:2px;">Crear nueva contraseña</a>
        <p style="color:rgba(255,255,255,0.4);font-size:12px;line-height:1.6;margin-top:24px;">Si no pediste este cambio, ignora este correo: tu contraseña sigue igual.</p>
        <p style="margin-top:24px;font-size:10px;color:rgba(255,255,255,0.2);letter-spacing:2px;text-transform:uppercase;">© 2026 Milionari Hats · milionarihats.com</p>
      </div>
    `
  });
}

module.exports = { sendRegistroGorra, sendRecuperarContrasena, esc };
