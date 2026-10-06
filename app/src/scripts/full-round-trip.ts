import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { CONSOLE_NETWORK, NETWORK, requireEnv, requireEnvAny } from '../config.js';
import { ConsoleClient, ConsoleError } from '../lib/console.js';
import {
  decryptBytes,
  encryptBytes,
  loadKeypair,
  makeSealClient,
  makeSuiClient,
  signReserveBytes,
} from '../lib/seal.js';

const SAMPLE_PATH = new URL('../../sample.txt', import.meta.url);
const BUCKET_NAME = `round-trip-${Date.now()}`;
const UPLOAD_NAME = 'sample.txt.enc';

const apiKey = requireEnv('CONSOLE_API_KEY');
const consoleClient = new ConsoleClient({ apiKey });
const keypair = loadKeypair(
  requireEnvAny(['CONSOLE_SERVICE_PRIVATE_KEY', 'CONSOLE_SERVICE_PRIVKEY']),
);
const sui = makeSuiClient();
const seal = makeSealClient(sui, apiKey);

console.log(`network=${CONSOLE_NETWORK} api=${NETWORK.apiBase}`);

function step(n: number, label: string): void {
  console.log(`\n[${n}/12] ${label}`);
}

step(1, 'List spaces');
const spaces = await consoleClient.listSpaces();
const space = spaces[0];
if (!space) throw new Error('No spaces found for this API key.');
console.log(`  space.id=${space.id}${space.name ? ` (${space.name})` : ''}`);

step(2, 'Reserve a private bucket');
let reserved;
try {
  reserved = await consoleClient.reserveBucket(space.id, BUCKET_NAME);
} catch (err) {
  if (err instanceof ConsoleError && err.parsed?.code === 'plan_limit_exceeded') {
    console.error(
      `\nBucket cap reached for space ${space.id}. Runs that fail before the ` +
        `final step leave their bucket behind. Delete empty buckets in the ` +
        `space and retry:\n\n` +
        `  set -a; source .env; set +a\n` +
        `  export BASE="${NETWORK.apiBase}"\n` +
        `  export AUTH="Authorization: Bearer $CONSOLE_API_KEY"\n` +
        `  curl -sS -H "$AUTH" "$BASE/api/v1/spaces/${space.id}/buckets" \\\n` +
        `    | jq -r '.buckets[].id' \\\n` +
        `    | xargs -I{} curl -sS -X DELETE -H "$AUTH" -o /dev/null \\\n` +
        `        -w '%{http_code} {}\\n' "$BASE/api/v1/buckets/{}?confirm=true"\n`,
    );
    process.exit(1);
  }
  throw err;
}
console.log(`  bucket_id=${reserved.bucket_id} digest=${reserved.digest}`);

step(3, 'Sign reserve bytes with service key');
const signature = await signReserveBytes(keypair, reserved.bytes);
console.log(`  signature.length=${signature.length}`);

step(4, 'Finalize');
const finalized = await consoleClient.finalizeBucket(reserved.bucket_id, signature);
console.log(
  `  seal_policy_id=${finalized.seal_policy_id} provisioning_state=${finalized.provisioning_state}`,
);

step(5, 'Encrypt sample.txt with Seal');
const plaintext = await readFile(SAMPLE_PATH);
const ciphertext = await encryptBytes(seal, finalized.seal_policy_id, plaintext);
console.log(`  plaintext=${plaintext.byteLength}B ciphertext=${ciphertext.byteLength}B`);

step(6, 'Upload (retry on mirror_missing_grant)');
const upload = await consoleClient.uploadFile(
  reserved.bucket_id,
  UPLOAD_NAME,
  ciphertext,
  (attempt, body) => console.log(`  attempt ${attempt}: mirror_missing_grant — ${body}`),
);
console.log(`  uploaded file.id=${upload.data.id}`);

step(7, 'Poll status until completed');
await consoleClient.pollUntilCompleted(reserved.bucket_id, upload.data.id, (attempt, state) =>
  console.log(`  attempt ${attempt}: state=${state}`),
);

step(8, 'Download ciphertext');
const downloaded = await consoleClient.downloadFile(reserved.bucket_id, upload.data.id);
console.log(`  downloaded ${downloaded.byteLength}B`);

step(9, 'Mint + redeem signed download URL');
const signed = await consoleClient.mintDownloadUrl(reserved.bucket_id, upload.data.id);
console.log(`  download_url=${signed.download_url.slice(0, 32)}… expires_at=${signed.expires_at}`);
const redeemed = await consoleClient.redeemDownloadUrl(signed.download_url);
const redeemedMatches =
  redeemed.byteLength === downloaded.byteLength && timingSafeEqual(redeemed, downloaded);
console.log(`  redeemed ${redeemed.byteLength}B without auth`);
if (!redeemedMatches) {
  throw new Error('Signed-URL bytes differ from the authenticated download.');
}

step(10, 'Decrypt with Seal');
const decrypted = await decryptBytes(seal, sui, keypair, finalized.seal_policy_id, downloaded);
console.log(`  decrypted ${decrypted.byteLength}B`);

step(11, 'Verify + delete file');
const matches =
  plaintext.byteLength === decrypted.byteLength && timingSafeEqual(plaintext, decrypted);
console.log(`  ${matches ? 'MATCH' : 'MISMATCH'}`);
if (!matches) process.exitCode = 1;

await consoleClient.deleteFile(reserved.bucket_id, upload.data.id);
console.log(`  deleted file.id=${upload.data.id}`);

// File delete is an async soft-delete, so the bucket can still report files
// for a few seconds. Retry the 400 until the worker settles.
step(12, 'Delete bucket');
const BUCKET_DELETE_MAX_RETRIES = 10;
for (let attempt = 1; ; attempt++) {
  try {
    await consoleClient.deleteBucket(reserved.bucket_id);
    console.log(`  deleted bucket_id=${reserved.bucket_id}`);
    break;
  } catch (err) {
    const retryable =
      err instanceof ConsoleError && err.status === 400 && attempt < BUCKET_DELETE_MAX_RETRIES;
    if (!retryable) throw err;
    console.log(`  attempt ${attempt}: bucket not empty yet (HTTP 400) — retrying`);
    await sleep(3_000);
  }
}

console.log('\nRound-trip OK.');
