export interface GenXRouterParameterContract {
  operations: string[];
  parameters: Record<string, unknown>;
}

function schema(keys: string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: Object.fromEntries(keys.map((key) => [key, {}])),
  };
}

function isSeedanceReferenceVideoModel(id: string): boolean {
  return id.startsWith('seedance-') && (id.endsWith('-r2v') || id.endsWith('-reference'));
}

/**
 * The live Router model-detail endpoint currently returns identity, category,
 * provider and retirement state, but not the model-specific parameter schema.
 * These conservative launch contracts are limited to parameters documented by
 * GenX's public Router quick-starts / current product model family behavior.
 * Unknown models deliberately get no guessed optional parameters.
 */
export function routerParameterContract(
  modelId: string,
  category: string
): GenXRouterParameterContract | null {
  const id = modelId.trim().toLowerCase();
  const normalizedCategory = category.trim().toLowerCase();
  if (normalizedCategory !== 'video') return null;

  if (id === 'kling-avatar-v2-pro') {
    return {
      operations: ['lip_sync'],
      parameters: schema(['image_url', 'audio_url']),
    };
  }

  if (isSeedanceReferenceVideoModel(id)) {
    return {
      operations: ['reference_image_video'],
      parameters: schema(['prompt', 'reference_image', 'resolution', 'duration', 'generate_audio']),
    };
  }

  if (id.endsWith('-i2v')) {
    if (id.startsWith('seedance-2')) {
      return {
        operations: ['image_to_video'],
        parameters: schema(['prompt', 'image_url', 'resolution', 'duration', 'generate_audio']),
      };
    }
    if (id.startsWith('pixverse-v6')) {
      return {
        operations: ['image_to_video'],
        parameters: schema(['prompt', 'image_url', 'style', 'duration']),
      };
    }
    if (id.startsWith('pixverse-v5.5')) {
      return {
        operations: ['image_to_video'],
        parameters: schema(['prompt', 'image_url', 'duration']),
      };
    }
    if (id.startsWith('kling-')) {
      return {
        operations: ['image_to_video'],
        // The Router's Kling I2V quick-start uses start_image_url. The worker
        // uses a provider-neutral image_url which is translated before submit.
        parameters: schema(['prompt', 'image_url', 'duration']),
      };
    }
    if (id.startsWith('seedance-v1')) {
      return {
        operations: ['image_to_video'],
        parameters: schema(['prompt', 'image_url', 'duration']),
      };
    }
    return {
      operations: ['image_to_video'],
      parameters: schema(['prompt', 'image_url']),
    };
  }

  if (id === 'veo-3.1' || id === 'veo-3.1-fast') {
    return {
      operations: ['text_to_video'],
      parameters: schema(['prompt', 'duration', 'aspect_ratio']),
    };
  }

  if (id === 'seedance-2') {
    return {
      operations: ['text_to_video'],
      parameters: schema(['prompt', 'resolution', 'duration', 'generate_audio']),
    };
  }

  if (id.startsWith('pixverse-v6')) {
    return {
      operations: ['text_to_video'],
      parameters: schema(['prompt', 'style', 'resolution', 'duration']),
    };
  }

  if (id.startsWith('pixverse-v5.5')) {
    return {
      operations: ['text_to_video'],
      parameters: schema(['prompt', 'duration']),
    };
  }

  if (id === 'kling-v3-pro') {
    return {
      operations: ['text_to_video'],
      parameters: schema(['prompt', 'duration', 'aspect_ratio']),
    };
  }

  if (id.startsWith('kling-')) {
    return {
      operations: ['text_to_video'],
      parameters: schema(['prompt', 'duration']),
    };
  }

  if (id.startsWith('seedance-v1')) {
    return {
      operations: ['text_to_video'],
      parameters: schema(['prompt', 'duration']),
    };
  }

  if (id === 'grok-imagine-video') {
    return {
      operations: ['text_to_video'],
      // Prompt is the only parameter we can safely assert from the current
      // public contract without guessing provider-specific controls.
      parameters: schema(['prompt']),
    };
  }

  return {
    operations: ['text_to_video'],
    parameters: schema(['prompt']),
  };
}

/**
 * Translate provider-neutral worker fields into Router model-family fields.
 * We only rewrite keys where the public GenX contract is explicit.
 */
export function translateRouterGenerationParams(
  modelId: string,
  params: Record<string, unknown>
): Record<string, unknown> {
  const id = modelId.trim().toLowerCase();
  const translated = { ...params };

  if (id.startsWith('kling-') && id.endsWith('-i2v') && translated.image_url) {
    translated.start_image_url = translated.image_url;
    delete translated.image_url;
  }

  if (isSeedanceReferenceVideoModel(id) && translated.reference_image) {
    translated.image_urls = Array.isArray(translated.reference_image)
      ? translated.reference_image
      : [translated.reference_image];
    delete translated.reference_image;
  }

  return translated;
}
