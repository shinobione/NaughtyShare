import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const failures = [];

function requireMatch(pattern, message) {
  if (!pattern.test(config)) failures.push(message);
}

requireMatch(/"preview_urls"\s*:\s*false/, 'preview_urls must be explicitly false');
requireMatch(/"run_worker_first"\s*:\s*true/, 'assets.run_worker_first must be true so authentication gates the PWA shell');
requireMatch(/"main"\s*:\s*"worker\/app\.js"/, 'worker entry must route through worker/app.js so library APIs stay behind Access');

for (const secret of [
  'ACCESS_TEAM_DOMAIN',
  'ACCESS_AUD',
  'ALLOWED_EMAILS',
]) {
  if (!config.includes(`"${secret}"`)) failures.push(`required secret ${secret} is not declared`);
}

for (const retiredSecret of [
  'GOOGLE_PHOTOS_CLIENT_ID',
  'GOOGLE_PHOTOS_CLIENT_SECRET',
]) {
  if (config.includes(`"${retiredSecret}"`)) failures.push(`retired Google Photos secret ${retiredSecret} should not be required`);
}

const databaseId = config.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
if (!databaseId || databaseId === '00000000-0000-0000-0000-000000000000') {
  failures.push('replace the D1 database_id placeholder with the real production database ID');
}

const workersDevEnabled = /"workers_dev"\s*:\s*true/.test(config);
const customDomain = config.match(/"pattern"\s*:\s*"([^"]+)"[\s\S]*?"custom_domain"\s*:\s*true/)?.[1];
if (!workersDevEnabled && !customDomain) {
  failures.push('enable workers.dev or configure a real custom-domain route');
}
if (customDomain && /example\.(com|org|net)|localhost/i.test(customDomain)) {
  failures.push(`custom-domain route still looks like a placeholder: ${customDomain}`);
}

if (!/"bucket_name"\s*:\s*"naughtyshare-media"/.test(config)) {
  failures.push('MEDIA must remain bound to the private naughtyshare-media R2 bucket');
}

if (failures.length) {
  console.error('NaughtyShare production preflight FAILED:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('NaughtyShare production preflight PASS');
console.log(`Exposure mode: ${customDomain ? `custom domain ${customDomain}` : 'workers.dev protected by Cloudflare Access'}`);
console.log(`D1 database ID configured: ${databaseId}`);
