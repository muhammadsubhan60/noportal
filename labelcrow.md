
Skip to content
LC
LabelCrow

Dashboard
Create Label
Upload Bulk
Store Orders
Connected Stores
Order History
Recent Labels
API Docs
alisha@gmail.com
Logout
Home
/
API Documentation
API Documentation
Integrate LabelCrow label generation into your system

☀️
Light Mode

v1
Base URL: /api/v1
 CONTENTS
Getting Started
Generate API Key
Authentication
Rate Limiting
Billing & Credits
Error Format
API Keys
Account
Labels
Orders
Jobs
Webhooks
Getting Started
The LabelCrow API lets you generate USPS shipping labels programmatically. Follow these steps:

Generate an API Key — Use the form below to create your first key
Check your balance — GET /api/v1/account/balance
View available series — GET /api/v1/account/series to see which label types and pricing you have access to
View available providers — GET /api/v1/account/providers to see which provider keys are enabled on your account
Generate a label — POST /api/v1/labels with carrier, service_class, provider_key, series_id, addresses, and weight
Download — Use the download_url from the response
 Important: The provider_key field is required when creating labels. It determines which label template is used. Use GET /api/v1/account/providers to see the providers available on your account.
 All requests require an API key. Every label generated deducts credits from your account balance.
Generate API Key
Create a new API key to authenticate your API requests. The key is shown only once — copy and store it securely.

 You already have an active API key. To generate a new one, revoke your current key below first.
YOUR API KEYS Refresh
Key	Name	Last Used	Created
lc_live_1bf743ad...	Centralized	8/5/2026	6/10/2026	 Revoke
Authentication
Include your API key in every request using one of these methods:

# Method 1: Authorization header (recommended) curl -H "Authorization: Bearer lc_live_your_key_here" \ https://labelcrow.com/api/v1/account/balance # Method 2: X-API-Key header curl -H "X-API-Key: lc_live_your_key_here" \ https://labelcrow.com/api/v1/account/balance

 API keys start with lc_live_. Store them securely — they grant full access to your account. The raw key is only shown once at creation time.
 Each API key has full access to all endpoints. You can have one active key at a time.
Rate Limiting
Default: 60 requests per minute per API key (configurable per key up to 1,000).

Rate limit info is returned in response headers:

Header	Description
X-RateLimit-Limit	Max requests per minute for this key
X-RateLimit-Remaining	Requests remaining in current window
X-RateLimit-Reset	Unix timestamp when the window resets
 When rate limited, the API returns 429 Too Many Requests. Wait until the reset time before retrying.
Billing & Credits
Every label generated deducts credits from your account. Pricing is determined by weight-based price brackets configured for each label series.

How Pricing Works

Check your available series and pricing: GET /api/v1/account/series
Each series has price brackets based on weight range (e.g., 1-15 lbs = $0.88, 16-70 lbs = $1.25)
When you create a label, the weight field determines which bracket applies
The price field in the response shows exactly how much was charged
 Balance checks: Before any label is generated, the system verifies you have sufficient credits. If your balance is too low, you'll receive an INSUFFICIENT_CREDITS error (HTTP 402).
Checking Your Balance

curl -H "Authorization: Bearer lc_live_..." \ /api/v1/account/balance # Response: { "data": { "balance": 150.00, "effective_credits": 150.00, "currency": "USD" } }
Refunds

In bulk operations, if a label fails during PDF generation after credits were charged, the credits are automatically refunded to your account. The refund appears as an add transaction in your credit history.

 Users with no price brackets configured can only generate labels for default series (9401, 92019) at $2.00 per label. Contact your dealer to set up custom pricing for additional series.
Error Format
All errors follow a consistent JSON format:

{ "error": { "code": "INSUFFICIENT_CREDITS", "message": "Balance is insufficient.", "status": 402 } }
Common Error Codes

Code	Status	Description
MISSING_API_KEY	401	No API key provided
INVALID_API_KEY	401	Key not found or malformed
API_KEY_REVOKED	401	Key has been revoked
API_KEY_EXPIRED	401	Key has expired
SCOPE_DENIED	403	Key doesn't have required scope
RATE_LIMIT_EXCEEDED	429	Too many requests
INSUFFICIENT_CREDITS	402	Not enough balance for operation
DEALER_INSUFFICIENT_CREDITS	402	Your dealer or reseller has insufficient balance — ask them to recharge
SERIES_NOT_ALLOWED	403	User not permitted for requested series
SERIES_REQUIRED	400	series_id is required. Use GET /api/v1/account/series to see available series
SERIES_INACTIVE	400	Selected series is not currently active
SERIES_PRICE_ZERO_NOT_ALLOWED	400	Series price bracket is $0 — generation not allowed
ACCOUNT_DISABLED	403	Account has been disabled by admin or dealer
TEMPLATE_NOT_FOUND	400	No template found for the carrier + service_class + provider_key combination. Check GET /api/v1/account/providers for valid providers
MISSING_WEIGHT	400	Weight is required and must be a positive number (in lbs)
MISSING_FROM_ADDRESS	400	Missing required sender address fields (name, address, city, state, zip)
MISSING_TO_ADDRESS	400	Missing required recipient address fields (name, address, city, state, zip)
API Keys
Request Body

Parameter		Type	Description
name	optional	string	Friendly name for the key (e.g. "My ERP")
Example

Copycurl -X POST https://labelcrow.com/api/v1/api-keys \ -H "Authorization: Bearer lc_live_..." \ -H "Content-Type: application/json" \ -d '{"name": "My ERP Integration"}'
Response 201

{ "data": { "key": "lc_live_a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9", "prefix": "lc_live_a3f8b2c1", "name": "My ERP Integration", "message": "Store this key securely. It will not be shown again." } }
Response 200

{ "data": [ { "id": 1, "prefix": "lc_live_a3f8b2c1", "name": "My ERP Integration", "scopes": ["labels:create", "labels:read"], "rate_limit": 60, "last_used_at": "2026-03-31T10:00:00Z", "created_at": "2026-03-31T09:00:00Z" } ] }
Response 200

{ "data": { "id": 1, "revoked": true } }
Account
Response 200

{ "data": { "balance": 3437.00, "effective_credits": 3437.00, "currency": "USD" } }
Returns all label series your account has access to, with pricing brackets. Use the id field as series_id when creating labels. The series_code is shown for reference only.

Response 200

{ "data": [ { "id": 2, "series_code": "9401", "display_name": "9401", "carrier": "usps", "service_class": "priority", "provider_key": "", "price_brackets": [ { "price": 2, "min_weight": 1, "max_weight": 70 } ] }, { "id": 3, "series_code": "92019", "display_name": "92019", "carrier": "usps", "service_class": "ground", "provider_key": "", "price_brackets": [ { "price": 2, "min_weight": 1, "max_weight": 70 } ] } ] }
 Use the id field as series_id when creating labels. The series_code is included for reference so you can identify which series is which.
Returns the carriers, service classes, and provider keys available on your account. Only shows combinations you have series access to.

Response 200

{ "data": [ { "carrier": "usps", "service_classes": [ { "service_class": "ground", "provider_keys": ["API", "Stamps", "shopify_epostage"] }, { "service_class": "priority", "provider_keys": ["Basic", "Stamps", "click_n_ship", "EVS_EasyPost"] } ] } ] }
Returns provider keys available on your account. Each provider key corresponds to a label template style. The provider_key is required when creating labels — it determines which template is used.

Query Param		Type	Description
carrier	optional	string	Filter by carrier (e.g. "usps")
service_class	optional	string	Filter by service class (e.g. "priority", "ground")
Example Request

Copycurl -X GET "/api/v1/account/providers?carrier=usps&service_class=priority" \ -H "Authorization: Bearer lc_live_..."
Response 200

{ "data": [ { "carrier": "usps", "service_class": "priority", "provider_key": "Basic" }, { "carrier": "usps", "service_class": "priority", "provider_key": "Stamps" }, { "carrier": "usps", "service_class": "priority", "provider_key": "click_n_ship" }, { "carrier": "usps", "service_class": "priority", "provider_key": "EVS_EasyPost" } ] }
Labels
Parameter		Type	Description
carrier	required	string	Carrier name — "usps"
service_class	required	string	Service class — "ground" or "priority"
provider_key	required	string	Provider key that determines the label template. Use GET /api/v1/account/providers to see available values (e.g. "Basic", "Stamps", "click_n_ship")
series_id	required	int	Series ID. Use GET /api/v1/account/series to see available series and their IDs
weight	required	number	Weight in lbs (must be a positive number). Determines pricing bracket
from.name	required	string	Sender name
from.address	required	string	Sender street address
from.address2	optional	string	Sender address line 2 (apt, suite, etc.)
from.city	required	string	Sender city
from.state	required	string	Sender state (2-letter)
from.zip	required	string	Sender ZIP code
to.name	required	string	Recipient name
to.address	required	string	Recipient street address
to.address2	optional	string	Recipient address line 2 (apt, suite, etc.)
to.city	required	string	Recipient city
to.state	required	string	Recipient state (2-letter)
to.zip	required	string	Recipient ZIP code
order_number	optional	string	Your internal order reference
 Series: series_id is required. Use GET /api/v1/account/series to find available series IDs and their corresponding series codes. The carrier, service_class, and provider_key together determine which label template is used.
 Idempotency: To prevent duplicate charges on retries, include a unique X-Idempotency-Key header. If the same key is sent again within 24 hours, the original response is returned without re-charging.
Example Request

Copycurl -X POST /api/v1/labels \ -H "Authorization: Bearer lc_live_..." \ -H "Content-Type: application/json" \ -H "X-Idempotency-Key: unique-request-id-123" \ -d '{ "carrier": "usps", "service_class": "priority", "provider_key": "Basic", "series_id": 2, "weight": 5, "from": { "name": "John Doe", "address": "123 Main St", "city": "Austin", "state": "TX", "zip": "73301" }, "to": { "name": "Jane Smith", "address": "456 Oak Ave", "city": "Denver", "state": "CO", "zip": "80201" } }'
Response 201

{ "data": { "id": 1234, "tracking": "9201 9903 9605 5705 2840 12", "carrier": "usps", "service_class": "priority", "series_id": 2, "series_code": "9401", "price": "2.00", "download_url": "/api/v1/labels/1234/download", "created_at": "2026-03-31T10:00:00Z" } }
Submit a JSON array of labels. The job runs asynchronously — poll the returned progress_url for status.

Copycurl -X POST /api/v1/labels/bulk \ -H "Authorization: Bearer lc_live_..." \ -H "Content-Type: application/json" \ -d '{ "carrier": "usps", "service_class": "ground", "provider_key": "API", "series_id": 3, "labels": [ { "fromName": "John Doe", "fromStreet": "123 Main St", "fromCity": "Austin", "fromState": "TX", "fromZip": "73301", "toName": "Jane Smith", "toStreet": "456 Oak Ave", "toCity": "Denver", "toState": "CO", "toZip": "80201", "weight": 5 }, { "fromName": "John Doe", "fromStreet": "123 Main St", "fromCity": "Austin", "fromState": "TX", "fromZip": "73301", "toName": "Bob Wilson", "toStreet": "789 Pine Rd", "toCity": "Portland", "toState": "OR", "toZip": "97201", "weight": 3 } ] }'
 Bulk labels accept both nested from/to objects and flat fields (fromName, toStreet, etc.). The carrier, service_class, provider_key, and series_id apply to all labels in the batch.
Response 202

{ "data": { "job_id": "1774946640000-a1b2c3", "order_id": 7950, "total_labels": 2, "status": "queued", "progress_url": "/api/v1/jobs/1774946640000-a1b2c3" } }
Query Param	Type	Description
page	int	Page number (default 1)
per_page	int	Items per page (1-200, default 50)
tracking	string	Filter by tracking number
carrier	string	Filter by carrier
created_after	datetime	Labels created after this date
created_before	datetime	Labels created before this date
Response 200

{ "data": [ { "id": 232400, "tracking": "9201998321218838916657", "carrier": "usps", "service_class": "priority", "price": "1.00", "to_name": "ROBERT MINIARD", "download_url": "/api/v1/labels/232400/download", "created_at": "2026-03-30T21:31:08Z" } ], "meta": { "page": 1, "per_page": 50, "total": 22080 } }
Response 200

{ "data": { "id": 617, "tracking": "9201990396055267830318", "carrier": "usps", "service_class": "priority", "price": "1.00", "from": { "name": "SMB TRADING", "street": "8245 259TH STREET", "city": "GLEN OAKS", "state": "NY", "zip": "11004" }, "to": { "name": "ROBERT MINIARD", "street": "172 WILDFLOWER TRL", "city": "GRAY COURT", "state": "SC", "zip": "29645" }, "weight": "7 LB", "download_url": "/api/v1/labels/617/download", "created_at": "2025-12-04T16:07:29Z" } }
Returns the label PDF file directly with Content-Type: application/pdf.

 Label files are automatically purged after 15 days. Download and store them promptly.
Orders
Query Param	Type	Description
page	int	Page number (default 1)
per_page	int	Items per page (1-200, default 50)
status	string	Filter: pending, processing, completed, failed
type	string	Filter: single, bulk
Response 200

{ "data": [ { "id": 7948, "job_id": "1774734056363-6ed5b0", "type": "bulk", "status": "completed", "total_labels": 17, "total_credits": "17.00", "created_at": "2026-03-28T21:40:56Z" } ], "meta": { "page": 1, "per_page": 50, "total": 120 } }
Response 200

{ "data": { "id": 7948, "job_id": "1774734056363-6ed5b0", "type": "bulk", "status": "completed", "total_labels": 17, "total_credits": "17.00", "files": { "merged_pdf": "/api/v1/orders/7948/download/merged_pdf", "zip": "/api/v1/orders/7948/download/zip" }, "created_at": "2026-03-28T21:40:56Z" } }
Valid types: merged_pdf (all labels in one PDF) or zip (individual PDFs).

Jobs
Poll this endpoint to track the progress of a bulk label job. Use the job_id from POST /labels/bulk.

Response 200

{ "data": { "job_id": "1774946640000-a1b2c3", "status": "processing", "total": 100, "generated": 45, "failed": 0, "progress": 45 } }
 Poll every 2-3 seconds. When status is "completed" or "failed", the job is done. Fetch the order via /api/v1/orders/:order_id to get download links.
Server-Sent Events (SSE) stream for real-time progress. Emits JSON events every 2 seconds. Auto-closes when the job completes.

// JavaScript example const es = new EventSource("/api/v1/jobs/JOB_ID/stream"); es.onmessage = (e) => { const data = JSON.parse(e.data); console.log(`Progress: ${data.generated}/${data.total}`); if (data.status === "completed" || data.status === "failed") { es.close(); } };
 SSE requires the API key as a query parameter since EventSource cannot send custom headers: /api/v1/jobs/:id/stream?token=lc_live_...
Webhooks
Webhooks notify your server when events occur (e.g. bulk job completes). Each delivery includes an HMAC-SHA256 signature.

Verify signatures:

// Node.js verification example const crypto = require("crypto"); const signature = req.headers["x-labelcrow-signature"]; const expected = crypto .createHmac("sha256", YOUR_WEBHOOK_SECRET) .update(JSON.stringify(req.body)) .digest("hex"); if (signature !== expected) { return res.status(401).send("Invalid signature"); }
Available Events

Event	Fires When
job.completed	Bulk label job finishes successfully
job.failed	Bulk label job fails
label.created	Single label is generated via API
 Webhooks are automatically disabled after 10 consecutive delivery failures. Re-activate via PATCH /webhooks/:id.
Parameter		Type	Description
url	required	string	Your HTTPS callback URL
events	required	string[]	Events to subscribe to
Response 201

{ "data": { "id": 1, "url": "https://yourapp.com/webhooks/labelcrow", "secret": "a1b2c3d4...signing_secret...", "events": ["job.completed", "job.failed"], "message": "Store the secret securely." } }
Response 200

{ "data": [ { "id": 1, "url": "https://yourapp.com/webhooks/labelcrow", "events": ["job.completed", "job.failed"], "active": true, "failure_count": 0, "created_at": "2026-03-31T09:00:00Z" } ] }
Parameter	Type	Description
url	string	New callback URL
events	string[]	New event list
active	boolean	Set to true to reactivate (resets failure count)
Response 200

{ "data": { "id": 1, "deleted": true } }
LabelCrow API v1 — Need help? Contact support.pasw
