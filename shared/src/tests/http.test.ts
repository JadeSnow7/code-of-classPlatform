import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, ApiRequestError } from '../sdk/http.js';

const jsonHeaders = { 'content-type': 'application/json' };

test('unwraps envelope success payload', async () => {
  const client = createApiClient({
    baseUrl: 'http://example.com',
    fetchFn: async () =>
      new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: jsonHeaders,
      }),
  });

  const result = await client.get<{ ok: boolean }>('/test');
  assert.equal(result.ok, true);
});

test('unwraps legacy data payload', async () => {
  const client = createApiClient({
    baseUrl: 'http://example.com',
    fetchFn: async () =>
      new Response(JSON.stringify({ data: { value: 42 } }), {
        status: 200,
        headers: jsonHeaders,
      }),
  });

  const result = await client.get<{ value: number }>('/test');
  assert.equal(result.value, 42);
});

test('calls onUnauthorized on 401', async () => {
  let called = false;
  const client = createApiClient({
    baseUrl: 'http://example.com',
    onUnauthorized: () => {
      called = true;
    },
    fetchFn: async () =>
      new Response(JSON.stringify({ error: { message: 'unauthorized' } }), {
        status: 401,
        headers: jsonHeaders,
      }),
  });

  await assert.rejects(() => client.get('/secure'), ApiRequestError);
  assert.equal(called, true);
});
