import type { AxiosResponse } from 'axios';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function stringifyResponseBody(data: unknown): string {
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return data;
      }
    }
    return data;
  }

  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function buildResponseHtml(
  response: AxiosResponse,
  durationMs: number,
  responseSizeBytes: number,
  resolvedUrl: string
): string {
  const responseHeaders = escapeHtml(JSON.stringify(response.headers, null, 2));
  const responseBodyRaw = typeof response.data === 'string' ? response.data : stringifyResponseBody(response.data);
  const responseBodyPretty = stringifyResponseBody(response.data);
  const responseBodyRawEscaped = escapeHtml(responseBodyRaw);
  const responseBodyPrettyEscaped = escapeHtml(responseBodyPretty);
  const isJsonLikeResponse = responseBodyRaw !== responseBodyPretty;

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>响应结果</title>
  <style>
    body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .meta { display: flex; gap: 14px; font-size: 13px; margin-bottom: 8px; align-items: center; }
    .meta strong { font-size: 14px; }
    .url { margin-bottom: 10px; font-size: 12px; color: #666; word-break: break-all; }
    .tabs { display: flex; border-bottom: 1px solid #d9d9d9; }
    .tab { padding: 8px 12px; cursor: pointer; border-bottom: 2px solid transparent; }
    .tab.active { border-bottom-color: #007acc; color: #007acc; font-weight: 600; }
    .panel { display: none; margin-top: 10px; }
    .panel.active { display: block; }
    .toolbar { margin-top: 10px; margin-bottom: 8px; display: flex; gap: 8px; align-items: center; }
    .hint { font-size: 12px; color: #666; }
    .btn { border: 1px solid #d0d0d0; background: #ffffff; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 13px; }
    pre { margin: 0; padding: 10px; background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-editor-foreground, #d4d4d4); border: 1px solid var(--vscode-input-border, #3c3c3c); border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
    .json-key { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); font-weight: 700; }
    .json-string { color: var(--vscode-debugTokenExpression-string, #ce9178); font-weight: 500; }
    .json-number { color: var(--vscode-debugTokenExpression-number, #b5cea8); font-weight: 600; }
    .json-boolean { color: var(--vscode-debugTokenExpression-boolean, #569cd6); font-weight: 700; }
    .json-null { color: var(--vscode-debugTokenExpression-value, #c586c0); font-style: normal; font-weight: 700; }
  </style>
</head>
<body>
  <div class="meta">
    <strong>Status: ${response.status} ${escapeHtml(response.statusText || '')}</strong>
    <span>Time: ${durationMs} ms</span>
    <span>Size: ${responseSizeBytes} B</span>
  </div>
  <div class="url">${escapeHtml(resolvedUrl)}</div>

  <div class="tabs">
    <div class="tab active" data-tab="body">Body</div>
    <div class="tab" data-tab="headers">Headers</div>
  </div>

  <section id="panel-body" class="panel active">
    <div class="toolbar">
      <button class="btn" id="copyBodyBtn" type="button">Copy Body</button>
      <button class="btn" id="prettyBtn" type="button">Pretty</button>
      <button class="btn" id="rawBtn" type="button">Raw</button>
      <span class="hint" id="formatHint"></span>
    </div>
    <pre id="responseBody">${responseBodyPrettyEscaped}</pre>
  </section>
  <section id="panel-headers" class="panel">
    <pre>${responseHeaders}</pre>
  </section>

  <script>
    const responseBodyRaw = ${toScriptJson(responseBodyRaw)};
    const responseBodyPretty = ${toScriptJson(responseBodyPretty)};
    const hasPrettyView = ${isJsonLikeResponse ? 'true' : 'false'};
    let bodyViewMode = 'pretty';

    function switchTab(tabName) {
      document.querySelectorAll('.tabs .tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
      });
      document.querySelectorAll('.panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === ('panel-' + tabName));
      });
    }

    function updateBodyView() {
      const bodyEl = document.getElementById('responseBody');
      const copyBtn = document.getElementById('copyBodyBtn');
      const prettyBtn = document.getElementById('prettyBtn');
      const rawBtn = document.getElementById('rawBtn');
      const formatHint = document.getElementById('formatHint');
      if (!bodyEl || !copyBtn || !prettyBtn || !rawBtn || !formatHint) {
        return;
      }

      const usePretty = hasPrettyView && bodyViewMode === 'pretty';
      const selectedText = usePretty ? responseBodyPretty : responseBodyRaw;
      if (hasPrettyView) {
        bodyEl.innerHTML = highlightJsonText(selectedText);
      } else {
        bodyEl.textContent = selectedText;
      }

      copyBtn.disabled = !responseBodyRaw;
      prettyBtn.disabled = !hasPrettyView || bodyViewMode === 'pretty';
      rawBtn.disabled = !hasPrettyView || bodyViewMode === 'raw';
      formatHint.textContent = hasPrettyView ? 'JSON 响应，支持 Pretty/Raw 视图' : '非 JSON 响应';
    }

    function escapeHtmlForDisplay(input) {
      return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function highlightJsonText(text) {
      const escaped = escapeHtmlForDisplay(text);
      return escaped.replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\\"])*"\s*:?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g, (match) => {
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            return '<span class="json-key">' + match + '</span>';
          }
          return '<span class="json-string">' + match + '</span>';
        }
        if (/true|false/.test(match)) {
          return '<span class="json-boolean">' + match + '</span>';
        }
        if (/null/.test(match)) {
          return '<span class="json-null">' + match + '</span>';
        }
        return '<span class="json-number">' + match + '</span>';
      });
    }

    async function copyText(text) {
      if (!text) {
        return;
      }

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return;
      }

      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }

    document.querySelectorAll('.tabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    const prettyBtn = document.getElementById('prettyBtn');
    const rawBtn = document.getElementById('rawBtn');
    const copyBtn = document.getElementById('copyBodyBtn');

    prettyBtn?.addEventListener('click', () => {
      bodyViewMode = 'pretty';
      updateBodyView();
    });

    rawBtn?.addEventListener('click', () => {
      bodyViewMode = 'raw';
      updateBodyView();
    });

    copyBtn?.addEventListener('click', async () => {
      const text = hasPrettyView && bodyViewMode === 'pretty' ? responseBodyPretty : responseBodyRaw;
      try {
        await copyText(text);
        formatHint.textContent = 'Body 已复制到剪贴板';
      } catch {
        formatHint.textContent = '复制失败，请手动选择内容';
      }
    });

    updateBodyView();
  </script>
</body>
</html>
  `;
}
