import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const [salt, expected] = hash.split(':');
  const key = (await derive(password, salt!, 64)) as Buffer;
  const stored = Buffer.from(expected!, 'hex');
  return stored.length === key.length && timingSafeEqual(stored, key);
}
