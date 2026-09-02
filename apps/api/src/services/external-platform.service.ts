import { AppError } from '../middleware/errorHandler';
import { decrypt, encrypt, EncryptedData } from '../utils/encryption';
import { safeFetch, type SafeFetchResponse } from '../utils/safe-fetch';

export interface SecretEnvelope {
  encrypted: EncryptedData;
}

export interface ExternalConnectionConfig {
  [key: string]: unknown;
}

export interface SocialPublishInput {
  body: string;
  mediaUrls: string[];
  hashtags: string[];
}

export interface SocialPublishResult {
  externalId: string;
  externalUrl?: string;
  raw: Record<string, unknown>;
}

export interface AnalyticsSyncResult {
  metrics: Record<string, number>;
  dimensions: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface AdvertisingCampaignRecord {
  externalId: string;
  name: string;
  status: string;
  objective?: string;
  dailyBudgetCents?: number;
  lifetimeBudgetCents?: number;
  currency?: string;
  metrics: Record<string, number>;
  raw: Record<string, unknown>;
}

export interface AdvertisingSyncResult {
  campaigns: AdvertisingCampaignRecord[];
  accountMetrics: Record<string, number>;
  raw: Record<string, unknown>;
}

export function sealSecrets(secrets: Record<string, unknown>): SecretEnvelope {
  return { encrypted: encrypt(JSON.stringify(secrets || {})) };
}

export function openSecrets(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const envelope = value as Partial<SecretEnvelope>;
  if (!envelope.encrypted) return value as Record<string, unknown>;
  return JSON.parse(decrypt(envelope.encrypted)) as Record<string, unknown>;
}

function stringValue(value: unknown, name: string, required = true): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text) throw new AppError(400, `${name} is required`, 'INTEGRATION_CONFIG_ERROR');
  return text;
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readResponse(response: Pick<SafeFetchResponse, 'text'>): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { text };
  }
}

async function requestJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30000
): Promise<Record<string, unknown>> {
  const response = await safeFetch(url, {
    ...init,
    timeoutMs,
    maxResponseBytes: 5 * 1024 * 1024,
  });
  const data = await readResponse(response);
  if (!response.ok) {
    const detail = typeof data.error === 'object'
      ? JSON.stringify(data.error)
      : String(data.error || data.message || data.text || `HTTP ${response.status}`);
    throw new AppError(response.status, `External API request failed: ${detail}`, 'EXTERNAL_API_ERROR');
  }
  return data;
}

function bearer(token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function joinedBody(input: SocialPublishInput): string {
  const tags = input.hashtags.filter(Boolean).join(' ');
  return tags ? `${input.body}\n\n${tags}` : input.body;
}

export async function testExternalConnection(
  providerSlug: string,
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig
): Promise<Record<string, unknown>> {
  switch (providerSlug) {
    case 'meta-ads': {
      const token = stringValue(credentials.access_token, 'access_token');
      const version = stringValue(config.api_version || 'v25.0', 'api_version');
      return requestJson(`https://graph.facebook.com/${version}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
    }
    case 'google-ads': {
      const token = stringValue(credentials.access_token, 'access_token');
      const developerToken = stringValue(credentials.developer_token, 'developer_token');
      const customerId = stringValue(config.customer_id, 'customer_id').replace(/-/g, '');
      const version = stringValue(config.api_version || 'v25', 'api_version');
      const headers: Record<string, string> = bearer(token, { 'developer-token': developerToken });
      const loginCustomerId = stringValue(credentials.login_customer_id, 'login_customer_id', false).replace(/-/g, '');
      if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;
      return requestJson(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`, {
        method: 'POST', headers, body: JSON.stringify({ query: 'SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1' }),
      });
    }
    case 'ga4': {
      const token = stringValue(credentials.access_token, 'access_token');
      const propertyId = stringValue(config.property_id, 'property_id');
      return requestJson(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: bearer(token),
        body: JSON.stringify({ dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }], metrics: [{ name: 'sessions' }] }),
      });
    }
    case 'plausible': {
      const apiKey = stringValue(credentials.api_key, 'api_key');
      const siteId = stringValue(config.site_id, 'site_id');
      const baseUrl = stringValue(config.base_url || 'https://plausible.io', 'base_url').replace(/\/$/, '');
      return requestJson(`${baseUrl}/api/v1/stats/aggregate?site_id=${encodeURIComponent(siteId)}&period=day&metrics=visitors`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    }
    case 'generic-analytics': {
      const url = stringValue(config.url, 'url');
      const method = stringValue(config.method || 'GET', 'method').toUpperCase();
      const headers = (credentials.headers && typeof credentials.headers === 'object')
        ? credentials.headers as Record<string, string>
        : {};
      return requestJson(url, { method, headers });
    }
    default:
      throw new AppError(400, `Unsupported external provider: ${providerSlug}`, 'UNSUPPORTED_PROVIDER');
  }
}

export async function syncExternalAnalytics(
  providerSlug: string,
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  startDate: string,
  endDate: string
): Promise<AnalyticsSyncResult> {
  if (providerSlug === 'ga4') {
    const token = stringValue(credentials.access_token, 'access_token');
    const propertyId = stringValue(config.property_id, 'property_id');
    const raw = await requestJson(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'screenPageViews' },
          { name: 'engagedSessions' },
          { name: 'conversions' },
          { name: 'totalRevenue' },
        ],
      }),
    });
    const totals = Array.isArray(raw.totals) ? raw.totals[0] as Record<string, unknown> : undefined;
    const values = Array.isArray(totals?.metricValues) ? totals?.metricValues as Array<Record<string, unknown>> : [];
    const names = ['sessions', 'users', 'new_users', 'pageviews', 'engaged_sessions', 'conversions', 'revenue'];
    const metrics = Object.fromEntries(names.map((name, index) => [name, numberValue(values[index]?.value)]));
    return { metrics, dimensions: { rows: raw.rows || [] }, raw };
  }

  if (providerSlug === 'plausible') {
    const apiKey = stringValue(credentials.api_key, 'api_key');
    const siteId = stringValue(config.site_id, 'site_id');
    const baseUrl = stringValue(config.base_url || 'https://plausible.io', 'base_url').replace(/\/$/, '');
    const raw = await requestJson(
      `${baseUrl}/api/v1/stats/aggregate?site_id=${encodeURIComponent(siteId)}&period=custom&date=${encodeURIComponent(`${startDate},${endDate}`)}&metrics=visitors,pageviews,bounce_rate,visit_duration`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    const results = raw.results && typeof raw.results === 'object' ? raw.results as Record<string, Record<string, unknown>> : {};
    return {
      metrics: {
        users: numberValue(results.visitors?.value),
        pageviews: numberValue(results.pageviews?.value),
        bounce_rate: numberValue(results.bounce_rate?.value),
        visit_duration: numberValue(results.visit_duration?.value),
      },
      dimensions: {},
      raw,
    };
  }

  if (providerSlug === 'generic-analytics') {
    const raw = await testExternalConnection(providerSlug, credentials, config);
    const configuredMap = config.metric_map && typeof config.metric_map === 'object'
      ? config.metric_map as Record<string, string>
      : {};
    const metrics: Record<string, number> = {};
    for (const [name, path] of Object.entries(configuredMap)) {
      let current: unknown = raw;
      for (const part of path.split('.')) {
        current = current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined;
      }
      metrics[name] = numberValue(current);
    }
    return { metrics, dimensions: {}, raw };
  }

  throw new AppError(400, `Provider ${providerSlug} is not an analytics provider`, 'UNSUPPORTED_PROVIDER');
}

export async function syncAdvertising(
  providerSlug: string,
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  startDate: string,
  endDate: string
): Promise<AdvertisingSyncResult> {
  if (providerSlug === 'meta-ads') {
    const token = stringValue(credentials.access_token, 'access_token');
    const accountId = stringValue(config.ad_account_id, 'ad_account_id').replace(/^act_/, '');
    const version = stringValue(config.api_version || 'v25.0', 'api_version');
    const fields = 'id,name,status,objective,daily_budget,lifetime_budget,account_id';
    const campaignsRaw = await requestJson(`https://graph.facebook.com/${version}/act_${accountId}/campaigns?fields=${encodeURIComponent(fields)}&limit=500&access_token=${encodeURIComponent(token)}`);
    const insightsRaw = await requestJson(`https://graph.facebook.com/${version}/act_${accountId}/insights?level=campaign&fields=campaign_id,campaign_name,impressions,clicks,spend,reach,actions&time_range=${encodeURIComponent(JSON.stringify({ since: startDate, until: endDate }))}&limit=500&access_token=${encodeURIComponent(token)}`);
    const insights = new Map<string, Record<string, unknown>>();
    for (const row of Array.isArray(insightsRaw.data) ? insightsRaw.data as Array<Record<string, unknown>> : []) {
      insights.set(String(row.campaign_id || ''), row);
    }
    const campaigns = (Array.isArray(campaignsRaw.data) ? campaignsRaw.data as Array<Record<string, unknown>> : []).map((row) => {
      const metricRow = insights.get(String(row.id)) || {};
      const actions = Array.isArray(metricRow.actions) ? metricRow.actions as Array<Record<string, unknown>> : [];
      const conversions = actions.reduce((sum, action) => sum + numberValue(action.value), 0);
      return {
        externalId: String(row.id),
        name: String(row.name || 'Untitled campaign'),
        status: String(row.status || 'unknown').toLowerCase(),
        objective: row.objective ? String(row.objective) : undefined,
        dailyBudgetCents: numberValue(row.daily_budget),
        lifetimeBudgetCents: numberValue(row.lifetime_budget),
        currency: String(config.currency || 'USD'),
        metrics: {
          impressions: numberValue(metricRow.impressions),
          clicks: numberValue(metricRow.clicks),
          spend_cents: Math.round(numberValue(metricRow.spend) * 100),
          reach: numberValue(metricRow.reach),
          conversions,
        },
        raw: { campaign: row, insights: metricRow },
      } satisfies AdvertisingCampaignRecord;
    });
    const accountMetrics = campaigns.reduce((totals, campaign) => {
      for (const [key, value] of Object.entries(campaign.metrics)) totals[key] = (totals[key] || 0) + value;
      return totals;
    }, {} as Record<string, number>);
    return { campaigns, accountMetrics, raw: { campaigns: campaignsRaw, insights: insightsRaw } };
  }

  if (providerSlug === 'google-ads') {
    const token = stringValue(credentials.access_token, 'access_token');
    const developerToken = stringValue(credentials.developer_token, 'developer_token');
    const customerId = stringValue(config.customer_id, 'customer_id').replace(/-/g, '');
    const version = stringValue(config.api_version || 'v25', 'api_version');
    const headers: Record<string, string> = bearer(token, { 'developer-token': developerToken });
    const loginCustomerId = stringValue(credentials.login_customer_id, 'login_customer_id', false).replace(/-/g, '');
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;
    const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, customer.currency_code, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`;
    const raw = await requestJson(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`, {
      method: 'POST', headers, body: JSON.stringify({ query, pageSize: 10000 }),
    });
    const campaigns = (Array.isArray(raw.results) ? raw.results as Array<Record<string, unknown>> : []).map((row) => {
      const campaign = row.campaign as Record<string, unknown> || {};
      const budget = row.campaignBudget as Record<string, unknown> || {};
      const metrics = row.metrics as Record<string, unknown> || {};
      const customer = row.customer as Record<string, unknown> || {};
      return {
        externalId: String(campaign.id),
        name: String(campaign.name || 'Untitled campaign'),
        status: String(campaign.status || 'unknown').toLowerCase(),
        objective: campaign.advertisingChannelType ? String(campaign.advertisingChannelType) : undefined,
        dailyBudgetCents: Math.round(numberValue(budget.amountMicros) / 10000),
        currency: String(customer.currencyCode || config.currency || 'USD'),
        metrics: {
          impressions: numberValue(metrics.impressions),
          clicks: numberValue(metrics.clicks),
          spend_cents: Math.round(numberValue(metrics.costMicros) / 10000),
          conversions: numberValue(metrics.conversions),
        },
        raw: row,
      } satisfies AdvertisingCampaignRecord;
    });
    const accountMetrics = campaigns.reduce((totals, campaign) => {
      for (const [key, value] of Object.entries(campaign.metrics)) totals[key] = (totals[key] || 0) + value;
      return totals;
    }, {} as Record<string, number>);
    return { campaigns, accountMetrics, raw };
  }

  throw new AppError(400, `Provider ${providerSlug} is not an advertising provider`, 'UNSUPPORTED_PROVIDER');
}

export async function publishSocialPost(
  platform: string,
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const message = joinedBody(input);
  const token = stringValue(credentials.access_token, 'access_token');

  if (platform === 'x') {
    const raw = await requestJson('https://api.x.com/2/tweets', {
      method: 'POST', headers: bearer(token), body: JSON.stringify({ text: message }),
    });
    const data = raw.data as Record<string, unknown> || {};
    const id = stringValue(data.id, 'X post id');
    return { externalId: id, externalUrl: `https://x.com/i/web/status/${id}`, raw };
  }

  if (platform === 'linkedin') {
    const author = stringValue(config.author_urn, 'author_urn');
    const raw = await requestJson('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: bearer(token, {
        'LinkedIn-Version': stringValue(config.linkedin_version || '202607', 'linkedin_version'),
        'X-Restli-Protocol-Version': '2.0.0',
      }),
      body: JSON.stringify({ author, commentary: message, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }),
    });
    const id = String(raw.id || raw.urn || `linkedin-${Date.now()}`);
    return { externalId: id, raw };
  }

  if (platform === 'facebook') {
    const pageId = stringValue(config.page_id || config.account_id, 'page_id');
    const version = stringValue(config.api_version || 'v25.0', 'api_version');
    const body = new URLSearchParams({ message, access_token: token });
    if (input.mediaUrls[0]) body.set('link', input.mediaUrls[0]);
    const raw = await requestJson(`https://graph.facebook.com/${version}/${pageId}/feed`, { method: 'POST', body });
    const id = stringValue(raw.id, 'Facebook post id');
    return { externalId: id, raw };
  }

  if (platform === 'instagram') {
    const accountId = stringValue(config.account_id, 'account_id');
    const mediaUrl = stringValue(input.mediaUrls[0], 'media_urls[0]');
    const version = stringValue(config.api_version || 'v25.0', 'api_version');
    const createParams = new URLSearchParams({ image_url: mediaUrl, caption: message, access_token: token });
    const created = await requestJson(`https://graph.facebook.com/${version}/${accountId}/media`, { method: 'POST', body: createParams });
    const creationId = stringValue(created.id, 'Instagram creation id');
    const published = await requestJson(`https://graph.facebook.com/${version}/${accountId}/media_publish`, {
      method: 'POST', body: new URLSearchParams({ creation_id: creationId, access_token: token }),
    });
    const id = stringValue(published.id, 'Instagram media id');
    return { externalId: id, raw: { created, published } };
  }

  if (platform === 'threads') {
    const userId = stringValue(config.user_id || config.account_id, 'user_id');
    const version = stringValue(config.api_version || 'v1.0', 'api_version');
    const create = await requestJson(`https://graph.threads.net/${version}/${userId}/threads`, {
      method: 'POST',
      body: new URLSearchParams({ media_type: 'TEXT', text: message, access_token: token }),
    });
    const creationId = stringValue(create.id, 'Threads creation id');
    const published = await requestJson(`https://graph.threads.net/${version}/${userId}/threads_publish`, {
      method: 'POST', body: new URLSearchParams({ creation_id: creationId, access_token: token }),
    });
    const id = stringValue(published.id, 'Threads post id');
    return { externalId: id, raw: { create, published } };
  }

  if (platform === 'pinterest') {
    const boardId = stringValue(config.board_id, 'board_id');
    const mediaUrl = stringValue(input.mediaUrls[0], 'media_urls[0]');
    const raw = await requestJson('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({ board_id: boardId, title: String(config.title || input.body).slice(0, 100), description: message, media_source: { source_type: 'image_url', url: mediaUrl } }),
    });
    const id = stringValue(raw.id, 'Pinterest pin id');
    return { externalId: id, externalUrl: `https://www.pinterest.com/pin/${id}/`, raw };
  }

  if (platform === 'reddit') {
    const subreddit = stringValue(config.subreddit, 'subreddit');
    const title = stringValue(config.title || input.body.split('\n')[0].slice(0, 300), 'title');
    const raw = await requestJson('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': stringValue(config.user_agent || 'AmarktAIMarketing/1.0', 'user_agent') },
      body: new URLSearchParams({ api_type: 'json', kind: input.mediaUrls[0] ? 'link' : 'self', sr: subreddit, title, text: input.mediaUrls[0] ? '' : message, url: input.mediaUrls[0] || '' }),
    });
    const json = raw.json as Record<string, unknown> || {};
    const data = json.data as Record<string, unknown> || {};
    const id = String(data.id || data.name || `reddit-${Date.now()}`);
    return { externalId: id, externalUrl: data.url ? String(data.url) : undefined, raw };
  }

  if (platform === 'youtube') {
    const mediaUrl = stringValue(input.mediaUrls[0], 'media_urls[0]');
    const mediaResponse = await safeFetch(mediaUrl, { timeoutMs: 120000, maxResponseBytes: 25 * 1024 * 1024 });
    if (!mediaResponse.ok) throw new AppError(mediaResponse.status, 'Unable to download YouTube media URL', 'MEDIA_DOWNLOAD_ERROR');
    const mediaBlob = new Blob([await mediaResponse.bytes()]);
    const metadata = {
      snippet: {
        title: String(config.title || input.body.split('\n')[0] || 'Marketing upload').slice(0, 100),
        description: message,
        tags: input.hashtags.map((tag) => tag.replace(/^#/, '')).filter(Boolean),
        categoryId: String(config.category_id || '22'),
      },
      status: {
        privacyStatus: String(config.privacy_status || 'private'),
        containsSyntheticMedia: config.contains_synthetic_media !== false,
      },
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('media', mediaBlob, String(config.filename || 'upload.mp4'));
    const raw = await requestJson('https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    }, 180000);
    const id = stringValue(raw.id, 'YouTube video id');
    return { externalId: id, externalUrl: `https://www.youtube.com/watch?v=${id}`, raw };
  }

  throw new AppError(400, `Unsupported social platform: ${platform}`, 'UNSUPPORTED_SOCIAL_PLATFORM');
}
