const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_GRACE_DAYS = 7;

function usage() {
  console.log(`Usage: node scripts/generate-license.cjs \\
  --pharmacy-id PH-0001 \\
  --pharmacy-name "Sharma Medical" \\
  --machine-id abc123... \\
  [--issued 2026-07-18] \\
  [--expires 2027-07-18] \\
  [--grace-days 7] \\
  [--private-key scripts/keys/private.pem]

Example:
  node scripts/generate-license.cjs \\
    --pharmacy-id PH-0042 \\
    --pharmacy-name "Sharma Medical" \\
    --machine-id a1b2c3d4e5f6... \\
    --expires 2027-07-18
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`);
    }
    args[name] = value;
    i += 1;
  }
  return args;
}

function addDays(isoDate, days) {
  const date = new Date(isoDate + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function canonicalPayload(payload) {
  return JSON.stringify({
    pharmacy_id: payload.pharmacy_id,
    pharmacy_name: payload.pharmacy_name,
    machine_id: payload.machine_id,
    issued: payload.issued,
    expires: payload.expires,
    grace_days: payload.grace_days,
  });
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    usage();
    process.exit(1);
  }

  const pharmacyId = args['pharmacy-id'];
  const pharmacyName = args['pharmacy-name'];
  const machineId = args['machine-id'];
  const privateKeyPath = args['private-key'] || path.join(__dirname, 'keys', 'private.pem');

  if (!pharmacyId || !pharmacyName || !machineId) {
    usage();
    process.exit(1);
  }

  if (!fs.existsSync(privateKeyPath)) {
    console.error(`Private key not found at ${privateKeyPath}`);
    console.error('Run: node scripts/generate-keypair.cjs');
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const issued = args.issued || today;
  const expires = args.expires || addDays(issued, 365);
  const graceDays = args['grace-days'] ? Number(args['grace-days']) : DEFAULT_GRACE_DAYS;

  const payload = {
    pharmacy_id: pharmacyId.trim(),
    pharmacy_name: pharmacyName.trim(),
    machine_id: machineId.trim(),
    issued,
    expires,
    grace_days: Number.isFinite(graceDays) ? graceDays : DEFAULT_GRACE_DAYS,
  };

  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(canonicalPayload(payload), 'utf8'), privateKey)
    .toString('hex');

  const licenseKey = Buffer.from(JSON.stringify({ payload, signature }), 'utf8').toString(
    'base64url'
  );

  console.log('License generated successfully.\n');
  console.log(`Pharmacy ID:   ${payload.pharmacy_id}`);
  console.log(`Pharmacy Name: ${payload.pharmacy_name}`);
  console.log(`Machine ID:    ${payload.machine_id}`);
  console.log(`Issued:        ${payload.issued}`);
  console.log(`Expires:       ${payload.expires}`);
  console.log(`Grace Days:    ${payload.grace_days}`);
  console.log('\nLicense key (send this to the customer):\n');
  console.log(licenseKey);
}

main();
