import test from 'node:test';
import assert from 'node:assert/strict';
import type { AxiosResponse } from 'axios';
import { buildResponseHtml } from '../view/responseTemplate';

function createResponse(data: unknown): AxiosResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} },
    request: {}
  } as AxiosResponse;
}

test('buildResponseHtml 在对象响应时应启用 Auto 格式检测与格式选择器', () => {
  const html = buildResponseHtml(
    createResponse({ ok: true, name: 'free-request' }),
    12,
    128,
    'https://example.com/api'
  );

  assert.match(html, /id="bodyFormatSelect"/);
  assert.match(html, /let bodyFormatMode = 'auto';/);
  assert.match(html, /detectedBodyFormat = detectBodyFormat\(responseBodyRaw, responseContentType\);/);
});

test('buildResponseHtml 在文本响应时仍输出 Auto 格式逻辑并保留原始内容', () => {
  const html = buildResponseHtml(
    createResponse('plain text response'),
    8,
    24,
    'https://example.com/text'
  );

  assert.match(html, /const responseBodyRaw = "plain text response";/);
  assert.match(html, /const responseContentType = "";/);
  assert.match(html, /let bodyFormatMode = 'auto';/);
});
