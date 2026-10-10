import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '../shared/types.js';
import { pool } from './db.js';
import { DomainError } from './errors.js';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'uhishange_session';
export type AuthRequest = Request & { user?: User };
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function safeUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    isAdmin: row.is_admin as boolean,
  };
}
function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export async function createSession(userId: string, res: Response): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '7 days')",
    [tokenHash(token), userId],
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 7 * 86400000,
    path: '/',
  });
}
export async function removeSession(req: Request, res: Response): Promise<void> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string')
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
export async function loadSession(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length < 200) {
      const result = await pool.query(
        'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp()',
        [tokenHash(token)],
      );
      if (result.rowCount) req.user = safeUser(result.rows[0]);
    }
    next();
  } catch (error) {
    next(error);
  }
}
export function requireUser(req: AuthRequest): User {
  if (!req.user) throw new DomainError(401, 'UNAUTHENTICATED', 'Palun logi sisse.');
  return req.user;
}
export function requireAdmin(req: AuthRequest): User {
  const user = requireUser(req);
  if (!user.isAdmin)
    throw new DomainError(403, 'FORBIDDEN', 'See tegevus on lubatud ainult haldurile.');
  return user;
}
