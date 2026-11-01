import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { WebError } from '@deepseek-ai/dsh-web';
import { endpointOf, search } from './core.js';
import { resolveOptions } from './options.js';

export const name = 'web-search-responses';
export const inject = ['web'];
export const Config = z.object({
  provider: z.string().volatile(),
  providerNamespace: z.string().default('llm-pi-ai').volatile(),
  baseURL: z.string().volatile(),
  apiKey: z.string().role('secret').volatile(),
  apiKeyEnv: z.string().role('credential-ref').volatile(),
  model: z.string().default('gpt-6.1-sol').volatile(),
  reasoningEffort: z.union(['low', 'medium', 'high']).default('low').volatile(),
  timeoutMs: z.number().step(1).min(1000).max(300000).default(90000).volatile(),
});

export function apply(ctx, config) {
  const current = () => {
    const values = {};
    for (const key of ['provider', 'providerNamespace', 'baseURL', 'apiKey', 'apiKeyEnv', 'model', 'reasoningEffort', 'timeoutMs']) values[key] = config[key].get();
    return resolveOptions(values, values.provider ? ctx.get('settings')?.describe({ redactSecrets: true }) : [], async ref => {
      return (await ctx.get('credentials')?.resolve(credentialRef(ref)))?.value;
    });
  };
  ctx.web.registerSearchProvider({
    id: 'responses',
    available() {
      try { endpointOf(current().baseURL); return true; } catch { return false; }
    },
    async search(request, signal) {
      try { return await search(current(), request, signal); }
      catch (error) { throw new WebError(error.message, error.code ?? 'WEB_PROVIDER_ERROR'); }
    },
  });
}
