# walrus-console-quickstart

Everything you need to start building on the **Console API**.

> **Alpha.** Console runs on Sui **mainnet** (default) and Sui **testnet** (staging, for
> QA and testing). Endpoint shapes can change before GA.

---

## What is Console?

Walrus Console is a developer-friendly web app and REST API for managing files on Walrus. 
Store, organize, and access data through familiar workflows, backed by durable and 
verifiable infrastructure. 
Files live in **buckets**, encrypted client-side with [Seal](https://github.com/MystenLabs/seal) and
stored on [Walrus](https://www.walrus.xyz/) — Console only ever holds ciphertext, never
your plaintext or decryption keys. Auth is a simple `Authorization: Bearer hbr_…` API
key minted in the web app; gas for on-chain steps is sponsored for you via Enoki.

If you can call a REST endpoint, you can build on Console.

> **Note.** Building directly on the REST API today means you orchestrate the client-side
> encryption yourself — the reserve → sign → finalize and Seal encrypt/decrypt steps you'll
> see in this quickstart. A TypeScript SDK to streamline building on Console (this
> orchestration included) is on the roadmap.

## Who this repo is for

- **Hackathon participants** following the live build-along — clone or fork this repo and
  code along.
- **Any developer** who wants the curated API surface (OpenAPI + Postman) and a copy-paste
  quickstart to integrate Console.

## What's in here

| Path                             | What it is                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`QUICKSTART.md`](QUICKSTART.md) | "Hello world" tour — sign up, create an encrypted bucket, upload + download a file. Start here. |
| [`openapi.yaml`](openapi.yaml)   | Curated OpenAPI spec — the public, Bearer-only API surface (13 endpoints).                      |
| [`postman/`](postman/)           | Ready-to-import Postman collection + environment for poking the API by hand.                    |
| [`app/`](app/)                   | TypeScript reference integration: curl walkthrough, helper CLIs, automated round-trip, Hono backend. |
| [`AGENTS.md`](AGENTS.md)         | Repo-level guidance for AI coding assistants (loaded by `CLAUDE.md`).                           |

## Quickstart

Prerequisites: a way to sign in to the web app to mint an API key — Google (via zkLogin)
is the quickest path; a Sui wallet also works — plus `curl`/Postman or Node.js. See
[`QUICKSTART.md`](QUICKSTART.md) for exact versions.

1. Sign in at **[console.walrus.xyz](https://console.walrus.xyz/)** —
   Google (via zkLogin) is the quickest path; a Sui wallet also works. Your account and a
   Personal Space are provisioned automatically. For the staging environment, sign in at
   [testnet.console.walrus.xyz](https://testnet.console.walrus.xyz/) instead. API keys are
   per network.
2. **Settings → API Keys → Create API Key**, pick **Read & Write**
   (`read_write`), and copy the `hbr_…` key — it is shown **once**.
3. Follow [`QUICKSTART.md`](QUICKSTART.md) to create a Seal-encrypted bucket and round-trip
   a file.

### Poke the API with Postman

Import the collection and one environment from [`postman/`](postman/) into Postman Desktop:

- `postman/console.postman_collection.json`
- `postman/console.postman_environment.json` (mainnet)
- `postman/console.testnet.postman_environment.json` (testnet)

Paste your `hbr_…` key into the `bearerToken` environment variable. `baseUrl` is
`https://api.console.walrus.xyz` in the mainnet environment and
`https://api.testnet.console.walrus.xyz` in the testnet one.

## Hosted docs

The same docs are served live from the API:

- OpenAPI viewer (Scalar): <https://api.console.walrus.xyz/docs/openapi>
- OpenAPI spec (raw): <https://api.console.walrus.xyz/openapi.yaml>
- Docs index: <https://api.console.walrus.xyz/docs>

The testnet API serves the same pages at `https://api.testnet.console.walrus.xyz`.

## Questions / issues

Open an issue: **[github.com/MystenLabs/walrus-console-quickstart/issues](https://github.com/MystenLabs/walrus-console-quickstart/issues)**

## License

See [LICENSE](LICENSE).
