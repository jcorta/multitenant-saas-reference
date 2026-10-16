import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const dir = '.keys';
if (existsSync(`${dir}/jwt-private.pem`)) {
  console.log('Keys already exist in .keys/; nothing to do.');
  process.exit(0);
}
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/jwt-private.pem`, privateKey.export({ type: 'pkcs8', format: 'pem' }));
writeFileSync(`${dir}/jwt-public.pem`, publicKey.export({ type: 'spki', format: 'pem' }));
console.log('Generated RS256 key pair in .keys/');
