export const API_BASE = 'https://api.testnet.console.walrus.xyz';

export const SUI_NETWORK = 'testnet' as const;
export const FULLNODE_URL = 'https://fullnode.testnet.sui.io:443';

// Original/canonical published id of Console's bucket-policy package.
// Used by Seal for encrypt + SessionKey identity derivation (must NOT change on upgrade).
export const ORIGINAL_PACKAGE_ID =
  '0xf9b261d4c0dbcf845d79f864e85581f9686fd6de9f4770ba1d77489d67f7833c';

// Latest published id of Console's bucket-policy package.
// Used as the moveCall target for `seal_approve` during decrypt.
export const LATEST_PACKAGE_ID =
  '0xf9b261d4c0dbcf845d79f864e85581f9686fd6de9f4770ba1d77489d67f7833c';

// Shared BucketRegistry object — required second argument of `seal_approve`
export const BUCKET_REGISTRY_ID =
  '0x902841af0cd25c5f8dee4980fe2942687c9ca80db56d77ff67a4ba6d9d97b9cf';

export const SEAL_THRESHOLD = 2;

// Public 3-server testnet Seal set documented in QUICKSTART.md.
export const SEAL_KEY_SERVER_OBJECT_IDS = [
  '0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2',
  '0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2',
  '0x9c949e53c36ab7a9c484ed9e8b43267a77d4b8d70e79aa6b39042e3d4c434105',
];

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
