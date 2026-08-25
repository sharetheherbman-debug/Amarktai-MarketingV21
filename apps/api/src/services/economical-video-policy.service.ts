import { AppError } from '../middleware/errorHandler';
import type { MarketingGenerationRoute } from './marketing-generation-policy.service';

export interface EconomicalVideoCostPlan {
  version: 1;
  production_mode: 'economical_short_form_video';
  duration_seconds: number;
  generated_ingredients: Array<{
    type: 'still_image';
    operation: 'text_to_image';
    model_id: string;
    estimated_credits: number;
    estimated_retail_gbp: number;
    price_snapshot_id: string;
  }>;
  composition: {
    engine: 'ffmpeg';
    scene_strategy: 'small_multiscene_still_heavy';
    brand_end_card: true;
    captions: true;
    cta: true;
    raw_text_to_video: false;
    estimated_generation_credits: number;
  };
}

export function buildEconomicalVideoCostPlan(
  durationSeconds: unknown,
  ingredientRoute: MarketingGenerationRoute
): EconomicalVideoCostPlan {
  const duration = Math.floor(Number(durationSeconds || 15));
  if (!Number.isFinite(duration) || duration < 5 || duration > 15) {
    throw new AppError(400, 'Economical short promotional video duration must be between 5 and 15 seconds', 'ECONOMICAL_VIDEO_DURATION_INVALID');
  }
  if (ingredientRoute.operation !== 'text_to_image') {
    throw new AppError(409, 'Economical short promotional video requires a priced still-image ingredient route', 'ECONOMICAL_VIDEO_INGREDIENT_ROUTE_INVALID');
  }
  return {
    version: 1,
    production_mode: 'economical_short_form_video',
    duration_seconds: duration,
    generated_ingredients: [{
      type: 'still_image',
      operation: 'text_to_image',
      model_id: ingredientRoute.modelId,
      estimated_credits: ingredientRoute.estimatedCredits,
      estimated_retail_gbp: ingredientRoute.estimatedRetailGbp,
      price_snapshot_id: ingredientRoute.priceSnapshotId,
    }],
    composition: {
      engine: 'ffmpeg',
      scene_strategy: 'small_multiscene_still_heavy',
      brand_end_card: true,
      captions: true,
      cta: true,
      raw_text_to_video: false,
      estimated_generation_credits: ingredientRoute.estimatedCredits,
    },
  };
}
