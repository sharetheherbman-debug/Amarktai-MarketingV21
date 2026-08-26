import crypto from 'crypto';
import { query } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { openSecrets, sealSecrets } from './external-platform.service';
import * as social from './social-publishing.service';

type Json = Record<string, any>;
type OAuthContract = {
  authorizationUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  scopes: string[];
  pkce: boolean;
  clientIdParameter?: 'client_id' | 'client_key';
  scopeSeparator?: ' ' | ',';
};

const CONTRACTS: Record<string, OAuthContract> = {
  facebook: { authorizationUrl: 'https://www.facebook.com/v25.0/dialog/oauth', tokenUrl: 'https://graph.facebook.com/v25.0/oauth/access_token', clientIdEnv: 'META_OAUTH_CLIENT_ID', clientSecretEnv: 'META_OAUTH_CLIENT_SECRET', scopes: ['pages_show_list','pages_read_engagement','pages_manage_posts'], pkce: false },
  instagram: { authorizationUrl: 'https://www.facebook.com/v25.0/dialog/oauth', tokenUrl: 'https://graph.facebook.com/v25.0/oauth/access_token', clientIdEnv: 'META_OAUTH_CLIENT_ID', clientSecretEnv: 'META_OAUTH_CLIENT_SECRET', scopes: ['pages_show_list','instagram_basic','instagram_content_publish'], pkce: false },
  threads: { authorizationUrl: 'https://threads.net/oauth/authorize', tokenUrl: 'https://graph.threads.net/oauth/access_token', clientIdEnv: 'THREADS_OAUTH_CLIENT_ID', clientSecretEnv: 'THREADS_OAUTH_CLIENT_SECRET', scopes: ['threads_basic','threads_content_publish'], pkce: false },
  linkedin: { authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization', tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken', clientIdEnv: 'LINKEDIN_OAUTH_CLIENT_ID', clientSecretEnv: 'LINKEDIN_OAUTH_CLIENT_SECRET', scopes: ['openid','profile','w_member_social'], pkce: false },
  x: { authorizationUrl: 'https://twitter.com/i/oauth2/authorize', tokenUrl: 'https://api.x.com/2/oauth2/token', clientIdEnv: 'X_OAUTH_CLIENT_ID', clientSecretEnv: 'X_OAUTH_CLIENT_SECRET', scopes: ['tweet.read','tweet.write','users.read','offline.access'], pkce: true },
  youtube: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID', clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET', scopes: ['openid','profile','https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'], pkce: false },
  pinterest: { authorizationUrl: 'https://www.pinterest.com/oauth/', tokenUrl: 'https://api.pinterest.com/v5/oauth/token', clientIdEnv: 'PINTEREST_OAUTH_CLIENT_ID', clientSecretEnv: 'PINTEREST_OAUTH_CLIENT_SECRET', scopes: ['user_accounts:read','pins:read','pins:write','boards:read'], pkce: false },
  reddit: { authorizationUrl: 'https://www.reddit.com/api/v1/authorize', tokenUrl: 'https://www.reddit.com/api/v1/access_token', clientIdEnv: 'REDDIT_OAUTH_CLIENT_ID', clientSecretEnv: 'REDDIT_OAUTH_CLIENT_SECRET', scopes: ['identity','submit','read'], pkce: false },
  tiktok: { authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize/', tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/', clientIdEnv: 'TIKTOK_OAUTH_CLIENT_KEY', clientSecretEnv: 'TIKTOK_OAUTH_CLIENT_SECRET', scopes: ['user.info.basic','video.publish','video.upload'], pkce: false, clientIdParameter: 'client_key', scopeSeparator: ',' },
};

function hash(value: string): string { return crypto.createHash('sha256').update(value).digest('hex'); }
function pkceChallenge(value: string): string { return crypto.createHash('sha256').update(value).digest('base64url'); }
function base64url(bytes = 32): string { return crypto.randomBytes(bytes).toString('base64url'); }
function redirectUri(): string { return `${env.APP_URL.replace(/\/$/, '')}/connections/oauth`; }
function credentials(contract: OAuthContract): { clientId: string; clientSecret: string } {
  const clientId = String(process.env[contract.clientIdEnv] || '').trim();
  const clientSecret = String(process.env[contract.clientSecretEnv] || '').trim();
  if (!clientId || !clientSecret) throw new AppError(409, 'OAuth is not configured for this provider. Use its documented manual credential path or ask the deployment owner to configure the provider app.', 'SOCIAL_OAUTH_NOT_CONFIGURED');
  return { clientId, clientSecret };
}

export function listSocialOAuthProviders(): Array<{ platform: string; configured: boolean; reconnect_supported: boolean }> {
  return Object.entries(CONTRACTS).map(([platform, contract]) => ({
    platform,
    configured: Boolean(process.env[contract.clientIdEnv] && process.env[contract.clientSecretEnv]),
    reconnect_supported: true,
  }));
}

export async function beginSocialOAuth(input: { organizationId: string; userId: string; platform: string }): Promise<{ authorization_url: string; expires_at: string }> {
  const contract = CONTRACTS[input.platform];
  if (!contract) throw new AppError(400, 'This platform does not have an implemented OAuth contract; use its documented credential form.', 'SOCIAL_OAUTH_UNSUPPORTED');
  const { clientId } = credentials(contract);
  const state = base64url(36);
  const verifier = base64url(48);
  const challenge = pkceChallenge(verifier);
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await query(
    `INSERT INTO social_oauth_sessions (organization_id,user_id,platform,state_hash,secret_envelope,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [input.organizationId, input.userId, input.platform, hash(state), JSON.stringify(sealSecrets({ code_verifier: verifier })), expiresAt]
  );
  const url = new URL(contract.authorizationUrl);
  url.searchParams.set(contract.clientIdParameter || 'client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', contract.scopes.join(contract.scopeSeparator || ' '));
  url.searchParams.set('state', state);
  if (contract.pkce) { url.searchParams.set('code_challenge', challenge); url.searchParams.set('code_challenge_method', 'S256'); }
  if (input.platform === 'youtube') { url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent'); }
  if (input.platform === 'reddit') url.searchParams.set('duration', 'permanent');
  return { authorization_url: url.toString(), expires_at: expiresAt.toISOString() };
}

async function requestJson(url: string, init: RequestInit): Promise<Json> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  let payload: Json = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text.slice(0, 300) }; }
  if (!response.ok) throw new AppError(502, `Provider OAuth request failed (${response.status})`, 'SOCIAL_OAUTH_PROVIDER_FAILED');
  return payload;
}

async function discoverAccounts(platform: string, accessToken: string): Promise<{ publicAccounts: Json[]; accountTokens: Record<string, string> }> {
  let payload: Json;
  if (platform === 'facebook' || platform === 'instagram') {
    payload = await requestJson('https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token,instagram_business_account', { headers: { Authorization: `Bearer ${accessToken}` } });
    const pages = Array.isArray(payload.data) ? payload.data : [];
    const accountTokens: Record<string, string> = {};
    const publicAccounts = pages.flatMap((page: Json) => {
      const accountId = platform === 'instagram' ? String(page.instagram_business_account?.id || '') : String(page.id || '');
      if (!accountId) return [];
      if (page.access_token) accountTokens[accountId] = String(page.access_token);
      return [{ id: accountId, name: String(page.name || accountId), page_id: String(page.id || ''), platform }];
    });
    return { publicAccounts, accountTokens };
  }
  const endpoints: Record<string, string> = {
    threads: 'https://graph.threads.net/v1.0/me?fields=id,username', linkedin: 'https://api.linkedin.com/v2/userinfo',
    x: 'https://api.x.com/2/users/me', youtube: 'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',
    pinterest: 'https://api.pinterest.com/v5/user_account', reddit: 'https://oauth.reddit.com/api/v1/me',
    tiktok: 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',
  };
  payload = await requestJson(endpoints[platform], { headers: { Authorization: `Bearer ${accessToken}` } });
  if (platform === 'youtube') return { publicAccounts: (payload.items || []).map((item: Json) => ({ id: String(item.id), name: String(item.snippet?.title || item.id), platform })), accountTokens: {} };
  const raw = payload.data?.user || payload.data || payload;
  const id = String(raw.sub || raw.id || raw.open_id || raw.username || raw.name || '');
  if (!id) throw new AppError(502, 'Provider returned no selectable account identity', 'SOCIAL_OAUTH_ACCOUNT_MISSING');
  return { publicAccounts: [{ id, name: String(raw.name || raw.display_name || raw.username || raw.localizedFirstName || id), platform }], accountTokens: {} };
}

export async function exchangeSocialOAuth(input: { organizationId: string; userId: string; platform: string; state: string; code: string }): Promise<{ session_id: string; accounts: Json[] }> {
  const contract = CONTRACTS[input.platform];
  if (!contract) throw new AppError(400, 'OAuth provider is unsupported', 'SOCIAL_OAUTH_UNSUPPORTED');
  const { clientId, clientSecret } = credentials(contract);
  const session = (await query(
    `UPDATE social_oauth_sessions SET status='exchanging',updated_at=NOW()
      WHERE organization_id=$1 AND user_id=$2 AND platform=$3 AND state_hash=$4
        AND status='authorizing' AND consumed_at IS NULL AND expires_at>NOW()
      RETURNING *`,
    [input.organizationId, input.userId, input.platform, hash(input.state)]
  )).rows[0];
  if (!session) throw new AppError(409, 'OAuth state is invalid, expired, already used, or belongs to another workspace', 'SOCIAL_OAUTH_STATE_INVALID');
  const transient = openSecrets(session.secret_envelope);
  const body = new URLSearchParams({ grant_type: 'authorization_code', code: input.code, redirect_uri: redirectUri() });
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (['reddit', 'pinterest', 'x'].includes(input.platform)) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else if (input.platform === 'tiktok') {
    body.set('client_key', clientId);
    body.set('client_secret', clientSecret);
  } else {
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
  }
  if (input.platform === 'pinterest') body.set('continuous_refresh', 'true');
  if (contract.pkce) body.set('code_verifier', String(transient.code_verifier || ''));
  const token = await requestJson(contract.tokenUrl, { method: 'POST', headers, body });
  const accessToken = String(token.access_token || '');
  if (!accessToken) throw new AppError(502, 'Provider did not return an access token', 'SOCIAL_OAUTH_TOKEN_MISSING');
  const discovered = await discoverAccounts(input.platform, accessToken);
  if (discovered.publicAccounts.length === 0) throw new AppError(409, 'No eligible account, page, channel, or profile was returned by the provider', 'SOCIAL_OAUTH_NO_ACCOUNTS');
  const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null;
  await query(
    `UPDATE social_oauth_sessions SET status='selecting',accounts=$1,secret_envelope=$2,updated_at=NOW() WHERE id=$3`,
    [JSON.stringify(discovered.publicAccounts), JSON.stringify(sealSecrets({ access_token: accessToken, refresh_token: token.refresh_token || null, token_type: token.token_type || 'Bearer', expires_at: expiresAt, account_tokens: discovered.accountTokens })), session.id]
  );
  return { session_id: String(session.id), accounts: discovered.publicAccounts };
}

export async function completeSocialOAuth(input: { organizationId: string; userId: string; sessionId: string; accountId: string }): Promise<social.SocialConnection> {
  const session = (await query(
    `UPDATE social_oauth_sessions SET status='consuming',consumed_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND organization_id=$2 AND user_id=$3 AND status='selecting' AND consumed_at IS NULL AND expires_at>NOW()
      RETURNING *`,
    [input.sessionId, input.organizationId, input.userId]
  )).rows[0];
  if (!session) throw new AppError(409, 'OAuth account selection is invalid, expired, or already used', 'SOCIAL_OAUTH_SELECTION_INVALID');
  const accounts = Array.isArray(session.accounts) ? session.accounts : JSON.parse(String(session.accounts || '[]'));
  const account = accounts.find((item: Json) => String(item.id) === input.accountId);
  if (!account) throw new AppError(400, 'Selected account was not returned by this OAuth session', 'SOCIAL_OAUTH_ACCOUNT_INVALID');
  const secret = openSecrets(session.secret_envelope);
  const accountTokens = secret.account_tokens && typeof secret.account_tokens === 'object' ? secret.account_tokens as Record<string, string> : {};
  const accessToken = accountTokens[input.accountId] || String(secret.access_token || '');
  const connection = await social.addConnection(input.organizationId, String(session.platform), String(account.name || input.accountId), {
    account_id: input.accountId, page_id: account.page_id || undefined, api_version: ['facebook','instagram'].includes(String(session.platform)) ? 'v25.0' : undefined,
    oauth: { provider: session.platform, expires_at: secret.expires_at || null, refresh_supported: Boolean(secret.refresh_token), connected_at: new Date().toISOString() },
  }, { access_token: accessToken, refresh_token: secret.refresh_token || undefined });
  await query("UPDATE social_oauth_sessions SET status='completed',secret_envelope='{}'::jsonb,updated_at=NOW() WHERE id=$1", [session.id]);
  return connection;
}
