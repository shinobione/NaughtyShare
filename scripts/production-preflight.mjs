import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const failures = [];

function requireMatch(pattern, message) {
  if (!pattern.test(config)) failures.push(message);
}

async function validateMediaPocWrapper() {
  const wrapper = await readFile(new URL('../worker/media-poc.js', import.meta.url), 'utf8');
  const markers = [
    [/import\s+v1Worker\s+from\s+['"]\.\/v1\.js['"]/, 'POC wrapper must import worker/v1.js'],
    [/async\s+function\s+authenticateViaV1\s*\(/, 'POC wrapper must authenticate compatibility routes through v1'],
    [/const\s+authFailure\s*=\s*await\s+authenticateViaV1\(request,\s*env,\s*ctx\)/, 'POC routes must call the v1 auth gate'],
    [/return\s+v1Worker\.fetch\(request,\s*env,\s*ctx\)\s*;/, 'POC wrapper must delegate unmatched requests to v1'],
  ];
  for (const [pattern, message] of markers) {
    if (!pattern.test(wrapper)) failures.push(message);
  }
}

async function validateTogetherWrapper() {
  const wrapper = await readFile(new URL('../worker/together.js', import.meta.url), 'utf8');
  const markers = [
    [/import\s+mediaPocWorker\s+from\s+['"]\.\/media-poc\.js['"]/, 'Together wrapper must import worker/media-poc.js'],
    [/export\s+class\s+TogetherRoom\s+extends\s+DurableObject/, 'TogetherRoom must be exported as a Durable Object class'],
    [/async\s+function\s+authenticateViaMediaPoc\s*\(/, 'Together WebSocket route must reuse the authenticated media/v1 chain'],
    [/url\.pathname\s*===\s*['"]\/api\/together\/ws['"]/, 'Together wrapper must expose only the authenticated Together WebSocket endpoint'],
    [/return\s+mediaPocWorker\.fetch\(request,\s*env,\s*ctx\)\s*;/, 'Together wrapper must delegate unmatched requests to the media POC/v1 chain'],
  ];
  for (const [pattern, message] of markers) {
    if (!pattern.test(wrapper)) failures.push(message);
  }

  requireMatch(/"durable_objects"\s*:\s*\{[\s\S]*?"name"\s*:\s*"TOGETHER_ROOMS"[\s\S]*?"class_name"\s*:\s*"TogetherRoom"/, 'TOGETHER_ROOMS Durable Object binding is required');
  requireMatch(/"exports"\s*:\s*\{[\s\S]*?"TogetherRoom"\s*:\s*\{[\s\S]*?"type"\s*:\s*"durable-object"[\s\S]*?"storage"\s*:\s*"sqlite"/, 'TogetherRoom must use declarative SQLite Durable Object storage');
}

async function validateTogetherInviteWrapper() {
  const wrapper = await readFile(new URL('../worker/together-invite.js', import.meta.url), 'utf8');
  const markers = [
    [/import\s+togetherWorker,\s*\{\s*TogetherRoom\s*\}\s+from\s+['"]\.\/together\.js['"]/, 'Invite wrapper must import and re-export TogetherRoom from worker/together.js'],
    [/export\s+class\s+TogetherInviteRoom\s+extends\s+DurableObject/, 'TogetherInviteRoom must be exported as a Durable Object class'],
    [/async\s+function\s+authenticateViaTogether\s*\(/, 'Invite WebSocket route must reuse the authenticated Together/media/v1 chain'],
    [/url\.pathname\s*===\s*['"]\/api\/together\/invite\/ws['"]/, 'Invite wrapper must expose only the authenticated Together invite WebSocket endpoint'],
    [/return\s+togetherWorker\.fetch\(request,\s*env,\s*ctx\)\s*;/, 'Invite wrapper must delegate unmatched requests to Together'],
  ];
  for (const [pattern, message] of markers) {
    if (!pattern.test(wrapper)) failures.push(message);
  }

  requireMatch(/"name"\s*:\s*"TOGETHER_INVITES"[\s\S]*?"class_name"\s*:\s*"TogetherInviteRoom"/, 'TOGETHER_INVITES Durable Object binding is required');
  requireMatch(/"TogetherInviteRoom"\s*:\s*\{[\s\S]*?"type"\s*:\s*"durable-object"[\s\S]*?"storage"\s*:\s*"sqlite"/, 'TogetherInviteRoom must use declarative SQLite Durable Object storage');
}

async function validateNaughtyCallWrapper() {
  const wrapper = await readFile(new URL('../worker/naughtycall.js', import.meta.url), 'utf8');
  const markers = [
    [/import\s+togetherInviteWorker,\s*\{\s*TogetherRoom,\s*TogetherInviteRoom\s*\}\s+from\s+['"]\.\/together-invite\.js['"]/, 'NaughtyCall wrapper must import and re-export Together Durable Objects'],
    [/export\s+class\s+NaughtyCallRoom\s+extends\s+DurableObject/, 'NaughtyCallRoom must be exported as a Durable Object class'],
    [/async\s+function\s+authenticateViaTogetherInvite\s*\(/, 'NaughtyCall routes must reuse the authenticated Together invite/media/v1 chain'],
    [/url\.pathname\s*===\s*['"]\/api\/naughtycall\/ws['"]/, 'NaughtyCall wrapper must expose the authenticated signaling WebSocket endpoint'],
    [/url\.pathname\s*===\s*['"]\/api\/naughtycall\/ice['"]/, 'NaughtyCall wrapper must expose the authenticated ICE configuration endpoint'],
    [/return\s+togetherInviteWorker\.fetch\(request,\s*env,\s*ctx\)\s*;/, 'NaughtyCall wrapper must delegate unmatched requests to Together invite'],
  ];
  for (const [pattern, message] of markers) {
    if (!pattern.test(wrapper)) failures.push(message);
  }

  requireMatch(/"name"\s*:\s*"NAUGHTYCALL_ROOMS"[\s\S]*?"class_name"\s*:\s*"NaughtyCallRoom"/, 'NAUGHTYCALL_ROOMS Durable Object binding is required');
  requireMatch(/"NaughtyCallRoom"\s*:\s*\{[\s\S]*?"type"\s*:\s*"durable-object"[\s\S]*?"storage"\s*:\s*"sqlite"/, 'NaughtyCallRoom must use declarative SQLite Durable Object storage');
}

requireMatch(/"preview_urls"\s*:\s*false/, 'preview_urls must be explicitly false');
requireMatch(/"run_worker_first"\s*:\s*true/, 'assets.run_worker_first must be true so authentication gates the PWA shell');

const workerEntry = config.match(/"main"\s*:\s*"([^"]+)"/)?.[1];
if (!workerEntry) {
  failures.push('wrangler main worker entry is missing');
} else if (workerEntry === 'worker/v1.js') {
  // Canonical stable production entrypoint.
} else if (workerEntry === 'worker/media-poc.js') {
  await validateMediaPocWrapper();
} else if (workerEntry === 'worker/together.js') {
  await validateMediaPocWrapper();
  await validateTogetherWrapper();
} else if (workerEntry === 'worker/together-invite.js') {
  await validateMediaPocWrapper();
  await validateTogetherWrapper();
  await validateTogetherInviteWrapper();
} else if (workerEntry === 'worker/naughtycall.js') {
  await validateMediaPocWrapper();
  await validateTogetherWrapper();
  await validateTogetherInviteWrapper();
  await validateNaughtyCallWrapper();
} else {
  failures.push(`worker entry ${workerEntry} is not an approved production entrypoint`);
}

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
console.log(`Worker entry validated: ${workerEntry}`);
console.log(`Exposure mode: ${customDomain ? `custom domain ${customDomain}` : 'workers.dev protected by Cloudflare Access'}`);
console.log(`D1 database ID configured: ${databaseId}`);
