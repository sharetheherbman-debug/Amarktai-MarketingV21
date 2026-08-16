import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { safeFetch, validatePublicHttpUrl } from '../utils/safe-fetch';
import type { ExternalConnectionConfig, SocialPublishInput, SocialPublishResult } from './external-platform.service';

export type ExtendedSocialPlatform = 'tiktok' | 'bluesky' | 'mastodon' | 'telegram' | 'linkedin';

export interface SocialMetricResult {
  metrics: Record<string, number>;
  raw: Record<string, unknown>;
  resolvedExternalId?: string;
  externalUrl?: string;
  pending?: boolean;
}

function requiredString(value: unknown, name: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new AppError(400, `${name} is required`, 'SOCIAL_CONFIG_ERROR');
  return text;
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return fallback;
}

function joinedBody(input: SocialPublishInput): string {
  const tags = input.hashtags.filter(Boolean).join(' ');
  return tags ? `${input.body}\n\n${tags}` : input.body;
}

async function readJson(response: Awaited<ReturnType<typeof safeFetch>>): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, any>; }
  catch { return { text }; }
}

async function jsonRequest(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30000,
  maxResponseBytes = 5 * 1024 * 1024
): Promise<{ data: Record<string, any>; headers: Headers; status: number }> {
  const response = await safeFetch(url, { ...init, timeoutMs, maxResponseBytes });
  const data = await readJson(response);
  if (!response.ok) {
    const detail = data.error ? JSON.stringify(data.error) : String(data.message || data.text || `HTTP ${response.status}`);
    throw new AppError(response.status, `Social provider request failed: ${detail}`, 'SOCIAL_PROVIDER_ERROR');
  }
  return { data, headers: response.headers, status: response.status };
}

async function fetchApprovedMedia(url: string, maxBytes = 25 * 1024 * 1024): Promise<{ bytes: Uint8Array; contentType: string }> {
  await validatePublicHttpUrl(url);
  const response = await safeFetch(url, {
    timeoutMs: 120000,
    maxResponseBytes: maxBytes,
    headers: { Accept: 'image/*,video/*,application/octet-stream;q=0.8,*/*;q=0.5' },
  });
  if (!response.ok) throw new AppError(response.status, 'Approved social media URL could not be downloaded', 'MEDIA_DOWNLOAD_ERROR');
  const contentType = String(response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
  return { bytes: await response.bytes(), contentType };
}

function looksLikeVideo(url: string, config: ExternalConnectionConfig): boolean {
  const explicit = optionalString(config.media_kind || config.content_kind).toLowerCase();
  if (explicit === 'video') return true;
  if (explicit === 'image' || explicit === 'photo') return false;
  try { return /\.(mp4|mov|m4v|webm)(?:$|\?)/i.test(new URL(url).pathname); }
  catch { return false; }
}

function bearer(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function tiktokCreatorInfo(token: string): Promise<Record<string, any>> {
  const { data } = await jsonRequest('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: bearer(token, { 'Content-Type': 'application/json; charset=UTF-8' }),
    body: '{}',
  });
  if (data.error && String(data.error.code || 'ok') !== 'ok') {
    throw new AppError(400, `TikTok creator-info rejected the connection: ${String(data.error.message || data.error.code)}`, 'SOCIAL_CONNECTION_FAILED');
  }
  return data.data || data;
}

async function testTikTok(credentials: Record<string, unknown>): Promise<Record<string, unknown>> {
  return tiktokCreatorInfo(requiredString(credentials.access_token, 'access_token'));
}

async function publishTikTok(
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const token = requiredString(credentials.access_token, 'access_token');
  if (!booleanValue(config.creator_consent_confirmed)) {
    throw new AppError(409, 'TikTok creator consent must be confirmed immediately before enabling Direct Post', 'TIKTOK_CREATOR_CONSENT_REQUIRED');
  }
  if (input.mediaUrls.length < 1 || input.mediaUrls.length > 35) {
    throw new AppError(400, 'TikTok requires 1-35 approved media URLs', 'SOCIAL_MEDIA_REQUIRED');
  }
  for (const url of input.mediaUrls) await validatePublicHttpUrl(url);

  const creator = await tiktokCreatorInfo(token);
  const privacyOptions = Array.isArray(creator.privacy_level_options) ? creator.privacy_level_options.map(String) : [];
  const requestedPrivacy = optionalString(config.privacy_level) || (privacyOptions.includes('SELF_ONLY') ? 'SELF_ONLY' : privacyOptions[0]);
  if (!requestedPrivacy || (privacyOptions.length > 0 && !privacyOptions.includes(requestedPrivacy))) {
    throw new AppError(409, 'Configured TikTok privacy level is not currently permitted for this creator', 'TIKTOK_PRIVACY_UNAVAILABLE');
  }

  const message = joinedBody(input);
  const brandOrganic = config.brand_organic_toggle === undefined ? true : booleanValue(config.brand_organic_toggle);
  const brandContent = booleanValue(config.brand_content_toggle, false);
  const isVideo = input.mediaUrls.length === 1 && looksLikeVideo(input.mediaUrls[0], config);
  let response: { data: Record<string, any>; headers: Headers; status: number };

  if (isVideo) {
    response = await jsonRequest('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: bearer(token, { 'Content-Type': 'application/json; charset=UTF-8' }),
      body: JSON.stringify({
        post_info: {
          title: message.slice(0, 2200),
          privacy_level: requestedPrivacy,
          disable_duet: booleanValue(config.disable_duet),
          disable_comment: booleanValue(config.disable_comment),
          disable_stitch: booleanValue(config.disable_stitch),
          brand_content_toggle: brandContent,
          brand_organic_toggle: brandOrganic,
          is_aigc: config.is_aigc === undefined ? true : booleanValue(config.is_aigc),
        },
        source_info: { source: 'PULL_FROM_URL', video_url: input.mediaUrls[0] },
      }),
    });
  } else {
    response = await jsonRequest('https://open.tiktokapis.com/v2/post/publish/content/init/', {
      method: 'POST',
      headers: bearer(token, { 'Content-Type': 'application/json; charset=UTF-8' }),
      body: JSON.stringify({
        media_type: 'PHOTO',
        post_mode: 'DIRECT_POST',
        post_info: {
          title: String(config.title || input.body).slice(0, 90),
          description: message.slice(0, 4000),
          privacy_level: requestedPrivacy,
          disable_comment: booleanValue(config.disable_comment),
          auto_add_music: booleanValue(config.auto_add_music),
          brand_content_toggle: brandContent,
          brand_organic_toggle: brandOrganic,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          photo_images: input.mediaUrls,
          photo_cover_index: Math.max(0, Math.min(Number(config.photo_cover_index || 0), input.mediaUrls.length - 1)),
        },
      }),
    });
  }

  if (response.data.error && String(response.data.error.code || 'ok') !== 'ok') {
    throw new AppError(400, `TikTok Direct Post rejected the request: ${String(response.data.error.message || response.data.error.code)}`, 'SOCIAL_PUBLISH_FAILED');
  }
  const publishId = requiredString(response.data.data?.publish_id || response.data.publish_id, 'TikTok publish_id');
  return {
    externalId: publishId,
    raw: { provider: 'tiktok', submission_pending: true, creator, response: response.data, media_kind: isVideo ? 'video' : 'photo' },
  };
}

interface BlueskySession { accessJwt: string; did: string; handle: string; pds: string }

async function blueskySession(credentials: Record<string, unknown>, config: ExternalConnectionConfig): Promise<BlueskySession> {
  const pds = (optionalString(config.pds_url) || 'https://bsky.social').replace(/\/$/, '');
  await validatePublicHttpUrl(pds);
  const accessJwt = optionalString(credentials.access_token || credentials.access_jwt);
  const did = optionalString(config.did || credentials.did);
  const handle = optionalString(config.handle || credentials.identifier);
  if (accessJwt && did) return { accessJwt, did, handle: handle || did, pds };

  const identifier = requiredString(credentials.identifier || config.handle, 'identifier');
  const password = requiredString(credentials.app_password || credentials.password, 'app_password');
  const { data } = await jsonRequest(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  return {
    accessJwt: requiredString(data.accessJwt, 'Bluesky accessJwt'),
    did: requiredString(data.did, 'Bluesky did'),
    handle: optionalString(data.handle) || identifier,
    pds,
  };
}

async function testBluesky(credentials: Record<string, unknown>, config: ExternalConnectionConfig): Promise<Record<string, unknown>> {
  const session = await blueskySession(credentials, config);
  const { data } = await jsonRequest(`${session.pds}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(session.did)}`, {
    headers: bearer(session.accessJwt),
  });
  return { did: session.did, handle: session.handle, profile: data };
}

async function publishBluesky(
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const session = await blueskySession(credentials, config);
  if (input.mediaUrls.length > 4) throw new AppError(400, 'Bluesky supports at most four images per post', 'SOCIAL_FORMAT_UNSUPPORTED');
  const images: Array<Record<string, unknown>> = [];
  for (let index = 0; index < input.mediaUrls.length; index++) {
    const media = await fetchApprovedMedia(input.mediaUrls[index], 2 * 1024 * 1024);
    if (!media.contentType.startsWith('image/')) throw new AppError(400, 'Bluesky media must be an image', 'SOCIAL_FORMAT_UNSUPPORTED');
    const upload = await safeFetch(`${session.pds}/xrpc/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: bearer(session.accessJwt, { 'Content-Type': media.contentType }),
      body: Buffer.from(media.bytes),
      timeoutMs: 30000,
      maxResponseBytes: 1024 * 1024,
    });
    const uploaded = await readJson(upload);
    if (!upload.ok || !uploaded.blob) throw new AppError(upload.status, 'Bluesky image upload failed', 'SOCIAL_PUBLISH_FAILED');
    images.push({ alt: String((config.alt_texts as string[] | undefined)?.[index] || ''), image: uploaded.blob });
  }
  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text: joinedBody(input).slice(0, 3000),
    createdAt: new Date().toISOString(),
  };
  if (images.length > 0) record.embed = { $type: 'app.bsky.embed.images', images };
  const { data } = await jsonRequest(`${session.pds}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: bearer(session.accessJwt, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }),
  });
  const uri = requiredString(data.uri, 'Bluesky post uri');
  const rkey = uri.split('/').pop() || '';
  return {
    externalId: uri,
    externalUrl: session.handle && rkey ? `https://bsky.app/profile/${encodeURIComponent(session.handle)}/post/${encodeURIComponent(rkey)}` : undefined,
    raw: data,
  };
}

async function mastodonBase(config: ExternalConnectionConfig): Promise<string> {
  const base = requiredString(config.base_url || config.instance_url, 'base_url').replace(/\/$/, '');
  const parsed = await validatePublicHttpUrl(base);
  if (parsed.protocol !== 'https:') throw new AppError(400, 'Mastodon instance must use HTTPS', 'SOCIAL_CONFIG_ERROR');
  return base;
}

async function testMastodon(credentials: Record<string, unknown>, config: ExternalConnectionConfig): Promise<Record<string, unknown>> {
  const base = await mastodonBase(config);
  const token = requiredString(credentials.access_token, 'access_token');
  return (await jsonRequest(`${base}/api/v1/accounts/verify_credentials`, { headers: bearer(token) })).data;
}

async function publishMastodon(
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const base = await mastodonBase(config);
  const token = requiredString(credentials.access_token, 'access_token');
  if (input.mediaUrls.length > 4) throw new AppError(400, 'Mastodon supports at most four media attachments in this connector', 'SOCIAL_FORMAT_UNSUPPORTED');
  const mediaIds: string[] = [];
  for (let index = 0; index < input.mediaUrls.length; index++) {
    const media = await fetchApprovedMedia(input.mediaUrls[index]);
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(media.bytes)], { type: media.contentType }), `media-${index + 1}`);
    const alt = String((config.alt_texts as string[] | undefined)?.[index] || '');
    if (alt) form.append('description', alt.slice(0, 1500));
    const { data } = await jsonRequest(`${base}/api/v2/media`, { method: 'POST', headers: bearer(token), body: form }, 120000);
    mediaIds.push(requiredString(data.id, 'Mastodon media id'));
  }
  const body: Record<string, unknown> = {
    status: joinedBody(input),
    visibility: optionalString(config.visibility) || 'public',
    media_ids: mediaIds,
  };
  if (optionalString(config.language)) body.language = optionalString(config.language);
  const idempotency = crypto.createHash('sha256').update(JSON.stringify({ body: body.status, mediaIds })).digest('hex').slice(0, 48);
  const { data } = await jsonRequest(`${base}/api/v1/statuses`, {
    method: 'POST',
    headers: bearer(token, { 'Content-Type': 'application/json', 'Idempotency-Key': idempotency }),
    body: JSON.stringify(body),
  });
  return { externalId: requiredString(data.id, 'Mastodon status id'), externalUrl: optionalString(data.url) || undefined, raw: data };
}

function telegramEndpoint(token: string, method: string): string {
  if (!/^[0-9]{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new AppError(400, 'Telegram bot_token format is invalid', 'SOCIAL_CREDENTIALS_REQUIRED');
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function telegramCall(token: string, method: string, body: Record<string, unknown>): Promise<Record<string, any>> {
  const { data } = await jsonRequest(telegramEndpoint(token, method), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (data.ok !== true) throw new AppError(400, `Telegram ${method} failed`, 'SOCIAL_PROVIDER_ERROR');
  return data.result || data;
}

async function testTelegram(credentials: Record<string, unknown>, config: ExternalConnectionConfig): Promise<Record<string, unknown>> {
  const token = requiredString(credentials.bot_token, 'bot_token');
  const bot = await telegramCall(token, 'getMe', {});
  const chatId = optionalString(config.chat_id);
  const chat = chatId ? await telegramCall(token, 'getChat', { chat_id: chatId }) : null;
  return { bot, chat };
}

async function publishTelegram(
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const token = requiredString(credentials.bot_token, 'bot_token');
  const chatId = requiredString(config.chat_id, 'chat_id');
  const text = joinedBody(input);
  for (const url of input.mediaUrls) await validatePublicHttpUrl(url);
  let result: Record<string, any>;
  if (input.mediaUrls.length === 0) {
    result = await telegramCall(token, 'sendMessage', { chat_id: chatId, text: text.slice(0, 4096), disable_web_page_preview: false });
  } else if (input.mediaUrls.length === 1) {
    const video = looksLikeVideo(input.mediaUrls[0], config);
    result = await telegramCall(token, video ? 'sendVideo' : 'sendPhoto', {
      chat_id: chatId,
      [video ? 'video' : 'photo']: input.mediaUrls[0],
      caption: text.slice(0, 1024),
    });
  } else {
    if (input.mediaUrls.length > 10) throw new AppError(400, 'Telegram media groups support at most ten items', 'SOCIAL_FORMAT_UNSUPPORTED');
    result = await telegramCall(token, 'sendMediaGroup', {
      chat_id: chatId,
      media: input.mediaUrls.map((url, index) => ({
        type: looksLikeVideo(url, config) ? 'video' : 'photo',
        media: url,
        caption: index === 0 ? text.slice(0, 1024) : undefined,
      })),
    });
  }
  const primary = Array.isArray(result) ? result[0] : result;
  const messageId = requiredString(primary?.message_id !== undefined ? String(primary.message_id) : '', 'Telegram message_id');
  const username = optionalString(config.channel_username).replace(/^@/, '');
  return {
    externalId: messageId,
    externalUrl: username ? `https://t.me/${encodeURIComponent(username)}/${messageId}` : undefined,
    raw: { result },
  };
}

function linkedInHeaders(token: string, version: string, contentType = 'application/json'): Record<string, string> {
  return bearer(token, {
    'Content-Type': contentType,
    'LinkedIn-Version': version,
    'X-Restli-Protocol-Version': '2.0.0',
  });
}

async function linkedInUploadImage(token: string, author: string, version: string, url: string): Promise<string> {
  const media = await fetchApprovedMedia(url);
  if (!media.contentType.startsWith('image/')) throw new AppError(400, 'LinkedIn image post received non-image media', 'SOCIAL_FORMAT_UNSUPPORTED');
  const init = await jsonRequest('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST', headers: linkedInHeaders(token, version), body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
  });
  const value = init.data.value || {};
  const uploadUrl = requiredString(value.uploadUrl, 'LinkedIn image uploadUrl');
  const image = requiredString(value.image, 'LinkedIn image URN');
  const uploaded = await safeFetch(uploadUrl, {
    method: 'PUT',
    headers: bearer(token, { 'Content-Type': media.contentType }),
    body: Buffer.from(media.bytes),
    timeoutMs: 120000,
    maxResponseBytes: 1024 * 1024,
  });
  if (!uploaded.ok) throw new AppError(uploaded.status, 'LinkedIn image upload failed', 'SOCIAL_PUBLISH_FAILED');
  return image;
}

async function linkedInUploadVideo(token: string, author: string, version: string, url: string): Promise<string> {
  const media = await fetchApprovedMedia(url);
  if (!media.contentType.startsWith('video/')) throw new AppError(400, 'LinkedIn video post received non-video media', 'SOCIAL_FORMAT_UNSUPPORTED');
  const init = await jsonRequest('https://api.linkedin.com/rest/videos?action=initializeUpload', {
    method: 'POST',
    headers: linkedInHeaders(token, version),
    body: JSON.stringify({ initializeUploadRequest: { owner: author, fileSizeBytes: media.bytes.byteLength, uploadCaptions: false, uploadThumbnail: false } }),
  });
  const value = init.data.value || {};
  const video = requiredString(value.video, 'LinkedIn video URN');
  const uploadToken = optionalString(value.uploadToken);
  const instructions = Array.isArray(value.uploadInstructions) ? value.uploadInstructions as Array<Record<string, unknown>> : [];
  if (instructions.length === 0) throw new AppError(502, 'LinkedIn video initialization returned no upload instructions', 'SOCIAL_PROVIDER_ERROR');
  const uploadedPartIds: string[] = [];
  for (const instruction of instructions) {
    const first = Math.max(0, Number(instruction.firstByte || 0));
    const last = Math.min(media.bytes.byteLength - 1, Number(instruction.lastByte ?? media.bytes.byteLength - 1));
    const part = media.bytes.slice(first, last + 1);
    const response = await safeFetch(requiredString(instruction.uploadUrl, 'LinkedIn video uploadUrl'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.from(part),
      timeoutMs: 120000,
      maxResponseBytes: 1024 * 1024,
    });
    if (!response.ok) throw new AppError(response.status, 'LinkedIn video part upload failed', 'SOCIAL_PUBLISH_FAILED');
    const etag = optionalString(response.headers.get('etag'));
    if (!etag) throw new AppError(502, 'LinkedIn video upload returned no ETag', 'SOCIAL_PROVIDER_ERROR');
    uploadedPartIds.push(etag.replace(/^"|"$/g, ''));
  }
  await jsonRequest('https://api.linkedin.com/rest/videos?action=finalizeUpload', {
    method: 'POST',
    headers: linkedInHeaders(token, version),
    body: JSON.stringify({ finalizeUploadRequest: { video, uploadToken, uploadedPartIds } }),
  });
  return video;
}

async function publishLinkedInRich(
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const token = requiredString(credentials.access_token, 'access_token');
  const author = requiredString(config.author_urn, 'author_urn');
  const version = optionalString(config.linkedin_version) || '202607';
  if (input.mediaUrls.length > 20) throw new AppError(400, 'LinkedIn multi-image posts support at most 20 images', 'SOCIAL_FORMAT_UNSUPPORTED');
  let content: Record<string, unknown> | undefined;
  if (input.mediaUrls.length === 1 && looksLikeVideo(input.mediaUrls[0], config)) {
    const video = await linkedInUploadVideo(token, author, version, input.mediaUrls[0]);
    content = { media: { id: video, title: optionalString(config.media_title) || undefined } };
  } else if (input.mediaUrls.length === 1) {
    const image = await linkedInUploadImage(token, author, version, input.mediaUrls[0]);
    content = { media: { id: image, altText: String((config.alt_texts as string[] | undefined)?.[0] || '') } };
  } else if (input.mediaUrls.length > 1) {
    const images = [];
    for (let index = 0; index < input.mediaUrls.length; index++) {
      const id = await linkedInUploadImage(token, author, version, input.mediaUrls[index]);
      images.push({ id, altText: String((config.alt_texts as string[] | undefined)?.[index] || '') });
    }
    content = { multiImage: { images } };
  }
  const payload: Record<string, unknown> = {
    author,
    commentary: joinedBody(input),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  if (content) payload.content = content;
  const response = await jsonRequest('https://api.linkedin.com/rest/posts', {
    method: 'POST', headers: linkedInHeaders(token, version), body: JSON.stringify(payload),
  });
  const id = optionalString(response.headers.get('x-restli-id')) || optionalString(response.data.id || response.data.urn);
  if (!id) throw new AppError(502, 'LinkedIn returned no provider post identifier', 'SOCIAL_PROVIDER_ID_MISSING');
  return { externalId: id, raw: { body: response.data, headers: Object.fromEntries(response.headers.entries()) } };
}

export function isExtendedSocialPlatform(platform: string): platform is ExtendedSocialPlatform {
  return ['tiktok', 'bluesky', 'mastodon', 'telegram', 'linkedin'].includes(platform);
}

export function connectionCredentialSatisfied(platform: string, credentials: Record<string, unknown>): boolean {
  if (platform === 'telegram') return Boolean(optionalString(credentials.bot_token));
  if (platform === 'bluesky') return Boolean(optionalString(credentials.access_token || credentials.access_jwt) || optionalString(credentials.app_password || credentials.password));
  return Boolean(optionalString(credentials.access_token));
}

export async function testExtendedSocialConnection(
  platform: ExtendedSocialPlatform,
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig
): Promise<Record<string, unknown>> {
  switch (platform) {
    case 'tiktok': return testTikTok(credentials);
    case 'bluesky': return testBluesky(credentials, config);
    case 'mastodon': return testMastodon(credentials, config);
    case 'telegram': return testTelegram(credentials, config);
    case 'linkedin': {
      const token = requiredString(credentials.access_token, 'access_token');
      const { data } = await jsonRequest('https://api.linkedin.com/v2/userinfo', { headers: bearer(token) });
      return data;
    }
  }
}

export async function publishExtendedSocialPost(
  platform: ExtendedSocialPlatform,
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  switch (platform) {
    case 'tiktok': return publishTikTok(credentials, config, input);
    case 'bluesky': return publishBluesky(credentials, config, input);
    case 'mastodon': return publishMastodon(credentials, config, input);
    case 'telegram': return publishTelegram(credentials, config, input);
    case 'linkedin': return publishLinkedInRich(credentials, config, input);
  }
}

export async function fetchExtendedSocialMetrics(
  platform: string,
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  externalId: string
): Promise<SocialMetricResult | null> {
  if (platform === 'tiktok') {
    const token = requiredString(credentials.access_token, 'access_token');
    const status = await jsonRequest('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST', headers: bearer(token, { 'Content-Type': 'application/json; charset=UTF-8' }), body: JSON.stringify({ publish_id: externalId }),
    });
    const state = status.data.data || status.data;
    const ids = Array.isArray(state.publicaly_available_post_id) ? state.publicaly_available_post_id.map(String) : [];
    if (ids.length === 0) return { metrics: {}, raw: status.data, pending: String(state.status || '').toUpperCase() !== 'FAILED' };
    const query = await jsonRequest('https://open.tiktokapis.com/v2/video/query/?fields=id,share_url,like_count,comment_count,share_count,view_count', {
      method: 'POST', headers: bearer(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ filters: { video_ids: ids.slice(0, 20) } }),
    });
    const video = Array.isArray(query.data.data?.videos) ? query.data.data.videos[0] : undefined;
    if (!video) return { metrics: {}, raw: { status: status.data, query: query.data }, resolvedExternalId: ids[0] };
    return {
      metrics: {
        views: Number(video.view_count || 0), likes: Number(video.like_count || 0),
        comments: Number(video.comment_count || 0), shares: Number(video.share_count || 0),
      },
      raw: { status: status.data, query: query.data },
      resolvedExternalId: String(video.id || ids[0]), externalUrl: optionalString(video.share_url) || undefined,
    };
  }

  if (platform === 'bluesky') {
    const session = await blueskySession(credentials, config);
    const publicApi = (optionalString(config.appview_url) || 'https://public.api.bsky.app').replace(/\/$/, '');
    const { data } = await jsonRequest(`${publicApi}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(externalId)}`);
    const post = Array.isArray(data.posts) ? data.posts[0] : undefined;
    if (!post) return null;
    return { metrics: { likes: Number(post.likeCount || 0), replies: Number(post.replyCount || 0), reposts: Number(post.repostCount || 0), quotes: Number(post.quoteCount || 0) }, raw: data, externalUrl: optionalString(post.uri) || undefined };
  }

  if (platform === 'mastodon') {
    const base = await mastodonBase(config);
    const token = requiredString(credentials.access_token, 'access_token');
    const { data } = await jsonRequest(`${base}/api/v1/statuses/${encodeURIComponent(externalId)}`, { headers: bearer(token) });
    return { metrics: { replies: Number(data.replies_count || 0), reposts: Number(data.reblogs_count || 0), likes: Number(data.favourites_count || 0) }, raw: data, externalUrl: optionalString(data.url) || undefined };
  }

  // Telegram's Bot API does not expose reliable per-channel organic view/engagement
  // analytics to bots, so the truthful metric result is unsupported rather than fake zeros.
  if (platform === 'telegram') return null;

  return null;
}
