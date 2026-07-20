/**
 * Label Crow API Service
 * Base: https://labelcrow.com/api/v1
 * Auth: Authorization: Bearer <LABELCROW_API_KEY>
 */
const https = require('https');

const LC_HOST = 'labelcrow.com';

const getKey = () => {
  const k = process.env.LABELCROW_API_KEY;
  if (!k) throw new Error('LABELCROW_API_KEY is not set in environment variables');
  return k;
};

// ── JSON request helper ────────────────────────────────────────
function apiRequest(method, urlPath, data = null) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const options = {
      hostname: LC_HOST,
      port:     443,
      path:     urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${getKey()}`,
        'Content-Type':  'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            const msg = json?.error?.message || json?.message
              || `Label Crow API error ${res.statusCode}`;
            reject(new Error(msg));
          }
        } catch {
          reject(new Error(`Invalid JSON from Label Crow: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Binary request helper (ZIP download) ──────────────────────
function apiBinaryRequest(urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: LC_HOST,
      port:     443,
      path:     urlPath,
      method:   'GET',
      headers:  { 'Authorization': `Bearer ${getKey()}` },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => resolve({
        buffer:      Buffer.concat(chunks),
        statusCode:  res.statusCode,
        contentType: res.headers['content-type'] || 'application/zip',
      }));
    });

    req.on('error', reject);
    req.end();
  });
}

// ── Map our flat CSV row to Label Crow bulk label format ───────
function mapRow(row) {
  return {
    fromName:   row.from_name     || '',
    fromStreet: row.from_address1 || '',
    fromCity:   row.from_city     || '',
    fromState:  row.from_state    || '',
    fromZip:    row.from_zip      || '',
    toName:     row.to_name       || '',
    toStreet:   row.to_address1   || '',
    toCity:     row.to_city       || '',
    toState:    row.to_state      || '',
    toZip:      row.to_zip        || '',
    weight:     parseFloat(row.weight) || 0,
    ...(row.from_address2 ? { fromStreet2: row.from_address2 } : {}),
    ...(row.to_address2   ? { toStreet2:   row.to_address2   } : {}),
    ...(row.from_company  ? { fromCompany: row.from_company  } : {}),
    ...(row.to_company    ? { toCompany:   row.to_company    } : {}),
  };
}

/**
 * Submit a bulk label job.
 * Returns { jobId, orderId, totalLabels }
 */
async function submitBulkJob({ seriesId, carrier, serviceClass, providerKey, labels }) {
  const res = await apiRequest('POST', '/api/v1/labels/bulk', {
    carrier,
    service_class: serviceClass,
    provider_key:  providerKey,
    series_id:     seriesId,
    labels:        labels.map(mapRow),
  });
  const d = res.data;
  return { jobId: d.job_id, orderId: d.order_id, totalLabels: d.total_labels };
}

/**
 * Poll a bulk job for status.
 * Returns { jobId, status, total, generated, failed, progress }
 */
async function pollJob(jobId) {
  const res = await apiRequest('GET', `/api/v1/jobs/${jobId}`);
  return res.data;
}

/**
 * Get order details by order ID.
 * Returns { id, status, totalLabels, files: { zip, merged_pdf } }
 */
async function getOrder(orderId) {
  const res = await apiRequest('GET', `/api/v1/orders/${orderId}`);
  const d   = res.data;
  return { id: d.id, status: d.status, totalLabels: d.total_labels, files: d.files || {} };
}

/**
 * Download ZIP for an order (binary).
 * Returns { buffer, statusCode, contentType }
 */
async function downloadOrderZip(orderId) {
  return apiBinaryRequest(`/api/v1/orders/${orderId}/download/zip`);
}

/**
 * Get all label series available on this account.
 * Returns array of { id, series_code, display_name, carrier, service_class, price_brackets }
 */
async function getSeries() {
  const res = await apiRequest('GET', '/api/v1/account/series');
  return res.data || [];
}

/**
 * Get all providers available on this account.
 * Returns array of { carrier, service_classes: [{ service_class, provider_keys: [] }] }
 */
async function getProviders() {
  const res = await apiRequest('GET', '/api/v1/account/providers');
  return res.data || [];
}

/**
 * Create a single label via POST /api/v1/labels (synchronous).
 * Returns { id, tracking, price, pdfUrl }
 */
async function createSingleLabel({ seriesId, carrier, serviceClass, providerKey, weight, from, to, orderNumber }) {
  const payload = {
    carrier,
    service_class: serviceClass,
    provider_key:  providerKey,
    series_id:     seriesId,
    weight,
    from: {
      name:    from.name,
      address: from.address,
      city:    from.city,
      state:   from.state,
      zip:     from.zip,
      ...(from.address2 ? { address2: from.address2 } : {}),
    },
    to: {
      name:    to.name,
      address: to.address,
      city:    to.city,
      state:   to.state,
      zip:     to.zip,
      ...(to.address2 ? { address2: to.address2 } : {}),
    },
    ...(orderNumber ? { order_number: orderNumber } : {}),
  };
  const res = await apiRequest('POST', '/api/v1/labels', payload);
  const d = res.data;
  return {
    id:       d.id,
    tracking: d.tracking,
    price:    d.price,
    pdfUrl:   d.download_url ? `https://${LC_HOST}${d.download_url}` : null,
  };
}

module.exports = { createSingleLabel, submitBulkJob, pollJob, getOrder, downloadOrderZip, getSeries, getProviders };
