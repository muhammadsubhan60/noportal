/**
 * ShipLabel.net API Service
 * Base: https://shiplabel.net/api/v2
 * Auth: Authorization: Bearer <api key>
 * Key is read from the active ApiCredential in the DB (Settings page),
 * falling back to the SHIPLABEL_API_KEY env var.
 */
const https = require('https');

const SL_HOST = 'shiplabel.net';

async function getKey() {
  try {
    const ApiCredential = require('../models/ApiCredential');
    const cred = await ApiCredential.findOne({ provider: 'shiplabel' });
    if (cred) return cred.getApiKey();
  } catch (_) {
    // DB not ready yet or model not found — fall through to env var
  }

  const k = process.env.SHIPLABEL_API_KEY;
  if (!k) throw new Error('No ShipLabel API key configured. Add one in Settings or set SHIPLABEL_API_KEY in .env');
  return k;
}

// ── JSON request helper ────────────────────────────────────────
async function apiRequest(method, urlPath, data = null) {
  const key = await getKey();
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const options = {
      hostname: SL_HOST,
      port:     443,
      path:     urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.success === false) {
            const msg = json.message || json.error || `ShipLabel API error ${res.statusCode}`;
            return reject(new Error(msg));
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`ShipLabel API error ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
        } catch {
          reject(new Error(`Invalid JSON from ShipLabel: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Infer label_series from service name ───────────────────────
function parseSeriesFromName(name) {
  const m = name.match(/\((\d+)\)/);
  return m ? m[1] : '';
}

// ── Infer label_format from service name ───────────────────────
function inferFormatFromName(name) {
  const n = name.toLowerCase();
  if (n.includes('priority pro'))                          return 'usps_priority_pro';
  if (n.includes('priority mail') && n.includes('private')) return 'usps_priority_private';
  if (n.includes('priority mail') && n.includes('pitney')) return 'usps_priority_pitneyBow';
  if (n.includes('priority mail') && n.includes('epostage')) return 'usps_priority_mail_epostage';
  if (n.includes('priority mail') && n.includes('easypost')) return 'usps_priority_mail_commercial_easypost';
  if (n.includes('priority mail'))                         return 'usps_priority_mail';
  if (n.includes('ground advantage stamps'))               return 'usps_ground_advantage';
  if (n.includes('ground advantage'))                      return 'usps_ground_advantage';
  if (n.includes('ground pro'))                            return 'usps_ground_pro';
  if (n.includes('ground api'))                            return 'usps_ground_api';
  if (n.includes('ground'))                                return 'usps_ground_api';
  if (n.includes('click-n-ship') || n.includes('click n ship')) return 'click_n_ship';
  return '';
}

/**
 * Get all available services on this account.
 * Returns array of { id, name, max_weight, price_ranges, inferredSeries, inferredFormat }
 */
async function getServices() {
  const res = await apiRequest('POST', '/api/v2/services', {});
  // Response shape: { success: { labels: [...] } }
  const raw = (res.success && res.success.labels) || res.data || [];
  // The "Custom Label (Series & Format)" service is included: it has no fixed
  // series/format, so the admin configures the selectable combos on the vendor
  // via its shiplabelSeries[] list (Admin → Vendors → ShipLabel → Edit).
  return raw.map(s => ({
    ...s,
    inferredSeries: parseSeriesFromName(s.name),
    inferredFormat: inferFormatFromName(s.name),
  }));
}

/**
 * Create a single shipping label.
 * payload: { label_id, fromName, fromAddress, fromZip, fromState, fromCity, fromCountry,
 *            toName, toAddress, toZip, toState, toCity, toCountry, weight, length, height, width,
 *            label_series?, label_format? }
 * Returns: { label_created, tracking_id, pdf, price, ... }
 */
async function createOrder(payload) {
  const res = await apiRequest('POST', '/api/v2/create-order', payload);
  return res.data;
}

module.exports = { getServices, createOrder, parseSeriesFromName, inferFormatFromName };
