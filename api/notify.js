const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, data } = req.body;

  try {
    if (type === 'registro_gorra') {
      // Email al admin
      await resend.emails.send({
        from: 'Milionari Hats <noreply@milionarihats.com>',
        to: 'milionaricultura@gmail.com',
        subject: '🎩 Nueva gorra registrada — ' + data.model + ' #' + data.unit_number,
        html: `
          <div style="background:#000;color:#fff;font-family:Arial,sans-serif;padding:32px;max-width:500px;margin:0 auto;">
            <h2 style="color:#d4af6a;font-weight:300;margin-bottom:24px;">✦ Nueva gorra registrada</h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Modelo</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#fff;font-size:14px;">${data.model}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Unidad</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#fff;font-size:14px;">#${data.unit_number} de ${data.total_units}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Código</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#d4af6a;font-size:14px;">${data.code}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Dueño</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#fff;font-size:14px;">${data.owner_name}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Cédula</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#fff;font-size:14px;">${data.owner_cedula}</td></tr>
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
          subject: '✦ Tu gorra ' + data.model + ' está registrada',
          html: `
            <div style="background:#000;color:#fff;font-family:Arial,sans-serif;padding:32px;max-width:500px;margin:0 auto;">
              <h2 style="color:#d4af6a;font-weight:300;margin-bottom:8px;">Bienvenido a Milionari</h2>
              <p style="color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:24px;">Tu gorra es auténtica</p>
              <p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.7;margin-bottom:24px;">Hola <strong style="color:#fff;">${data.owner_name}</strong>, tu gorra <strong style="color:#d4af6a;">${data.model} #${data.unit_number}</strong> de ${data.total_units} ha sido registrada exitosamente a tu nombre.</p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                <tr><td style="padding:10px 0;border-bottom:1px solid #111;color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Código</td><td style="padding:10px 0;border-bottom:1px solid #111;color:#d4af6a;font-size:14px;font-weight:bold;">${data.code}</td></tr>
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

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Error enviando email:', err);
    return res.status(500).json({ error: 'Error enviando notificación' });
  }
};
