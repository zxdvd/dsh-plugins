import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { endpointOf, mapResponse, readResponse, requestBody, search } from '../plugins/web-search/core.js';
import { resolveOptions } from '../plugins/web-search/options.js';

const completed = {
  status: 'completed', output: [
    { type: 'web_search_call', status: 'completed', action: { type: 'search', sources: [{ url: 'https://example.org/extra' }] } },
    { type: 'message', content: [{ type: 'output_text', text: '中文 answer', annotations: [
      { type: 'url_citation', title: 'Official', url: 'https://example.org/' },
      { type: 'url_citation', url: 'javascript:alert(1)' },
      { type: 'url_citation', url: 'https://secret@example.org/' },
      { type: 'url_citation', title: 'Official', url: 'https://example.org/' },
    ] }] },
  ],
};
const event = value => `data: ${JSON.stringify(value)}\r\n\r\n`;
function stream(text, fragment = 7) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += fragment) controller.enqueue(bytes.slice(i, i + fragment));
    controller.close();
  } });
}

test('Codex request uses array input, SSE, low effort and hosted search', () => {
  const body = requestBody('a question');
  assert.equal(body.model, 'gpt-6.1-sol');
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.stream, true);
  assert.equal(body.store, false);
  assert.equal(body.input[0].content[0].text, 'a question');
  assert.deepEqual(body.tools, [{ type: 'web_search' }]);
  assert.equal(body.tool_choice, 'required');
  assert.equal(body.max_output_tokens, undefined);
});

test('base URL preserves gateway prefix and refuses insecure credential destinations', () => {
  assert.equal(endpointOf('https://example.org/v1/'), 'https://example.org/v1/responses');
  assert.equal(endpointOf('https://example.org/v1/responses'), 'https://example.org/v1/responses');
  assert.equal(endpointOf('http://127.0.0.1:1234/v1'), 'http://127.0.0.1:1234/v1/responses');
  for (const url of ['http://example.org/v1', 'https://key@example.org', 'https://example.org/?key=foo', 'no-url']) assert.throws(() => endpointOf(url));
});

test('SSE handles byte-by-byte UTF-8 and CRLF boundaries', async () => {
  const result = await readResponse(stream(': heartbeat\r\n\r\n' + event({ type: 'response.created' }) + event({ type: 'response.completed', response: completed }), 1));
  assert.deepEqual(result, completed);
});

test('incomplete, failed, malformed and oversized streams are errors', async () => {
  for (const text of ['data: [DONE]\n\n', event({ type: 'response.failed', error: { message: 'sk-secret' } }), 'data: {bad}\n\n']) {
    await assert.rejects(readResponse(stream(text)), error => !error.message.includes('sk-secret'));
  }
  await assert.rejects(readResponse(stream(event({ type: 'response.completed', response: completed })), { maxBytes: 3 }), { code: 'WEB_RESPONSE_TOO_LARGE' });
});

test('gateway may emit completed output items followed by an empty terminal output', async () => {
  const wire = completed.output.map((item, output_index) => event({ type: 'response.output_item.done', output_index, item })).join('') +
    event({ type: 'response.completed', response: { status: 'completed', output: [] } });
  assert.deepEqual(mapResponse(await readResponse(stream(wire))), mapResponse(completed));
  // Item completion alone must never count as response completion.
  await assert.rejects(readResponse(stream(event({ type: 'response.output_item.done', item: completed.output[0] }))), { code: 'WEB_RESPONSE_INCOMPLETE' });
});

test('citations are deduplicated and ranked before retrieved sources; unsafe URLs omitted', () => {
  assert.deepEqual(mapResponse(completed, 1), { content: '中文 answer', sources: [{ url: 'https://example.org/', title: 'Official' }], truncated: true });
  assert.throws(() => mapResponse({ status: 'completed', output: [] }), { code: 'WEB_SEARCH_NOT_EXECUTED' });
});

test('reuse existing route without copying its credential; explicit overrides win', async () => {
  const forms = [{ ns: 'llm-pi-ai', value: { providers: { existing: { api: 'openai-responses', baseURL: 'https://example.org/v1', apiKeyEnv: 'EXISTING_KEY' } } } }];
  const options = resolveOptions({ provider: 'existing' }, forms, async ref => ref === 'EXISTING_KEY' ? 'test-key' : undefined);
  assert.equal(options.baseURL, 'https://example.org/v1');
  assert.equal(await options.resolveApiKey(), 'test-key');
  assert.equal(options.apiKey, undefined);
  assert.equal(resolveOptions({ provider: 'existing', baseURL: 'https://override.org/v1', apiKey: 'override' }, forms).baseURL, 'https://override.org/v1');
  assert.throws(() => resolveOptions({ provider: 'missing' }, forms), { code: 'WEB_CONFIG_INVALID' });
});

test('real HTTP request and streaming parser interoperate', async t => {
  let captured;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const data of req) raw += data;
    captured = { path: req.url, auth: req.headers.authorization, body: JSON.parse(raw) };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"type":"response.created"}\n\n');
    res.end(event({ type: 'response.completed', response: completed }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const result = await search({ baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'test-key' }, { query: 'release?' });
  assert.equal(captured.path, '/v1/responses');
  assert.equal(captured.auth, 'Bearer test-key');
  assert.equal(captured.body.reasoning.effort, 'low');
  assert.equal(result.sources.length, 2);
});

test('HTTP errors never copy server bodies or credentials into messages', async () => {
  for (const status of [401, 403, 429, 500]) await assert.rejects(
    search({ baseURL: 'https://example.org/v1', apiKey: 'sk-secret' }, { query: 'q' }, undefined, async () => new Response('sk-secret', { status })),
    error => error.code === `WEB_HTTP_${status}` && !error.message.includes('sk-secret'),
  );
});

test('cancellation and timeout abort the actual HTTP request', async () => {
  const hangingFetch = (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort')), { once: true }));
  const options = { baseURL: 'https://example.org/v1', apiKey: 'test', timeoutMs: 15 };
  await assert.rejects(search(options, { query: 'q' }, undefined, hangingFetch), { code: 'WEB_TIMEOUT' });
  const controller = new AbortController();
  const pending = search({ ...options, timeoutMs: 1000 }, { query: 'q' }, controller.signal, hangingFetch);
  controller.abort();
  await assert.rejects(pending, { code: 'WEB_ABORTED' });
});

test('cancelled searches never send a request', async () => {
  await assert.rejects(search({ baseURL: 'https://example.org/v1' }, { query: 'q' }, AbortSignal.abort(), () => { assert.fail('must not dispatch'); }), { code: 'WEB_ABORTED' });
});

test('a stalled credential resolver is bounded by timeout', async () => {
  await assert.rejects(search({ baseURL: 'https://example.org/v1', timeoutMs: 10, resolveApiKey: () => new Promise(() => {}) }, { query: 'q' }), { code: 'WEB_TIMEOUT' });
});

test('plugin entry imports with its declared dependencies', async () => {
  const plugin = await import('../plugins/web-search/index.js');
  assert.equal(plugin.name, 'web-search-responses');
  assert.deepEqual(plugin.inject, ['web']);
});
