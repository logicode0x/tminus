// The studio's settings, from the environment. The platform numbers are the spec's placeholders (§8) until the owner sets them.
import { PublicKey } from '@solana/web3.js';
import { keypairFrom } from './solana/chain.mjs';

const LAMPORTS = 1_000_000_000;
const solToLamports = (text, name) => {
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a number of SOL`);
  return BigInt(Math.round(n * LAMPORTS));
};
const pct = (text, name, max = 100) => {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${name} must be a whole percent from 0 to ${max}`);
  return n;
};

/** The product name shown everywhere (the owner named it Meteor on 2026-10-16 and renamed it T-minus on 2026-10-17; BRAND_NAME overrides). */
export const DEFAULT_BRAND = 'T-minus';

/**
 * `{ rpcUrl, rpcRps, origin, port, dataDir, database, studioWallet, platform, storage, s3, lookupTable, adminToken, brand, cranks, priorityMicroLamports,
 *  jupiter, coingeckoKey }`. `coingeckoKey` (COINGECKO_API_KEY): a paid CoinGecko key for the token pages' market data (src/market.mjs).
 * `database` is DATABASE_URL (Postgres, on Railway) or a SQLite path.
 * `platform` is `{ wallet, curveSharePct, poolCreationFeeLamports, graduatedLiquidityPct, plainPoolFeeLamports }`.
 * `jupiter` is `{ apiUrl, apiKey, referralAccount, feeBps }` for buying and selling (src/trade.mjs): the studio's fee on each trade is `feeBps`
 * (TRADE_FEE_BPS, Jupiter allows 50 to 255) once JUPITER_REFERRAL_ACCOUNT, its Jupiter referral account, is set.
 */
export function loadConfig(env = process.env) {
  if (!env.SOLANA_RPC_URL) throw new Error('SOLANA_RPC_URL is required');
  const studioWallet = env.STUDIO_WALLET_KEY ? keypairFrom(env.STUDIO_WALLET_KEY) : null;
  const walletText = env.PLATFORM_WALLET || studioWallet?.publicKey.toBase58();
  if (!walletText) throw new Error('PLATFORM_WALLET is required (or STUDIO_WALLET_KEY)');
  let wallet;
  try { wallet = new PublicKey(walletText); } catch { throw new Error('PLATFORM_WALLET is not a Solana address'); }
  const platform = Object.freeze({
    wallet,
    curveSharePct: pct(env.PLATFORM_CURVE_SHARE_PCT ?? '10', 'PLATFORM_CURVE_SHARE_PCT'),
    poolCreationFeeLamports: solToLamports(env.PLATFORM_POOL_CREATION_FEE_SOL ?? '0', 'PLATFORM_POOL_CREATION_FEE_SOL'),
    graduatedLiquidityPct: pct(env.PLATFORM_GRADUATED_LIQUIDITY_PCT ?? '10', 'PLATFORM_GRADUATED_LIQUIDITY_PCT', 50),
    plainPoolFeeLamports: solToLamports(env.PLATFORM_PLAIN_POOL_FEE_SOL ?? '0.1', 'PLATFORM_PLAIN_POOL_FEE_SOL'),
  });
  // DBC takes a pool creation fee of 0.001 SOL to 100 SOL, or none.
  if (platform.poolCreationFeeLamports && (platform.poolCreationFeeLamports < 1_000_000n || platform.poolCreationFeeLamports > 100_000_000_000n)) {
    throw new Error('PLATFORM_POOL_CREATION_FEE_SOL must be 0, or from 0.001 to 100 SOL');
  }
  const feeBps = Number(env.TRADE_FEE_BPS ?? 50);
  if (!Number.isInteger(feeBps) || feeBps < 50 || feeBps > 255) throw new Error('TRADE_FEE_BPS must be a whole number of basis points from 50 to 255 (Jupiter\'s range)');
  if (env.JUPITER_REFERRAL_ACCOUNT) { try { new PublicKey(env.JUPITER_REFERRAL_ACCOUNT); } catch { throw new Error('JUPITER_REFERRAL_ACCOUNT is not a Solana address'); } }
  const jupiter = Object.freeze({ apiUrl: (env.JUPITER_API_URL || 'https://api.jup.ag/swap/v2').replace(/\/+$/, ''), apiKey: env.JUPITER_API_KEY || null,
    referralAccount: env.JUPITER_REFERRAL_ACCOUNT || null, feeBps });
  // Railway gives the service's public domain; ORIGIN overrides it (a custom domain).
  const origin = (env.ORIGIN || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${env.PORT || 8787}`)).replace(/\/+$/, '');
  const dataDir = env.DATA_DIR || 'data';
  // The Railway bucket (its variables, referenced from the bucket service).
  const s3 = env.S3_BUCKET && env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? { endpoint: env.S3_ENDPOINT, name: env.S3_BUCKET, accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY, region: env.S3_REGION || 'auto' } : null;
  let storage = env.STORAGE === 'turbo' ? 'arweave' : env.STORAGE || (studioWallet ? 'arweave' : s3 ? 'bucket' : 'local');
  if (!['arweave', 'bucket', 'local'].includes(storage)) throw new Error('STORAGE must be arweave, bucket or local');
  if (storage === 'arweave' && !studioWallet) throw new Error('STORAGE=arweave needs STUDIO_WALLET_KEY (it signs the uploads)');
  if (storage === 'bucket' && !s3) throw new Error('STORAGE=bucket needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY');
  return Object.freeze({
    rpcUrl: env.SOLANA_RPC_URL, rpcRps: Number(env.SOLANA_RPC_RPS || 10), origin, port: Number(env.PORT || 8787), dataDir,
    database: env.DATABASE_URL || env.DB_PATH || `${dataDir}/studio.db`, studioWallet, platform, storage, s3,
    lookupTable: env.STUDIO_LOOKUP_TABLE || null,
    turboUrl: env.TURBO_UPLOAD_URL || 'https://upload.ardrive.io', adminToken: env.ADMIN_TOKEN || null,
    brand: env.BRAND_NAME || DEFAULT_BRAND, googleSiteVerification: env.GOOGLE_SITE_VERIFICATION || null, bingSiteVerification: env.BING_SITE_VERIFICATION || null, cranks: env.CRANKS !== 'off' && !!studioWallet,
    crankIntervalMs: Number(env.CRANK_INTERVAL_SEC || 60) * 1000,
    priorityMicroLamports: env.PRIORITY_MICROLAMPORTS != null ? Number(env.PRIORITY_MICROLAMPORTS) : null, jupiter,
    coingeckoKey: env.COINGECKO_API_KEY || null,
    // Referral links (src/referrals.mjs): the referrer's share of what T-minus earns from a launch, in percent (0 to 50), and whether the
    // server pays balances out by itself (on with the cranks unless REFERRAL_PAYOUTS=off).
    referralSharePct: Math.min(50, Math.max(0, Number(env.REFERRAL_SHARE_PCT ?? 30) || 0)), referralPayouts: env.REFERRAL_PAYOUTS !== 'off' && env.CRANKS !== 'off' && !!studioWallet,
    // PostHog analytics (web/analytics.mjs): the project's public key (phc_…) and its host, EU cloud unless set; off without a key.
    analytics: /^phc_[A-Za-z0-9]{20,}$/.test(env.POSTHOG_KEY ?? '')
      ? { key: env.POSTHOG_KEY, host: /^https:\/\/[a-z0-9.-]+$/.test(env.POSTHOG_HOST ?? '') ? env.POSTHOG_HOST : 'https://eu.i.posthog.com' } : null,
  });
}
