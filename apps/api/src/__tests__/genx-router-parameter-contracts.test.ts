import {
  routerParameterContract,
  translateRouterGenerationParams,
} from '../providers/genx-router-parameter-contracts';

describe('GenX Router media parameter contracts', () => {
  test('Veo launch contract exposes documented duration and aspect ratio', () => {
    const contract = routerParameterContract('veo-3.1', 'video');
    expect(contract?.operations).toEqual(['text_to_video']);
    expect(contract?.parameters).toEqual(expect.objectContaining({
      properties: expect.objectContaining({
        prompt: {},
        duration: {},
        aspect_ratio: {},
      }),
    }));
  });

  test('Seedance 2 T2V exposes documented resolution, duration and audio control', () => {
    const contract = routerParameterContract('seedance-2', 'video');
    expect(contract?.operations).toEqual(['text_to_video']);
    expect(contract?.parameters).toEqual(expect.objectContaining({
      properties: expect.objectContaining({
        prompt: {},
        resolution: {},
        duration: {},
        generate_audio: {},
      }),
    }));
  });

  test('PixVerse v6 exposes documented style, resolution and duration', () => {
    const contract = routerParameterContract('pixverse-v6', 'video');
    expect(contract?.operations).toEqual(['text_to_video']);
    expect(contract?.parameters).toEqual(expect.objectContaining({
      properties: expect.objectContaining({
        prompt: {},
        style: {},
        resolution: {},
        duration: {},
      }),
    }));
  });

  test('Kling I2V keeps provider-neutral image field in the worker contract', () => {
    const contract = routerParameterContract('kling-v2.6-pro-i2v', 'video');
    expect(contract?.operations).toEqual(['image_to_video']);
    expect(contract?.parameters).toEqual(expect.objectContaining({
      properties: expect.objectContaining({
        prompt: {},
        image_url: {},
        duration: {},
      }),
    }));
  });

  test('Kling I2V translates image_url to documented start_image_url at submit time', () => {
    expect(translateRouterGenerationParams('kling-v2.6-pro-i2v', {
      prompt: 'A portrait smiles',
      image_url: 'https://example.com/portrait.jpg',
      duration: 5,
    })).toEqual({
      prompt: 'A portrait smiles',
      start_image_url: 'https://example.com/portrait.jpg',
      duration: 5,
    });
  });

  test('Seedance reference video translates one reference image to image_urls', () => {
    expect(translateRouterGenerationParams('seedance-2-r2v', {
      prompt: 'Walk through the city',
      reference_image: 'https://example.com/character.jpg',
      duration: 8,
    })).toEqual({
      prompt: 'Walk through the city',
      image_urls: ['https://example.com/character.jpg'],
      duration: 8,
    });
  });

  test('avatar model is classified as lip sync rather than generic text-to-video', () => {
    const contract = routerParameterContract('kling-avatar-v2-pro', 'video');
    expect(contract?.operations).toEqual(['lip_sync']);
    expect(contract?.parameters).toEqual(expect.objectContaining({
      properties: expect.objectContaining({ image_url: {}, audio_url: {} }),
    }));
  });

  test('unknown video models receive prompt-only fallback rather than guessed controls', () => {
    const contract = routerParameterContract('future-video-model', 'video');
    expect(contract?.operations).toEqual(['text_to_video']);
    expect(contract?.parameters).toEqual({
      type: 'object',
      properties: { prompt: {} },
    });
  });
});
