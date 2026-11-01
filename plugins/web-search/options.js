import { SearchError } from './core.js';

export function resolveOptions(config, forms = [], resolveCredential = async () => undefined) {
  const route = config.provider ? forms.find(form => form.ns === (config.providerNamespace || 'llm-pi-ai'))?.value?.providers?.[config.provider] : undefined;
  if (config.provider && !route) throw new SearchError('The configured DSH provider route is missing or inactive.', 'WEB_CONFIG_INVALID');
  if (route?.api && route.api !== 'openai-responses') throw new SearchError('The reused DSH route must use openai-responses.', 'WEB_CONFIG_INVALID');
  const apiKeyEnv = config.apiKeyEnv || route?.apiKeyEnv;
  return {
    baseURL: config.baseURL || route?.baseURL,
    apiKey: config.apiKey,
    resolveApiKey: () => apiKeyEnv ? resolveCredential(apiKeyEnv) : undefined,
    model: config.model || 'gpt-6.1-sol',
    reasoningEffort: config.reasoningEffort || 'low',
    timeoutMs: config.timeoutMs ?? 90000,
  };
}
