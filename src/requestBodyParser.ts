export function parseRequestBody(body: string): unknown {
  const trimmedBody = body?.trim() ?? '';
  if (!trimmedBody) {
    return {};
  }

  try {
    return JSON.parse(trimmedBody);
  } catch {
    throw new Error('请求体必须是合法的 JSON 格式');
  }
}
