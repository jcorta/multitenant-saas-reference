import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppConfig } from '../config';
import { TokenService } from './token.service';

const T = '11111111-1111-4111-8111-111111111111';
const U = '33333333-3333-4333-8333-333333333333';

const pair = (() => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
})();

const config: AppConfig = {
  port: 0,
  webOrigin: 'http://localhost:3000',
  jwt: { ...pair, issuer: 'iss', audience: 'aud', accessTtlSeconds: 900, refreshTtlSeconds: 60 },
};

const service = new TokenService(
  new JwtService({
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    signOptions: { algorithm: 'RS256', expiresIn: 900, issuer: 'iss', audience: 'aud' },
    verifyOptions: { algorithms: ['RS256'], issuer: 'iss', audience: 'aud' },
  }),
  config,
);

const claims = { sub: U, tenant_id: T, role: 'owner' };

describe('TokenService', () => {
  it('round-trips an identity through a signed access token', async () => {
    const token = await service.signAccessToken({ userId: U, tenantId: T, role: 'owner' });
    expect(await service.verifyAccessToken(token)).toEqual({
      userId: U,
      tenantId: T,
      role: 'owner',
    });
  });

  it('puts no personal data in the token', async () => {
    const token = await service.signAccessToken({ userId: U, tenantId: T, role: 'staff' });
    expect(Object.keys(jwt.decode(token) as object).sort()).toEqual([
      'aud',
      'exp',
      'iat',
      'iss',
      'role',
      'sub',
      'tenant_id',
    ]);
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign(claims, pair.privateKey, {
      algorithm: 'RS256',
      issuer: 'iss',
      audience: 'aud',
      expiresIn: -10,
    });
    expect(await service.verifyAccessToken(token)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await service.signAccessToken({ userId: U, tenantId: T, role: 'staff' });
    const [h, , s] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...claims, role: 'owner', iss: 'iss', aud: 'aud', exp: 9999999999 }),
    ).toString('base64url');
    expect(await service.verifyAccessToken(`${h}.${forged}.${s}`)).toBeNull();
  });

  it('rejects tokens signed with another key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });
    const token = jwt.sign(claims, other, { algorithm: 'RS256', issuer: 'iss', audience: 'aud' });
    expect(await service.verifyAccessToken(token)).toBeNull();
  });

  it('rejects HS256 tokens signed with the public key as the secret', async () => {
    const token = jwt.sign(claims, pair.publicKey, {
      algorithm: 'HS256',
      issuer: 'iss',
      audience: 'aud',
    });
    expect(await service.verifyAccessToken(token)).toBeNull();
  });

  it('rejects unsigned tokens (alg none)', async () => {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const token = `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ ...claims, iss: 'iss', aud: 'aud' })}.`;
    expect(await service.verifyAccessToken(token)).toBeNull();
  });

  it('rejects wrong issuer, audience and malformed claims', async () => {
    const sign = (c: object, o: jwt.SignOptions = {}) =>
      jwt.sign(c, pair.privateKey, { algorithm: 'RS256', issuer: 'iss', audience: 'aud', ...o });
    expect(await service.verifyAccessToken(sign(claims, { issuer: 'evil' }))).toBeNull();
    expect(await service.verifyAccessToken(sign(claims, { audience: 'evil' }))).toBeNull();
    expect(await service.verifyAccessToken(sign({ ...claims, role: 'admin' }))).toBeNull();
    expect(
      await service.verifyAccessToken(sign({ ...claims, tenant_id: 'not-a-uuid' })),
    ).toBeNull();
  });

  it('generates distinct opaque refresh tokens and stores only a hash', () => {
    const a = service.newRefreshToken();
    const b = service.newRefreshToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).toBe(TokenService.hash(a.raw));
    expect(a.hash).not.toContain(a.raw);
  });
});
