const nodemailer = require('nodemailer');

// Lazy — transporter is created on first use, not at require() time
let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host:   process.env.EMAIL_HOST  || 'smtp.gmail.com',
      port:   parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return _transporter;
}

const sendEmail = async ({ to, subject, html }) => {
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Label Flow" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`📧 Email → ${to} | ${subject}`);
    return true;
  } catch (err) {
    console.error('📧 Email error:', err.message);
    return false;
  }
};

// ── Resend (HTTP API) ────────────────────────────────────────────────────────
// Used for manifest upload notifications. Requires RESEND_API_KEY in .env.
// RESEND_FROM defaults to Resend's shared test domain, which needs no
// verification but is best swapped for a verified domain in production.
const MANIFEST_ADMIN_ALERT_EMAILS = ['m.subhan6612@gmail.com', 'abdurrehman7321@gmail.com'];

const sendResendEmail = async ({ to, subject, html }) => {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    process.env.RESEND_FROM || 'onboarding@resend.dev',
        to:      Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error('📧 Resend error:', res.status, await res.text());
      return false;
    }
    console.log(`📧 Resend → ${Array.isArray(to) ? to.join(', ') : to} | ${subject}`);
    return true;
  } catch (err) {
    console.error('📧 Resend error:', err.message);
    return false;
  }
};

// ── Templates ──────────────────────────────────────────────────────────────

const manifestJobSubmitted = (userName, userEmail, jobId, carrier, labelCount) => ({
  subject: `New Manifest Upload — ${carrier} (${labelCount} labels)`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px;">
      <h2 style="color:#0f172a;margin-bottom:8px;">New Manifest File Uploaded</h2>
      <p style="color:#475569;"><strong>${userName}</strong> (${userEmail}) just submitted a manifest label request.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fff;border-radius:6px;overflow:hidden;">
        <tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-weight:600;color:#334155;width:40%;">Carrier</td><td style="padding:10px 16px;color:#0f172a;">${carrier}</td></tr>
        <tr><td style="padding:10px 16px;font-weight:600;color:#334155;">Labels</td><td style="padding:10px 16px;color:#0f172a;">${labelCount}</td></tr>
        <tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-weight:600;color:#334155;">Job ID</td><td style="padding:10px 16px;color:#0f172a;font-family:monospace;">${jobId}</td></tr>
      </table>
      <p style="color:#475569;">Go to Manifest Operations to download the request file and upload the finished labels.</p>
      <p style="margin-top:24px;color:#94a3b8;font-size:12px;">This is an automated notification.</p>
    </div>
  `,
});

const userLabelsReady = (userName, jobId, carrier, labelCount, downloadUrl) => ({
  subject: `Your ${carrier} Labels Are Ready — Download Now`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px;">
      <h2 style="color:#059669;margin-bottom:8px;">Your Labels Are Ready!</h2>
      <p style="color:#475569;">Hello ${userName},</p>
      <p style="color:#475569;">Your label generation request has been completed and approved:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fff;border-radius:6px;overflow:hidden;">
        <tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-weight:600;color:#334155;width:40%;">Carrier</td><td style="padding:10px 16px;color:#0f172a;">${carrier}</td></tr>
        <tr><td style="padding:10px 16px;font-weight:600;color:#334155;">Labels</td><td style="padding:10px 16px;color:#0f172a;">${labelCount}</td></tr>
        <tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-weight:600;color:#334155;">Job ID</td><td style="padding:10px 16px;color:#0f172a;font-family:monospace;">${jobId}</td></tr>
      </table>
      <p style="color:#475569;">Please download your labels and ship within the required timeframe.</p>
      <a href="${downloadUrl}" style="display:inline-block;background:#059669;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px;">Download Labels →</a>
      <p style="margin-top:24px;color:#94a3b8;font-size:12px;">Label Flow</p>
    </div>
  `,
});

const CATEGORY_LABEL = { general: 'General', service: 'Service Update', pricing: 'Pricing', maintenance: 'Maintenance' };
const CATEGORY_COLOR = { general: '#2563EB', service: '#16A34A', pricing: '#D97706', maintenance: '#DC2626' };

const announcementNotification = (userName, title, content, category, portalUrl) => {
  const catLabel = CATEGORY_LABEL[category] || 'General';
  const catColor = CATEGORY_COLOR[category] || '#2563EB';
  return {
    subject: `[Label Flow] ${catLabel}: ${title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:8px;">
        <div style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="height:4px;background:${catColor};"></div>
          <div style="padding:24px;">
            <div style="display:inline-block;padding:3px 12px;border-radius:99px;background:${catColor}18;color:${catColor};font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;border:1px solid ${catColor}33;margin-bottom:14px;">
              ${catLabel}
            </div>
            <h2 style="color:#0f172a;margin:0 0 12px;font-size:20px;line-height:1.3;">${title}</h2>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">${content}</p>
            <a href="${portalUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:11px 24px;border-radius:7px;text-decoration:none;font-weight:600;font-size:14px;">View Announcement →</a>
          </div>
        </div>
        <p style="margin-top:16px;color:#94a3b8;font-size:11px;text-align:center;">
          Hello ${userName} — you're receiving this because you have announcement emails enabled.<br/>
          You can turn this off in your <a href="${portalUrl}/profile" style="color:#64748b;">profile settings</a>.
        </p>
      </div>
    `,
  };
};

module.exports = {
  sendEmail, userLabelsReady, announcementNotification,
  sendResendEmail, manifestJobSubmitted, MANIFEST_ADMIN_ALERT_EMAILS,
};
