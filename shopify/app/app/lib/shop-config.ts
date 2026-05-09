/**
 * Per-shop ShowAd configuration. Persists creator hash, API key, redirect
 * secret, protected paths, and access-policy serialization keyed on the
 * Shopify shop domain. Backed by Prisma + sqlite by default.
 *
 * SECURITY: API key + redirect secret are stored encrypted at rest if
 * SHOWAD_CONFIG_ENCRYPTION_KEY is set (recommended for production).
 */

import crypto from 'node:crypto';
import { prisma } from '../db.server';

export interface ShowAdShopConfig {
  shop: string;
  creatorHash: string;
  apiKey: string;
  redirectSecret: string;
  apiBaseUrl: string;
  videoAdUrl: string;
  protectedPaths: string[];
  excludedPaths: string[];
  cookieMaxAge: number;
  accessPolicyJson: string | null;
  updatedAt: Date;
}

const DEFAULT_API_BASE_URL = 'https://ad.proofmark.io';
const DEFAULT_VIDEO_AD_URL = 'https://showad.proofmark.io';

export async function getShopConfig(shop: string): Promise<ShowAdShopConfig | null> {
  const row = await prisma.showAdConfig.findUnique({ where: { shop } });
  if (!row) return null;
  return {
    shop: row.shop,
    creatorHash: row.creatorHash,
    apiKey: decryptIfNeeded(row.apiKey),
    redirectSecret: decryptIfNeeded(row.redirectSecret),
    apiBaseUrl: row.apiBaseUrl || DEFAULT_API_BASE_URL,
    videoAdUrl: row.videoAdUrl || DEFAULT_VIDEO_AD_URL,
    protectedPaths: parseList(row.protectedPaths),
    excludedPaths: parseList(row.excludedPaths),
    cookieMaxAge: row.cookieMaxAge,
    accessPolicyJson: row.accessPolicyJson,
    updatedAt: row.updatedAt,
  };
}

export interface UpsertShopConfigInput {
  shop: string;
  creatorHash: string;
  apiKey: string;
  redirectSecret: string;
  apiBaseUrl?: string;
  videoAdUrl?: string;
  protectedPaths?: string[];
  excludedPaths?: string[];
  cookieMaxAge?: number;
  accessPolicyJson?: string | null;
}

export async function upsertShopConfig(input: UpsertShopConfigInput): Promise<void> {
  const data = {
    shop: input.shop,
    creatorHash: input.creatorHash.trim(),
    apiKey: encryptIfNeeded(input.apiKey.trim()),
    redirectSecret: encryptIfNeeded(input.redirectSecret.trim()),
    apiBaseUrl: input.apiBaseUrl || DEFAULT_API_BASE_URL,
    videoAdUrl: input.videoAdUrl || DEFAULT_VIDEO_AD_URL,
    protectedPaths: serializeList(input.protectedPaths || []),
    excludedPaths: serializeList(input.excludedPaths || []),
    cookieMaxAge: input.cookieMaxAge ?? 3600,
    accessPolicyJson: input.accessPolicyJson ?? null,
  };
  await prisma.showAdConfig.upsert({
    where: { shop: input.shop },
    create: data,
    update: data,
  });
}

export function getShopFromQuery(searchParams: URLSearchParams): string | null {
  const shop = searchParams.get('shop');
  if (!shop) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) return null;
  return shop;
}

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function serializeList(items: string[]): string {
  return items.map((s) => s.trim()).filter(Boolean).join('\n');
}

function getEncryptionKey(): Buffer | null {
  const raw = process.env.SHOWAD_CONFIG_ENCRYPTION_KEY;
  if (!raw) return null;
  if (raw.length !== 64 || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error('SHOWAD_CONFIG_ENCRYPTION_KEY must be 32-byte hex (64 chars)');
  }
  return Buffer.from(raw, 'hex');
}

function encryptIfNeeded(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptIfNeeded(value: string): string {
  if (!value.startsWith('enc:v1:')) return value;
  const key = getEncryptionKey();
  if (!key) throw new Error('Encrypted config but no SHOWAD_CONFIG_ENCRYPTION_KEY set');
  const [, , ivHex, tagHex, encHex] = value.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf-8');
}

export function pathMatches(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchPath(pathname, pattern));
}

function matchPath(pathname: string, pattern: string): boolean {
  if (pattern === pathname) return true;
  if (pattern.includes('*')) {
    const regex = new RegExp(
      '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
    );
    return regex.test(pathname);
  }
  return false;
}
