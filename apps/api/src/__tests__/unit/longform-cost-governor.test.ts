jest.mock('bullmq', () => ({ Queue: jest.fn().mockImplementation(() => ({ add: jest.fn() })) }));
jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../services/genx-model-registry.service', () => ({}));
jest.mock('../../services/genx-pricing.service', () => ({}));
jest.mock('../../services/generation-credit.service', () => ({}));

import { productionMode } from '../../services/longform-queue.service';

describe('long-form cost governor production intent', () => {
  test('a saved still image never reclassifies a still-motion retry as paid AI video', () => {
    expect(productionMode({
      scene_number: 3,
      source_image_url: '/uploads/studio/source.png',
      production_mode: 'still_motion',
      metadata: { generated_still_asset: true },
      project_metadata: { production_strategy: 'smart' },
    })).toBe('still_motion');
  });

  test('legacy still-motion rows with generated images remain still-motion', () => {
    expect(productionMode({
      scene_number: 3,
      source_image_url: '/uploads/studio/source.png',
      visual_prompt: 'A calm product pack shot',
      metadata: { generated_still_asset: true },
      project_metadata: { production_strategy: 'smart' },
    })).toBe('still_motion');
  });

  test('explicit AI-video intent remains AI video with an image input', () => {
    expect(productionMode({
      scene_number: 4,
      source_image_url: '/uploads/studio/keyframe.png',
      production_mode: 'ai_video',
      project_metadata: { production_strategy: 'smart' },
    })).toBe('ai_video');
  });

  test('economy defaults ordinary and hero scenes to still-motion', () => {
    expect(productionMode({ scene_number: 1, project_metadata: {}, production_strategy: 'economy' })).toBe('still_motion');
  });
});
