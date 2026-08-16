import { AppError } from '../middleware/errorHandler';
import { safeFetch, validatePublicHttpUrl } from '../utils/safe-fetch';
import type { ExternalConnectionConfig, SocialPublishInput, SocialPublishResult } from './external-platform.service';

export type NativeEnhancedPlatform = 'x' | 'facebook' | 'instagram' | 'threads' | 'pinterest';

function requiredString(value: unknown, name: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new AppError(400, `${name} is required`, 'SOCIAL_CONFIG_ERROR');
  return text;
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function joinedBody(input: SocialPublishInput): string {
  const tags = input.hashtags.filter(Boolean).join(' ');
  return tags ? `${input.body}\n\n${tags}` : input.body;
}

function bearer(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function readJson(response: Awaited<ReturnType<typeof safeFetch>>): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, any>; }
  catch { return { text }; }
}

async function requestJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 60000,
  maxResponseBytes = 5 * 1024 * 1024
): Promise<{ data: Record<string, any>; headers: Headers }> {
  const response = await safeFetch(url, { ...init, timeoutMs, maxResponseBytes });
  const data = await readJson(response);
  if (!response.ok) {
    const detail = data.error ? JSON.stringify(data.error) : String(data.message || data.text || `HTTP ${response.status}`);
    throw new AppError(response.status, `Social provider request failed: ${detail}`, 'SOCIAL_PROVIDER_ERROR');
  }
  return { data, headers: response.headers };
}

async function approvedMedia(url: string, maxBytes = 25 * 1024 * 1024): Promise<{ bytes: Uint8Array; contentType: string }> {
  await validatePublicHttpUrl(url);
  const response = await safeFetch(url, {
    timeoutMs: 120000,
    maxResponseBytes: maxBytes,
    headers: { Accept: 'image/*,video/*,application/octet-stream;q=0.8,*/*;q=0.5' },
  });
  if (!response.ok) throw new AppError(response.status, 'Approved media could not be downloaded', 'MEDIA_DOWNLOAD_ERROR');
  return {
    bytes: await response.bytes(),
    contentType: String(response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase(),
  };
}

async function waitForGraphContainer(base: string, version: string, id: string, token: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const { data } = await requestJson(`${base}/${version}/${encodeURIComponent(id)}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const status = String(data.status_code || '').toUpperCase();
    if (!status || ['FINISHED', 'PUBLISHED'].includes(status)) return;
    if (['ERROR', 'EXPIRED'].includes(status)) throw new AppError(502, `Provider media processing failed with status ${status}`, 'SOCIAL_MEDIA_PROCESSING_FAILED');
    await new Promise((resolve) => setTimeout(resolve, Math.min(10000, 1500 + attempt * 250)));
  }
  throw new AppError(504, 'Provider media processing did not finish in time', 'SOCIAL_MEDIA_PROCESSING_TIMEOUT');
}

async function uploadXMedia(token: string, url: string): Promise<{ id: string; contentType: string }> {
  const media = await approvedMedia(url);
  const isVideo = media.contentType.startsWith('video/');
  const isGif = media.contentType === 'image/gif';
  const category = isVideo ? 'tweet_video' : isGif ? 'tweet_gif' : 'tweet_image';
  const { data } = await requestJson('https://api.x.com/2/media/upload', {
    method: 'POST',
    headers: bearer(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      media: Buffer.from(media.bytes).toString('base64'),
      media_category: category,
      media_type: media.contentType,
      shared: false,
    }),
  }, 120000);
  const result = data.data || data;
  const id = requiredString(result.id || result.media_id_string || result.media_id, 'X media id');
  let processing = result.processing_info || {};
  for (let attempt = 0; processing && ['pending', 'in_progress'].includes(String(processing.state || '').toLowerCase()) && attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(1000, Math.min(10000, Number(processing.check_after_secs || 1) * 1000))));
    const status = await requestJson(`https://api.x.com/2/media/upload?command=STATUS&media_id=${encodeURIComponent(id)}`, { headers: bearer(token) });
    processing = status.data.data?.processing_info || status.data.processing_info || {};
  }
  if (processing && String(processing.state || '').toLowerCase() === 'failed') {
    throw new AppError(502, 'X media processing failed', 'SOCIAL_MEDIA_PROCESSING_FAILED');
  }
  return { id, contentType: media.contentType };
}

async function publishX(credentials: Record<string, unknown>, input: SocialPublishInput): Promise<SocialPublishResult> {
  const token = requiredString(credentials.access_token, 'access_token');
  if (input.mediaUrls.length > 4) throw new AppError(400, 'X supports at most four approved images or one approved video/GIF', 'SOCIAL_FORMAT_UNSUPPORTED');
  const uploaded = [] as Array<{ id: string; contentType: string }>;
  for (const url of input.mediaUrls) uploaded.push(await uploadXMedia(token, url));
  const motion = uploaded.filter((item) => item.contentType.startsWith('video/') || item.contentType === 'image/gif');
  if (motion.length > 1 || (motion.length === 1 && uploaded.length > 1)) {
    throw new AppError(400, 'X cannot mix a video/GIF with other media in this publishing path', 'SOCIAL_FORMAT_UNSUPPORTED');
  }
  const payload: Record<string, unknown> = { text: joinedBody(input).slice(0, 280), made_with_ai: true };
  if (uploaded.length) payload.media = { media_ids: uploaded.map((item) => item.id) };
  const { data } = await requestJson('https://api.x.com/2/tweets', {
    method: 'POST', headers: bearer(token, { 'Content-Type': 'application/json' }), body: JSON.stringify(payload),
  });
  const result = data.data || data;
  const id = requiredString(result.id, 'X post id');
  return { externalId: id, externalUrl: `https://x.com/i/web/status/${id}`, raw: data };
}

async function publishFacebook(
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const token = requiredString(credentials.access_token, 'access_token');
  const pageId = requiredString(config.page_id || config.account_id, 'page_id');
  const version = optionalString(config.api_version) || 'v25.0';
  const message = joinedBody(input);
  const base = `https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}`;
  if (input.mediaUrls.length === 0) {
    const data = await requestJson(`${base}/feed`, { method: 'POST', body: new URLSearchParams({ message, access_token: token }) });
    return { externalId: requiredString(data.data.id, 'Facebook post id'), raw: data.data };
  }
  if (input.mediaUrls.length > 10) throw new AppError(400, 'Facebook multi-image publishing is limited to ten approved images', 'SOCIAL_FORMAT_UNSUPPORTED');
  for (const url of input.mediaUrls) await validatePublicHttpUrl(url);
  if (input.mediaUrls.length === 1) {
    const probe = await approvedMedia(input.mediaUrls[0]);
    if (probe.contentType.startsWith('video/')) {
      const data = await requestJson(`${base}/videos`, {
        method: 'POST', body: new URLSearchParams({ file_url: input.mediaUrls[0], description: message, access_token: token }),
      }, 120000);
      return { externalId: requiredString(data.data.id, 'Facebook video id'), raw: data.data };
    }
    if (!probe.contentType.startsWith('image/')) throw new AppError(400, 'Facebook media must be an image or video', 'SOCIAL_FORMAT_UNSUPPORTED');
    const data = await requestJson(`${base}/photos`, {
      method: 'POST', body: new URLSearchParams({ url: input.mediaUrls[0], caption: message, published: 'true', access_token: token }),
    });
    const id = requiredString(data.data.post_id || data.data.id, 'Facebook photo post id');
    return { externalId: id, raw: data.data };
  }
  const photoIds: string[] = [];
  for (const url of input.mediaUrls) {
    const probe = await approvedMedia(url);
    if (!probe.contentType.startsWith('image/')) throw new AppError(400, 'Facebook multi-media publishing currently supports approved images only', 'SOCIAL_FORMAT_UNSUPPORTED');
    const uploaded = await requestJson(`${base}/photos`, {
      method: 'POST', body: new URLSearchParams({ url, published: 'false', access_token: token }),
    });
    photoIds.push(requiredString(uploaded.data.id, 'Facebook uploaded photo id'));
  }
  const form = new URLSearchParams({ message, access_token: token });
  photoIds.forEach((id, index) => form.set(`attached_media[${index}]`, JSON.stringify({ media_fbid: id })));
  const created = await requestJson(`${base}/feed`, { method: 'POST', body: form });
  return { externalId: requiredString(created.data.id, 'Facebook multi-image post id'), raw: { photo_ids: photoIds, post: created.data } };
}

async function publishInstagram(
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const token = requiredString(credentials.access_token, 'access_token');
  const accountId = requiredString(config.account_id, 'account_id');
  const version = optionalString(config.api_version) || 'v25.0';
  const graph = 'https://graph.facebook.com';
  const caption = joinedBody(input).slice(0, 2200);
  if (input.mediaUrls.length < 1 || input.mediaUrls.length > 10) {
    throw new AppError(400, 'Instagram requires one approved media item or a carousel of up to ten approved images', 'SOCIAL_MEDIA_REQUIRED');
  }
  for (const url of input.mediaUrls) await validatePublicHttpUrl(url);
  let creationId: string;
  if (input.mediaUrls.length === 1) {
    const probe = await approvedMedia(input.mediaUrls[0]);
    const params = new URLSearchParams({ caption, access_token: token });
    if (probe.contentType.startsWith('video/')) {
      params.set('media_type', 'REELS');
      params.set('video_url', input.mediaUrls[0]);
      params.set('share_to_feed', String(config.share_to_feed !== false));
    } else if (probe.contentType.startsWith('image/')) {
      params.set('image_url', input.mediaUrls[0]);
    } else {
      throw new AppError(400, 'Instagram media must be an image or video', 'SOCIAL_FORMAT_UNSUPPORTED');
    }
    const created = await requestJson(`${graph}/${version}/${encodeURIComponent(accountId)}/media`, { method: 'POST', body: params });
    creationId = requiredString(created.data.id, 'Instagram creation id');
    if (probe.contentType.startsWith('video/')) await waitForGraphContainer(graph, version, creationId, token);
  } else {
    const children: string[] = [];
    for (const url of input.mediaUrls) {
      const probe = await approvedMedia(url);
      if (!probe.contentType.startsWith('image/')) throw new AppError(400, 'Instagram carousel publishing currently accepts approved images only', 'SOCIAL_FORMAT_UNSUPPORTED');
      const child = await requestJson(`${graph}/${version}/${encodeURIComponent(accountId)}/media`, {
        method: 'POST', body: new URLSearchParams({ image_url: url, is_carousel_item: 'true', access_token: token }),
      });
      children.push(requiredString(child.data.id, 'Instagram carousel child id'));
    }
    const parent = await requestJson(`${graph}/${version}/${encodeURIComponent(accountId)}/media`, {
      method: 'POST', body: new URLSearchParams({ media_type: 'CAROUSEL', children: children.join(','), caption, access_token: token }),
    });
    creationId = requiredString(parent.data.id, 'Instagram carousel id');
  }
  const published = await requestJson(`${graph}/${version}/${encodeURIComponent(accountId)}/media_publish`, {
    method: 'POST', body: new URLSearchParams({ creation_id: creationId, access_token: token }),
  });
  const id = requiredString(published.data.id, 'Instagram media id');
  return { externalId: id, raw: { creation_id: creationId, published: published.data } };
}

async function publishThreads(
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const token = requiredString(credentials.access_token, 'access_token');
  const userId = requiredString(config.user_id || config.account_id, 'user_id');
  const version = optionalString(config.api_version) || 'v1.0';
  const graph = 'https://graph.threads.net';
  const text = joinedBody(input).slice(0, 500);
  if (input.mediaUrls.length > 10) throw new AppError(400, 'Threads carousel is limited to ten approved media items', 'SOCIAL_FORMAT_UNSUPPORTED');
  for (const url of input.mediaUrls) await validatePublicHttpUrl(url);
  let creationId: string;
  if (input.mediaUrls.length === 0) {
    const created = await requestJson(`${graph}/${version}/${encodeURIComponent(userId)}/threads`, {
      method: 'POST', body: new URLSearchParams({ media_type: 'TEXT', text, access_token: token }),
    });
    creationId = requiredString(created.data.id, 'Threads creation id');
  } else if (input.mediaUrls.length === 1) {
    const probe = await approvedMedia(input.mediaUrls[0]);
    const params = new URLSearchParams({ text, access_token: token });
    if (probe.contentType.startsWith('video/')) { params.set('media_type', 'VIDEO'); params.set('video_url', input.mediaUrls[0]); }
    else if (probe.contentType.startsWith('image/')) { params.set('media_type', 'IMAGE'); params.set('image_url', input.mediaUrls[0]); }
    else throw new AppError(400, 'Threads media must be an image or video', 'SOCIAL_FORMAT_UNSUPPORTED');
    const created = await requestJson(`${graph}/${version}/${encodeURIComponent(userId)}/threads`, { method: 'POST', body: params });
    creationId = requiredString(created.data.id, 'Threads creation id');
    if (probe.contentType.startsWith('video/')) await waitForGraphContainer(graph, version, creationId, token);
  } else {
    const children: string[] = [];
    for (const url of input.mediaUrls) {
      const probe = await approvedMedia(url);
      if (!probe.contentType.startsWith('image/')) throw new AppError(400, 'Threads carousel publishing currently accepts approved images only', 'SOCIAL_FORMAT_UNSUPPORTED');
      const child = await requestJson(`${graph}/${version}/${encodeURIComponent(userId)}/threads`, {
        method: 'POST', body: new URLSearchParams({ media_type: 'IMAGE', image_url: url, is_carousel_item: 'true', access_token: token }),
      });
      children.push(requiredString(child.data.id, 'Threads carousel child id'));
    }
    const parent = await requestJson(`${graph}/${version}/${encodeURIComponent(userId)}/threads`, {
      method: 'POST', body: new URLSearchParams({ media_type: 'CAROUSEL', children: children.join(','), text, access_token: token }),
    });
    creationId = requiredString(parent.data.id, 'Threads carousel id');
  }
  const published = await requestJson(`${graph}/${version}/${encodeURIComponent(userId)}/threads_publish`, {
    method: 'POST', body: new URLSearchParams({ creation_id: creationId, access_token: token }),
  });
  const id = requiredString(published.data.id, 'Threads post id');
  return { externalId: id, raw: { creation_id: creationId, published: published.data } };
}

async function waitForPinterestMedia(token: string, mediaId: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const { data } = await requestJson(`https://api.pinterest.com/v5/media/${encodeURIComponent(mediaId)}`, { headers: bearer(token) });
    const status = String(data.status || data.media_status || '').toLowerCase();
    if (['succeeded', 'success', 'finished'].includes(status)) return;
    if (['failed', 'error'].includes(status)) throw new AppError(502, 'Pinterest video processing failed', 'SOCIAL_MEDIA_PROCESSING_FAILED');
    await new Promise((resolve) => setTimeout(resolve, Math.min(10000, 2000 + attempt * 250)));
  }
  throw new AppError(504, 'Pinterest video processing did not finish in time', 'SOCIAL_MEDIA_PROCESSING_TIMEOUT');
}

async function publishPinterest(
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const token = requiredString(credentials.access_token, 'access_token');
  const boardId = requiredString(config.board_id, 'board_id');
  const message = joinedBody(input);
  if (input.mediaUrls.length < 1 || input.mediaUrls.length > 2) {
    throw new AppError(400, 'Pinterest requires one approved image, or an approved video plus approved cover image', 'SOCIAL_MEDIA_REQUIRED');
  }
  for (const url of input.mediaUrls) await validatePublicHttpUrl(url);
  const first = await approvedMedia(input.mediaUrls[0]);
  let mediaSource: Record<string, unknown>;
  if (first.contentType.startsWith('image/')) {
    if (input.mediaUrls.length !== 1) throw new AppError(400, 'Pinterest image Pins require exactly one approved image', 'SOCIAL_FORMAT_UNSUPPORTED');
    mediaSource = { source_type: 'image_url', url: input.mediaUrls[0], is_standard: true };
  } else if (first.contentType.startsWith('video/')) {
    if (input.mediaUrls.length !== 2) throw new AppError(400, 'Pinterest video Pins require the approved video and an approved cover image URL', 'SOCIAL_MEDIA_REQUIRED');
    const cover = await approvedMedia(input.mediaUrls[1]);
    if (!cover.contentType.startsWith('image/')) throw new AppError(400, 'Pinterest video cover must be an approved image', 'SOCIAL_FORMAT_UNSUPPORTED');
    const registered = await requestJson('https://api.pinterest.com/v5/media', {
      method: 'POST', headers: bearer(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ media_type: 'video' }),
    });
    const mediaId = requiredString(registered.data.media_id || registered.data.id, 'Pinterest media_id');
    const uploadUrl = requiredString(registered.data.upload_url, 'Pinterest upload_url');
    await validatePublicHttpUrl(uploadUrl);
    const params = registered.data.upload_parameters && typeof registered.data.upload_parameters === 'object'
      ? registered.data.upload_parameters as Record<string, unknown> : {};
    const form = new FormData();
    for (const [key, value] of Object.entries(params)) form.append(key, String(value));
    form.append('file', new Blob([Buffer.from(first.bytes)], { type: first.contentType }), 'approved-video');
    const uploaded = await safeFetch(uploadUrl, { method: 'POST', body: form, timeoutMs: 120000, maxResponseBytes: 1024 * 1024 });
    if (!uploaded.ok) throw new AppError(uploaded.status, 'Pinterest media upload failed', 'SOCIAL_PUBLISH_FAILED');
    await waitForPinterestMedia(token, mediaId);
    mediaSource = { source_type: 'video_id', cover_image_url: input.mediaUrls[1], media_id: mediaId };
  } else {
    throw new AppError(400, 'Pinterest media must be an image or video', 'SOCIAL_FORMAT_UNSUPPORTED');
  }
  const { data } = await requestJson('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: bearer(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      board_id: boardId,
      title: String(config.title || input.body).slice(0, 100),
      description: message.slice(0, 800),
      link: optionalString(config.link) || undefined,
      ai_disclosures: { values: ['AI_MODIFIED'] },
      media_source: mediaSource,
    }),
  }, 120000);
  const id = requiredString(data.id, 'Pinterest pin id');
  return { externalId: id, externalUrl: `https://www.pinterest.com/pin/${id}/`, raw: data };
}

export function isNativeEnhancedPlatform(platform: string): platform is NativeEnhancedPlatform {
  return ['x', 'facebook', 'instagram', 'threads', 'pinterest'].includes(platform);
}

export async function publishNativeEnhancedPost(
  platform: NativeEnhancedPlatform,
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  switch (platform) {
    case 'x': return publishX(credentials, input);
    case 'facebook': return publishFacebook(credentials, config, input);
    case 'instagram': return publishInstagram(credentials, config, input);
    case 'threads': return publishThreads(credentials, config, input);
    case 'pinterest': return publishPinterest(credentials, config, input);
  }
}
