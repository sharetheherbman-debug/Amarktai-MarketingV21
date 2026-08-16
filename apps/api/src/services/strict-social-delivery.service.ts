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

export async function deliverSocialPost(
  platform: string,
  credentials: Record<string, unknown>,
  config: ExternalConnectionConfig,
  input: SocialPublishInput
): Promise<SocialPublishResult> {
  const result = isExtendedSocialPlatform(platform)
    ? await publishExtendedSocialPost(platform, credentials, config, input)
    : await publishSocialPost(platform, credentials, config, input);

  if (!result.externalId || result.externalId.startsWith('reddit-') || result.externalId.startsWith('linkedin-')) {
    throw new AppError(502, `${platform} returned no verifiable provider post identifier`, 'SOCIAL_PROVIDER_ID_MISSING');
  }
  return result;
}
