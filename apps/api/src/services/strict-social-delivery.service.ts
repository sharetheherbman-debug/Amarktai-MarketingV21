import { AppError } from '../middleware/errorHandler';
import {
  ExternalConnectionConfig,
  SocialPublishInput,
  SocialPublishResult,
  publishSocialPost,
} from './external-platform.service';
import {
  isExtendedSocialPlatform,
  publishExtendedSocialPost,
} from './extended-social-platform.service';

function preparePlatformInput(platform: string, input: SocialPublishInput): SocialPublishInput {
  if (platform !== 'bluesky') return input;
  const tags = input.hashtags.filter(Boolean).join(' ');
  const combined = tags ? `${input.body}\n\n${tags}` : input.body;
  return {
    ...input,
    body: combined.slice(0, 300),
    hashtags: [],
  };
}

export async function deliverSocialPost(
  platform: string,
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const preparedInput = preparePlatformInput(platform, input);
  const result = isExtendedSocialPlatform(platform)
    ? await publishExtendedSocialPost(platform, credentials, config, preparedInput)
    : await publishSocialPost(platform, credentials, config, preparedInput);

  if (!result.externalId || result.externalId.startsWith('reddit-') || result.externalId.startsWith('linkedin-')) {
    throw new AppError(502, `${platform} returned no verifiable provider post identifier`, 'SOCIAL_PROVIDER_ID_MISSING');
  }
  return result;
}
