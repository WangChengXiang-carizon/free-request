import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequestBody } from '../requestBodyParser';

test('parseRequestBody 应正确解析合法 JSON', () => {
  const data = parseRequestBody('{"name":"free-request","enabled":true}') as Record<string, unknown>;
  assert.equal(data.name, 'free-request');
  assert.equal(data.enabled, true);
});

test('parseRequestBody 在空字符串时返回空对象', () => {
  const data = parseRequestBody('   ') as Record<string, unknown>;
  assert.deepEqual(data, {});
});

test('parseRequestBody 在非法 JSON 时抛出错误', () => {
  assert.throws(
    () => parseRequestBody('{name:"free-request"}'),
    /请求体必须是合法的 JSON 格式/
  );
});
