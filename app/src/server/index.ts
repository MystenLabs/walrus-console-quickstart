import { setTimeout as sleep } from 'node:timers/promises';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { CONSOLE_NETWORK, NETWORK, requireEnv, requireServicePrivateKey } from '../config.js';
import { ConsoleClient, ConsoleError } from '../lib/console.js';
import {
  decryptBytes,
  encryptBytes,
  loadKeypair,
  makeSealClient,
  makeSuiClient,
  signReserveBytes,
} from '../lib/seal.js';

const apiKey = requireEnv('CONSOLE_API_KEY');
const consoleClient = new ConsoleClient({ apiKey });
const keypair = loadKeypair(requireServicePrivateKey());
const sui = makeSuiClient();
const seal = makeSealClient(sui, apiKey);

// Stateless seal_policy_id lookup. Each upload/download fetches the bucket
// metadata to find the policy id — no in-process cache. Trade-off: one extra
// Console GET per file op. See README "Limitations".
//
// Retries on `mirror_missing_grant`: right after finalize, both GET /buckets/:id
// AND POST /buckets/:id/files can 403 while Console's ACL indexer catches up.
// `consoleClient.uploadFile` already retries on its own; this loop handles the metadata
// read on the same condition.
const MIRROR_RETRY_MAX = 20;
const MIRROR_RETRY_DELAY_MS = 3_000;

async function getSealPolicyId(bucketId: string): Promise<string> {
  for (let attempt = 1; attempt <= MIRROR_RETRY_MAX; attempt++) {
    try {
      const bucket = await consoleClient.getBucket(bucketId);
      if (!bucket.seal_policy_id) {
        throw new ConsoleError(409, 'Bucket is not finalized (no seal_policy_id).', {
          code: 'bucket_not_finalized',
        });
      }
      return bucket.seal_policy_id;
    } catch (err) {
      const transient =
        err instanceof ConsoleError &&
        err.status === 403 &&
        err.parsed?.code === 'mirror_missing_grant';
      if (!transient || attempt === MIRROR_RETRY_MAX) throw err;
      await sleep(MIRROR_RETRY_DELAY_MS);
    }
  }
  throw new Error(
    `getSealPolicyId: still mirror_missing_grant after ${MIRROR_RETRY_MAX} attempts.`,
  );
}

const app = new Hono();

app.use(logger());
app.use('/api/*', cors());

app.get('/api/spaces', async (c) => {
  const spaces = await consoleClient.listSpaces();
  return c.json(spaces);
});

app.get('/api/spaces/:spaceId/buckets', async (c) => {
  const buckets = await consoleClient.listBuckets(c.req.param('spaceId'));
  return c.json(buckets);
});

// Reserve → sign → finalize, all in one request.
app.post('/api/spaces/:spaceId/buckets', async (c) => {
  const spaceId = c.req.param('spaceId');
  const { name } = await c.req.json<{ name?: string }>();
  if (!name) return c.json({ code: 'invalid_request', message: 'name required' }, 400);

  const reserved = await consoleClient.reserveBucket(spaceId, name);
  const signature = await signReserveBytes(keypair, reserved.bytes);
  const finalized = await consoleClient.finalizeBucket(reserved.bucket_id, signature);
  return c.json(
    { bucket_id: finalized.bucket_id, seal_policy_id: finalized.seal_policy_id },
    201,
  );
});

app.delete('/api/buckets/:bucketId', async (c) => {
  await consoleClient.deleteBucket(c.req.param('bucketId'));
  return c.body(null, 204);
});

app.get('/api/buckets/:bucketId/files', async (c) => {
  const files = await consoleClient.listFiles(c.req.param('bucketId'));
  return c.json(files);
});

// Encrypt → upload (with mirror_missing_grant retry) → poll until completed.
// Synchronous: request holds open until the upload finishes (a few seconds to ~1m).
app.post('/api/buckets/:bucketId/files', async (c) => {
  const bucketId = c.req.param('bucketId');
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!(file instanceof File)) {
    return c.json({ code: 'invalid_request', message: 'multipart "file" field required' }, 400);
  }
  const name = typeof body['name'] === 'string' ? body['name'] : file.name;
  const plaintext = new Uint8Array(await file.arrayBuffer());

  const sealPolicyId = await getSealPolicyId(bucketId);
  const ciphertext = await encryptBytes(seal, sealPolicyId, plaintext);
  const upload = await consoleClient.uploadFile(bucketId, name, ciphertext);
  await consoleClient.pollUntilCompleted(bucketId, upload.data.id);
  return c.json({ file_id: upload.data.id }, 202);
});

// Download ciphertext → decrypt → return plaintext.
app.get('/api/buckets/:bucketId/files/:fileId', async (c) => {
  const bucketId = c.req.param('bucketId');
  const fileId = c.req.param('fileId');
  const sealPolicyId = await getSealPolicyId(bucketId);
  const ciphertext = await consoleClient.downloadFile(bucketId, fileId);
  const plaintext = await decryptBytes(seal, sui, keypair, sealPolicyId, ciphertext);
  c.header('Content-Type', 'application/octet-stream');
  c.header('Content-Disposition', `attachment; filename="${fileId}"`);
  return c.body(plaintext);
});

app.delete('/api/buckets/:bucketId/files/:fileId', async (c) => {
  await consoleClient.deleteFile(c.req.param('bucketId'), c.req.param('fileId'));
  return c.body(null, 204);
});

app.notFound((c) => c.json({ code: 'not_found', message: 'Route not found' }, 404));

app.onError((err, c) => {
  if (err instanceof ConsoleError) {
    const status = err.status as ContentfulStatusCode;
    return c.json(
      { code: err.parsed?.code ?? 'console_error', message: err.parsed?.message ?? err.message },
      status,
    );
  }
  console.error('Unhandled error:', err);
  return c.json({ code: 'internal_error', message: err.message }, 500);
});

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? '127.0.0.1';
serve({ fetch: app.fetch, port, hostname }, ({ address, port }) => {
  console.log(
    `Console demo backend listening on http://${address}:${port} ` +
      `(network=${CONSOLE_NETWORK} api=${NETWORK.apiBase})`,
  );
});
