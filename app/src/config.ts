// Per-network configuration. Console runs on Sui mainnet (production) and Sui
// testnet (staging, QA). Select one with `CONSOLE_NETWORK` in `.env`. The
// default is mainnet, which is where beta users are.
//
// Object ids come from the Console contract deployment records
// (`contract/DEPLOYMENTS.md` in the Console repo). Seal committee ids come
// from https://seal-docs.wal.app/Pricing#verified-decentralized-key-servers.

export type ConsoleNetwork = 'mainnet' | 'testnet';

export interface NetworkConfig {
  /** Console REST API host. */
  apiBase: string;
  /** Console web app, where API keys are minted. */
  webUrl: string;
  suiNetwork: ConsoleNetwork;
  fullnodeUrl: string;
  /**
   * Original/canonical published id of Console's bucket-policy package.
   * Used by Seal for encrypt + SessionKey identity derivation (must NOT change
   * on upgrade).
   */
  originalPackageId: string;
  /**
   * Latest published id of Console's bucket-policy package.
   * Used as the moveCall target for `seal_approve` during decrypt.
   */
  latestPackageId: string;
  /** Shared BucketRegistry object — required second argument of `seal_approve`. */
  bucketRegistryId: string;
  /**
   * Seal committee KeyServer object id for this network. One object stands for
   * the whole committee. Console's web app encrypts with the same object, so
   * files round-trip between this app and the web app.
   */
  sealCommitteeObjectId: string;
}

export const NETWORKS: Record<ConsoleNetwork, NetworkConfig> = {
  mainnet: {
    apiBase: 'https://api.console.walrus.xyz',
    webUrl: 'https://console.walrus.xyz',
    suiNetwork: 'mainnet',
    fullnodeUrl: 'https://fullnode.mainnet.sui.io:443',
    originalPackageId:
      '0xb8d5b1cade7917190c47b8abfc789f527389fc021a8963c22755bcc1b539786c',
    latestPackageId:
      '0xb8d5b1cade7917190c47b8abfc789f527389fc021a8963c22755bcc1b539786c',
    bucketRegistryId:
      '0x871f3d0341f36101ff0b30cd01dbe363f8d89d7f004df80e8084752d2f496958',
    sealCommitteeObjectId:
      '0x686098f1439237fff9f36b99c7329683c22979d2005c2465cb891acb012a7595',
  },
  testnet: {
    apiBase: 'https://api.testnet.console.walrus.xyz',
    webUrl: 'https://testnet.console.walrus.xyz',
    suiNetwork: 'testnet',
    fullnodeUrl: 'https://fullnode.testnet.sui.io:443',
    originalPackageId:
      '0xf9b261d4c0dbcf845d79f864e85581f9686fd6de9f4770ba1d77489d67f7833c',
    latestPackageId:
      '0xf9b261d4c0dbcf845d79f864e85581f9686fd6de9f4770ba1d77489d67f7833c',
    bucketRegistryId:
      '0x902841af0cd25c5f8dee4980fe2942687c9ca80db56d77ff67a4ba6d9d97b9cf',
    sealCommitteeObjectId:
      '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
  },
};

export const DEFAULT_NETWORK: ConsoleNetwork = 'mainnet';

export function resolveNetwork(raw: string | undefined): ConsoleNetwork {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return DEFAULT_NETWORK;
  if (value === 'mainnet' || value === 'testnet') return value;
  throw new Error(
    `Unsupported CONSOLE_NETWORK "${raw}". Use "mainnet" (default) or "testnet".`,
  );
}

export const CONSOLE_NETWORK: ConsoleNetwork = resolveNetwork(process.env.CONSOLE_NETWORK);
export const NETWORK: NetworkConfig = NETWORKS[CONSOLE_NETWORK];

// Seal key fetches go through Console's fetch_key proxy, not to the aggregator
// directly. The proxy authenticates the `Bearer hbr_…` API key, adds the
// aggregator credential server-side, and relays the response. The SDK appends
// `/v1/fetch_key` to this URL.
export function sealAggregatorUrl(network: NetworkConfig = NETWORK): string {
  return `${network.apiBase}/api/v1/seal/aggregator`;
}

// One committee entry with weight 1, so the client-side threshold is 1. The
// real threshold is enforced inside the committee (testnet 3-of-5, mainnet
// 5-of-8).
export const SEAL_THRESHOLD = 1;

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var: ${name}. Copy .env.example to .env and fill it in, ` +
        `or run via the pnpm scripts (which load .env automatically).`,
    );
  }
  return v;
}
