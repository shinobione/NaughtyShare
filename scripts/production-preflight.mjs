import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const failures = [];

function requireMatch(pattern, message) {
  if (!pattern.test(config)) failures.push(message);
}

requireMatch(/"workers_dev"\s*:\s*false/, 'workers_dev must be explicitly false');
requireMatch(/"preview_urls"\s*:\s*false/, 'preview_urls must be explicitly false');

for (const secret of ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'ALLOWED_EMAILS']) {
  if (!config.includes(`"${secret}"`)) failures.push(`required secret ${secret} is not declared`);
}

const databaseId = config.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
if (!databaseId || databaseId === '00000000-0000-0000-0000-000000000000') {
  failures.push('replace the D1 database_id placeholder with the real production database ID');
}

const customDomain = config.match(/"pattern"\s*:\s*"([^"]+)"[\s\S]*?"custom_domain"\s*:\s*true/)?.[1];
if (!customDomain) {
  failures.push('configure a production custom-domain route in wrangler.jsonc before deployment');
} else if (/example\.(com|org|net)|localhost/i.test(customDomain)) {
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
console.log(`Custom domain: ${customDomain}`);
console.log(`D1 database ID configured: ${databaseId}`);
