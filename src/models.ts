import type { FetchClient, paths } from './types.js';
import { unwrap } from './errors.js';

type ModelsQuery = NonNullable<
  paths['/v1/models']['get']
>['parameters']['query'];

/**
 * Models API — list the public model catalog with filters.
 */
export function createModelsAPI(client: FetchClient) {
  return {
    /**
     * List available models. Public (no auth required).
     * Supports model_type, input_modalities, and output_modalities filters.
     */
    listModels(params?: ModelsQuery) {
      return client.GET('/v1/models', {
        params: params ? { query: params } : undefined,
      });
    },

    /** Convenience: list models and throw on error. */
    async listModelsOrThrow(params?: ModelsQuery) {
      return unwrap(await this.listModels(params));
    },
  };
}

export type ModelsAPI = ReturnType<typeof createModelsAPI>;
