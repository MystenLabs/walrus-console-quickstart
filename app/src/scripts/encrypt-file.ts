import { readFile, writeFile } from 'node:fs/promises';
import { requireEnv } from '../config.js';
import { encryptBytes, makeSealClient, makeSuiClient } from '../lib/seal.js';

const [, , plaintextPath, sealPolicyId] = process.argv;
if (!plaintextPath || !sealPolicyId) {
  throw new Error('Usage: pnpm encrypt-file <plaintextPath> <sealPolicyId>');
}

const suiClient = makeSuiClient();
const seal = makeSealClient(suiClient, requireEnv('CONSOLE_API_KEY'));

const plaintext = await readFile(plaintextPath);
const ciphertext = await encryptBytes(seal, sealPolicyId, plaintext);

const outPath = `${plaintextPath}.enc`;
await writeFile(outPath, ciphertext);
console.log(`Encrypted ${plaintext.byteLength} → ${ciphertext.byteLength} bytes → ${outPath}`);
