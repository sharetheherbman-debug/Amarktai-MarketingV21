import { AppError } from '../middleware/errorHandler';
import {
  ExternalConnectionConfig,
  SocialPublishInput,
  SocialPublishResult,
  publishSocialPost,
} from './external-platform.service';

function requiredString(value: unknown, name: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new AppError(400, `${name} is required`, 'SOCIAL_CONFIG_ERROR');
  return text;
}

function joinedBody(input: SocialPublishInput): string {
  const tags = input.hashtags.filter(Boolean).join(' ');
  return tags ? `${input.body}\n\n${tags}` : input.body;
}

async function publishLinkedIn(
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const token = requiredString(credentials.access_token, 'access_token');
  const author = requiredString(config.author_urn, 'author_urn');
  const response = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': requiredString(config.linkedin_version || '202607', 'linkedin_version'),
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author,
      commentary: joinedBody(input),
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { body = { text }; }
  if (!response.ok) {
    throw new AppError(response.status, `LinkedIn publishing failed: ${text || response.statusText}`, 'SOCIAL_PUBLISH_FAILED');
  }
  const providerId = response.headers.get('x-restli-id') || String(body.id || body.urn || '').trim();
  if (!providerId) {
    throw new AppError(502, 'LinkedIn accepted the request but returned no provider post identifier', 'SOCIAL_PROVIDER_ID_MISSING');
  }
  return {
    externalId: providerId,
    raw: { body, headers: Object.fromEntries(response.headers.entries()) },
  };
}

export async function deliverSocialPost(
  platform: string,
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const result = platform === 'linkedin'
    ? await publishLinkedIn(credentials, config, input)
    : await publishSocialPost(platform, credentials, config, input);

  if (!result.externalId || result.externalId.startsWith('reddit-') || result.externalId.startsWith('linkedin-')) {
    throw new AppError(502, `${platform} returned no verifiable provider post identifier`, 'SOCIAL_PROVIDER_ID_MISSING');
  }
  return result;
}
