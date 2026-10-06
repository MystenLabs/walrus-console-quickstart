# Console API Quickstart

> Console runs on Sui mainnet and Sui testnet. Mainnet is the default and the
> production environment. Testnet is the staging environment for QA and testing.

A "hello world" tour of the Console API: sign up, create a Seal-encrypted
bucket, upload + download a file, then clean up. All bucket creation goes
through the private (Seal-encrypted) flow — public bucket creation is
disabled at the API boundary.

> **Hosted versions.** This guide is also served live from the API:
> - Rendered HTML: [`/docs/quickstart`](https://api.console.walrus.xyz/docs/quickstart)
> - Raw markdown (LLM/`curl`-friendly): [`/docs/quickstart.md`](https://api.console.walrus.xyz/docs/quickstart.md)
> - OpenAPI viewer (Scalar): [`/docs/openapi`](https://api.console.walrus.xyz/docs/openapi)
> - OpenAPI spec (raw): [`/openapi.yaml`](https://api.console.walrus.xyz/openapi.yaml) · [`/openapi.json`](https://api.console.walrus.xyz/openapi.json)
> - Docs index: [`/docs`](https://api.console.walrus.xyz/docs)
>
> The testnet API serves the same pages at `https://api.testnet.console.walrus.xyz`.

---

## Networks

Console runs on two Sui networks. API keys, buckets, and on-chain objects are
per network: a key minted on one network does not work on the other.

| | Mainnet (default) | Testnet (staging, QA) |
| --- | --- | --- |
| Web app | <https://console.walrus.xyz> | <https://testnet.console.walrus.xyz> |
| API host | `https://api.console.walrus.xyz` | `https://api.testnet.console.walrus.xyz` |
| Sui fullnode | `https://fullnode.mainnet.sui.io:443` | `https://fullnode.testnet.sui.io:443` |
| Bucket-policy package (original = latest) | `0xb8d5b1cade7917190c47b8abfc789f527389fc021a8963c22755bcc1b539786c` | `0xf9b261d4c0dbcf845d79f864e85581f9686fd6de9f4770ba1d77489d67f7833c` |
| `BucketRegistry` (shared) | `0x871f3d0341f36101ff0b30cd01dbe363f8d89d7f004df80e8084752d2f496958` | `0x902841af0cd25c5f8dee4980fe2942687c9ca80db56d77ff67a4ba6d9d97b9cf` |
| Seal committee `KeyServer` | `0x686098f1439237fff9f36b99c7329683c22979d2005c2465cb891acb012a7595` | `0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98` |

Use mainnet for real data. Use testnet to test an integration before you point
it at mainnet. The code in this guide reads the row for one network. The
[`app/`](app/) reference keeps both rows in `app/src/config.ts` and selects
one with `CONSOLE_NETWORK` in `.env`.

---

## 1. Hello world — sign up via zkLogin

1. Visit [console.walrus.xyz](https://console.walrus.xyz/) and sign in with Google or Apple (via zkLogin).
   Your account and a **Personal Space** are provisioned automatically.
   For the staging environment, use [testnet.console.walrus.xyz](https://testnet.console.walrus.xyz/)
   instead. The key you mint there works only against the testnet API host.
2. Open **Integrations → Create API Key** (top-right), name the key, choose
   **API key** (not **Management API key**, which only mints further keys and
   cannot upload, download or manage assets), pick a **Permissions** option,
   submit.
   - **`read_write`** — required for any state change: create/delete
     buckets, upload/rename/delete files, finalize private buckets.
   - **`read_only`** — listing, status, download only. Every write
     endpoint returns `403 read_only_api_key` for these keys; pick this
     scope when handing a key to a downstream consumer that should not
     mutate your data.

   Pick `read_write` if you intend to follow §2 end-to-end; pick
   `read_only` only for read-side integrations.
3. On the reveal screen, copy the `hbr_…` Console API key. It is shown
   **once** — Console cannot recover it afterwards. Store it like an AWS
   secret access key. The same screen shows the `suiprivkey1…` service
   private key (§2.1) and a `CONSOLE_CREDENTIAL_BUNDLE` value that the
   Console MCP installer accepts as a single paste.
4. (Optional) Import the curated Postman collection and one environment into
   Postman Desktop:
   - `postman/console.postman_collection.json`
   - `postman/console.postman_environment.json` (mainnet)
   - `postman/console.testnet.postman_environment.json` (testnet)

   Paste your `hbr_…` key into the `bearerToken` env variable. `baseUrl` is
   `https://api.console.walrus.xyz` in the mainnet environment and
   `https://api.testnet.console.walrus.xyz` in the testnet one.

Every request below carries `Authorization: Bearer hbr_…`.

---

## 2. Create an encrypted bucket and upload a file

```
service key setup → get space → reserve → sign → finalize →
encrypt → upload → poll → download → decrypt → delete
```

Buckets are Seal-encrypted client-side — Console stores ciphertext only
and never sees plaintext or decryption material. Creation goes through a
**reserve → sign → finalize** handshake, with a one-time service-key
setup beforehand and a local decrypt step on download.

> **You will end §2.1 holding two secrets:** an `hbr_…` Console API key
> (sent as `Authorization: Bearer …` on every request) **and** a
> `suiprivkey1…` service private key (kept locally; used to sign the
> finalize transaction and to authenticate decrypt sessions with Seal).
> Both are shown **once** on the reveal screen — store them like AWS
> access keys.


### 1. One-time setup — API key with Read & Write

In **Integrations → Create API Key**, choose **API key** and pick **Read & Write**
(`read_write`). Private-bucket creation, finalize, and uploads are all
writes — Read-only keys can't perform them. The reveal screen now exposes
two secrets:

- `hbr_…` — the Console API key (same as section 1).
- `suiprivkey1…` — the **service private key**, an Ed25519 Base64 secret
  in Sui keytool format. Bound to this API key; Console stores only the
  derived public address. **Does not need any SUI balance** — gas is
  sponsored by Console via Enoki.

Both are shown **once**. Paste them into Postman as `bearerToken` and
`consoleServicePrivateKey`, or stash them in your `.env`.


### 2. Get your space id

```http
GET /api/v1/spaces
```

The response's `data[]` array contains your spaces; copy the `id` of the
Personal Space created during sign-up. (Postman: `bearer / spaces (read) /
List spaces`.)

### 3. Reserve the bucket

```http
POST /api/v1/spaces/{spaceId}/buckets
Content-Type: application/json

{ "name": "secrets", "scope": "private" }
```

Response (`201`):

```json
{
  "bucket_id": "…",
  "bytes": "<base64 Enoki-sponsored Sui tx>",
  "digest": "…",
  "provisioning_state": "pending_policy",
  "owner_address": "0x…",
  "admin_signer_address": "0x…"
}
```

`bytes` is the **Enoki-sponsored** Sui transaction that creates the
bucket's Seal access policy, with your service key's address set as the
sender. Console cannot sign it for you — that is the whole point of
client-side encryption — but it has already attached the gas sponsor's
signature, so your service key just needs to add its own signature.
`digest` is the Enoki sponsor digest; Console uses it server-side at
finalize to look up the sponsored tx. The bucket row stays in
`pending_policy` until the Finalize call below succeeds — until then no
files can be uploaded to it. `owner_address` is the bucket owner that
Console bound the reserve to. `admin_signer_address` is the space's
active Key-Admin signer in the sponsored transaction, or `null` if the
space has none.

> **Sponsor signatures expire fast.** Treat **reserve → sign → finalize**
> as a single tight sequence. If you stall between reserve and finalize,
> finalize returns `{"code":"digest_expired"}`. Re-run reserve to get
> fresh `bytes` and try again. The Postman collection handles this by
> auto-signing in the Reserve request's post-response script.

> **Bucket names are unique per space.** A 409 on reserve means the name
> is taken — either by a live bucket or by one stuck in `pending_policy`
> from a previous aborted reserve. Pick a new name (e.g. append a Unix
> timestamp), or clean up the stale bucket: list with
> `GET /api/v1/spaces/{id}/buckets`, filter `provisioning_state == "pending_policy"`,
> then `DELETE /api/v1/buckets/{id}?confirm=true` on each (the
> `confirm=true` query param is required). A bucket that still holds files
> is refused with `400 bucket_not_empty` and a `file_count`; add
> `&deleteContents=true` to delete them along with it.

### 4. Sign `bytes` with the service key

Use `@mysten/sui` — it handles the Bech32 decode and the Sui signature
envelope (`0x00 || sig || pubKey`) for you:

```ts
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';

const { secretKey } = decodeSuiPrivateKey(process.env.CONSOLE_SERVICE_PRIVATE_KEY);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const { signature } = await keypair.signTransaction(fromBase64(bytes));
```

### 5. Finalize

```http
POST /api/v1/buckets/{bucketId}/finalize
Content-Type: application/json

{ "signature": "<base64 signature from step 4>" }
```

Console combines your signature with Enoki's gas-sponsor signature and
broadcasts the transaction. Response (`200`):

```json
{ "bucket_id": "…", "seal_policy_id": "…", "provisioning_state": "active" }
```

`seal_policy_id` is the on-chain bucket-group object id used by Seal for
access checks. The bucket is now usable.

### 6. Encrypt the file with Seal

Private buckets store **Seal ciphertext only** — Console never sees plaintext.
Encrypt locally with [`@mysten/seal`](https://www.npmjs.com/package/@mysten/seal)
against the `seal_policy_id` returned by Finalize:

```ts
import { SealClient } from '@mysten/seal';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { bcs } from '@mysten/sui/bcs';

// Values below are the mainnet row of the Networks table. Swap in the testnet
// row for staging.
//
// `ORIGINAL` here means the *original-id* of the upgradeable package
// (its original/canonical published id). Seal pins identity
// derivation to the original/canonical package id, so encrypt MUST use this
// value even after the package has been upgraded — otherwise an upgrade would
// invalidate every previously-encrypted blob's DEK.
const CONSOLE_API_BASE = 'https://api.console.walrus.xyz';
const CONSOLE_ORIGINAL_PACKAGE_ID =
  '0xb8d5b1cade7917190c47b8abfc789f527389fc021a8963c22755bcc1b539786c';
// Seal's decentralized committee for this network. One KeyServer object stands
// for the whole committee, so the client-side threshold is 1. The committee
// enforces its own threshold internally (mainnet 5-of-8, testnet 3-of-5).
const SEAL_COMMITTEE_OBJECT_ID =
  '0x686098f1439237fff9f36b99c7329683c22979d2005c2465cb891acb012a7595';

const sui = new SuiGrpcClient({
  network: 'mainnet',
  baseUrl: 'https://fullnode.mainnet.sui.io:443',
});
// Key fetches do not go to Seal's aggregator directly: the aggregator needs a
// credential that Console holds server-side. The SDK posts each fetch to
// `${aggregatorUrl}/v1/fetch_key`, so point it at Console's proxy and
// authenticate with the same `hbr_…` API key. Console adds the aggregator
// credential and relays the response.
const seal = new SealClient({
  suiClient: sui,
  serverConfigs: [
    {
      objectId: SEAL_COMMITTEE_OBJECT_ID,
      weight: 1,
      aggregatorUrl: `${CONSOLE_API_BASE}/api/v1/seal/aggregator`,
      apiKeyName: 'Authorization',
      apiKey: `Bearer ${process.env.CONSOLE_API_KEY}`,
    },
  ],
  verifyKeyServers: false,
});

// Each file's Seal id = (bucket policy id, 32 random bytes). The bcs serializer
// matches Console's on-chain `seal_approve` check.
const SealIdentity = bcs.struct('SealIdentity', {
  policyObjectId: bcs.Address,
  nonce: bcs.fixedArray(32, bcs.u8()),
});
const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)));
const id = SealIdentity.serialize({ policyObjectId: sealPolicyId, nonce }).toHex();

const { encryptedObject } = await seal.encrypt({
  threshold: 1,
  packageId: CONSOLE_ORIGINAL_PACKAGE_ID,
  id,
  data: plaintextBytes, // Uint8Array
});
```

`encryptedObject` is the byte stream you upload next.

### 7. Upload — retry on `mirror_missing_grant`

```http
POST /api/v1/buckets/{bucketId}/files
Content-Type: multipart/form-data

file=@<encryptedObject>
```

Standard multipart upload. The optional `name` field sets the file's
display name. The on-chain grant your key gets from Finalize needs a few
seconds to land in Console's ACL indexer. Until then this endpoint returns
`403` with `code: "mirror_missing_grant"`. Retry every ~3 seconds. Up to
20 attempts is enough in practice. Once the grant mirrors, the response
is `202` with `data.id`.

The first `GET /api/v1/buckets/{bucketId}` after Finalize can return the
same `403 mirror_missing_grant`. Retry it the same way.

### 8. Poll status

```http
GET /api/v1/buckets/{bucketId}/files/{fileId}/status
```

Returns `{ "data": { "state": "queued" | "active" | "completed" | "failed" } }`.
Poll every second or two until `state === "completed"`. Typical completion is
under 30 seconds.

### 9. Download → decrypt locally

```http
GET /api/v1/buckets/{bucketId}/files/{fileId}/download
```

**Follow redirects.** On deployments that serve user content from its own
hostname, this answers `307` to that host rather than returning bytes, so use
`curl -L` or an HTTP client with redirects enabled. The redirect target is
single-use and short-lived. Mint your own with `POST .../download-url` if you
need a link that lasts.

Returns the raw **Seal ciphertext**. Decrypt with `@mysten/seal` by
building the bucket's `seal_approve` access-check PTB (signed by your
service key via a `SessionKey`) and feeding both the ciphertext and the
PTB to `SealClient.decrypt`:

```ts
import { EncryptedObject, SealClient, SessionKey } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';

// Mainnet row of the Networks table again. Swap in the testnet row for staging.
// Latest Console bucket-policy package — host of the `seal_approve` move call.
const CONSOLE_LATEST_PACKAGE_ID =
  '0xb8d5b1cade7917190c47b8abfc789f527389fc021a8963c22755bcc1b539786c';
// Shared BucketRegistry — `seal_approve` reads its pause + version state.
const CONSOLE_BUCKET_REGISTRY_ID =
  '0x871f3d0341f36101ff0b30cd01dbe363f8d89d7f004df80e8084752d2f496958';

const { secretKey } = decodeSuiPrivateKey(process.env.CONSOLE_SERVICE_PRIVATE_KEY);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);

// ciphertext = bytes from GET /download
const parsed = EncryptedObject.parse(ciphertext);
const idBytes = fromHex(parsed.id.startsWith('0x') ? parsed.id : '0x' + parsed.id);

// 1. Build the access-check PTB (TransactionKind only — never broadcast).
const tx = new Transaction();
tx.moveCall({
  target: `${CONSOLE_LATEST_PACKAGE_ID}::bucket_policy::seal_approve`,
  arguments: [
    tx.pure.vector('u8', idBytes),
    tx.object(CONSOLE_BUCKET_REGISTRY_ID),
    tx.object(sealPolicyId),
  ],
});
const txBytes = await tx.build({ client: sui, onlyTransactionKind: true });

// 2. SessionKey lets Seal key servers verify the caller without re-signing per request.
const sessionKey = await SessionKey.create({
  address: keypair.toSuiAddress(),
  packageId: CONSOLE_ORIGINAL_PACKAGE_ID,
  ttlMin: 10,
  suiClient: sui,
  signer: keypair,
});

// 3. Decrypt — SealClient fetches the key share through Console's proxy
//    (same `seal` client as step 6) and reconstructs the DEK locally.
const plaintext = await seal.decrypt({ data: ciphertext, sessionKey, txBytes });
```

Console's API surface stops at the ciphertext byte stream. The only decrypt
traffic that touches Console is the `fetch_key` proxy call, which Console
relays to the Seal aggregator without reading the result. The DEK is
reconstructed and the plaintext decrypted on your side.

### 10. Optional — mint a signed download URL

To hand the ciphertext to a client that holds no API key, mint a short-lived
signed link instead of proxying the bytes yourself:

```http
POST /api/v1/buckets/{bucketId}/files/{fileId}/download-url
Content-Type: application/json

{ "ttl": 900 }
```

Response (`200`): `{ "data": { "download_url": "/downloads/v1.…", "expires_at": "…" } }`.

The `download_url` is a relative path on the API host. Redeeming it requires
**no auth header** — the signed token in the path is the credential — and it
stops working at `expires_at`. The body is optional; the requested `ttl`
(seconds) is clamped to the space plan's cap (free: 15 minutes). Mints are
rate-limited per space and per API key. The redeemed bytes are still Seal
ciphertext — decryption stays client-side, exactly as in step 9.

### 11. Clean up — delete the file, then the bucket

```http
DELETE /api/v1/buckets/{bucketId}/files/{fileId}
DELETE /api/v1/buckets/{bucketId}?confirm=true
```

Both return `204`. The file delete is an asynchronous soft-delete, so the
bucket can still report files for a few seconds. Until then, the bucket
delete returns `400` with `code: "bucket_not_empty"` and a `file_count`.
Retry it every ~3 seconds. The `confirm=true` query param is required. To
delete a bucket together with the files still in it, add
`&deleteContents=true`; set it only when the person deleting has agreed to
lose those files.

Buckets count toward a per-space cap. When you reach it, reserve returns
`422` with `code: "plan_limit_exceeded"`. Delete the buckets you do not
need, then reserve again.

---

## 3. When a key stops working

A key that stops authenticating gets a `401` whose `code` says why:

| `code` | What happened | What to do |
|---|---|---|
| `api_key_revoked` | The key was revoked. | Create a new key in Console. |
| `api_key_rotation_incomplete` | The key was revoked by a rotation that did not finish. | Create a new key in Console. |
| `api_key_replaced` | The key was rotated and a new key replaces it. | Install the new `hbr_…` key and service private key. |

Rotating revokes the old key before the new one is shown, so there is no window
where both work. Anything using the old key is down from the moment it is revoked
until the new key is installed.

---

## 4. Filing issues

Open an issue at
**[github.com/MystenLabs/walrus-console-quickstart/issues/new/choose](https://github.com/MystenLabs/walrus-console-quickstart/issues/new/choose)**
and pick **Bug**, **Feature request** or **Documentation**. The form asks for
what it needs. For an API error, include:

- The endpoint and HTTP method
- The HTTP status and the `code` field from the error response (if any)
- The network (mainnet or testnet)

Never paste a private key, mnemonic or API key into an issue. Report security
issues by email to security@mystenlabs.com, not on GitHub.

For the full machine-readable surface, see
[`openapi.yaml`](openapi.yaml) (curated, Bearer-only,
19 operations on 14 paths).
