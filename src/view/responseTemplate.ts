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

function getContentTypeFromHeaders(headers: unknown): string {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return '';
  }

  const match = Object.entries(headers as Record<string, unknown>)
    .find(([key]) => key.toLowerCase() === 'content-type');
  return match ? String(match[1] ?? '') : '';
}

function buildResponseBodyViews(data: unknown): { raw: string; pretty: string; isJson: boolean } {
  if (typeof data === 'string') {
    const raw = data;
    const trimmed = data.trim();
    if (!trimmed) {
      return { raw, pretty: raw, isJson: false };
    }

    try {
      const parsed = JSON.parse(trimmed);
      return {
        raw,
        pretty: JSON.stringify(parsed, null, 2),
        isJson: true
      };
    } catch {
      return { raw, pretty: raw, isJson: false };
    }
  }

  if (data === null || data === undefined) {
    const raw = String(data ?? '');
    return { raw, pretty: raw, isJson: false };
  }

  if (typeof data === 'object') {
    try {
      return {
        raw: JSON.stringify(data),
        pretty: JSON.stringify(data, null, 2),
        isJson: true
      };
    } catch {
      const fallback = String(data);
      return { raw: fallback, pretty: fallback, isJson: false };
    }
  }

  const raw = String(data);
  return { raw, pretty: raw, isJson: false };
}

export function buildResponseHtml(
  response: AxiosResponse,
  durationMs: number,
  responseSizeBytes: number,
  resolvedUrl: string
): string {
  const responseHeaders = escapeHtml(JSON.stringify(response.headers, null, 2));
  const responseBodyViews = buildResponseBodyViews(response.data);
  const responseBodyRaw = responseBodyViews.raw;
  const responseBodyRawEscaped = escapeHtml(responseBodyRaw);
  const responseContentType = getContentTypeFromHeaders(response.headers);

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
    .response-body-wrap { position: relative; }
    .search-widget {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 10;
      width: min(420px, calc(100% - 16px));
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 6px;
      border: 1px solid var(--vscode-editorWidget-border, #d0d7de);
      border-radius: 4px;
      background: var(--vscode-editorWidget-background, #ffffff);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    }
    .search-widget.hidden { display: none; }
    .search-input {
      flex: 1;
      min-width: 0;
      height: 28px;
      padding: 4px 8px;
      border: 1px solid var(--vscode-input-border, #cfcfcf);
      border-radius: 3px;
      background: var(--vscode-input-background, #ffffff);
      color: var(--vscode-input-foreground, #1f2328);
      font-size: 13px;
    }
    .search-btn-group { display: inline-flex; border: 1px solid #d0d0d0; border-radius: 3px; overflow: hidden; }
    .search-btn { border: 0; border-right: 1px solid #d0d0d0; border-radius: 0; min-width: 30px; padding: 4px 8px; }
    .search-btn:last-child { border-right: 0; }
    .search-status { min-width: 56px; text-align: right; font-size: 12px; color: #666; }
    .search-close { min-width: 28px; font-weight: 700; }
    pre { margin: 0; padding: 10px; background: #f7f8fa; color: #1f2328; border: 1px solid #d0d7de; border-radius: 4px; overflow-x: auto; overflow-y: auto; max-height: 64vh; white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
    pre.no-wrap { white-space: pre; word-break: normal; }
    .json-key { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); font-weight: 700; }
    .json-string { color: var(--vscode-debugTokenExpression-string, #ce9178); font-weight: 500; }
    .json-number { color: var(--vscode-debugTokenExpression-number, #b5cea8); font-weight: 600; }
    .json-boolean { color: var(--vscode-debugTokenExpression-boolean, #569cd6); font-weight: 700; }
    .json-null { color: var(--vscode-debugTokenExpression-value, #c586c0); font-style: normal; font-weight: 700; }
    .find-hit { background: rgba(255, 215, 0, 0.38); border-radius: 2px; }
    .find-hit.active { background: rgba(255, 149, 0, 0.55); outline: 1px solid rgba(255, 149, 0, 0.9); }
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
      <button class="btn" id="wrapBodyBtn" type="button">自动换行</button>
      <button class="btn" id="prettyBtn" type="button">Pretty</button>
      <button class="btn" id="rawBtn" type="button">Raw</button>
      <select id="bodyFormatSelect" style="width: 140px;">
        <option value="auto">Auto</option>
        <option value="json">JSON</option>
        <option value="xml">XML</option>
        <option value="html">HTML</option>
        <option value="text">Text</option>
      </select>
      <span class="hint" id="formatHint"></span>
      <div style="margin-left:auto; display:flex; align-items:center; gap:8px;">
        <button class="btn" id="searchBodyBtn" type="button">搜索</button>
      </div>
    </div>
    <div class="response-body-wrap">
      <div id="searchWidget" class="search-widget hidden">
        <input id="searchInput" class="search-input" type="text" placeholder="查找响应内容">
        <div class="search-btn-group">
          <button class="btn search-btn" id="searchPrevBtn" type="button" aria-label="上一项">↑</button>
          <button class="btn search-btn" id="searchNextBtn" type="button" aria-label="下一项">↓</button>
        </div>
        <span id="searchStatus" class="search-status"></span>
        <button class="btn search-btn search-close" id="searchCloseBtn" type="button" aria-label="关闭查找">×</button>
      </div>
      <pre id="responseBody">${responseBodyRawEscaped}</pre>
    </div>
  </section>
  <section id="panel-headers" class="panel">
    <pre>${responseHeaders}</pre>
  </section>

  <script>
    const responseBodyRaw = ${toScriptJson(responseBodyRaw)};
    const responseContentType = ${toScriptJson(responseContentType)};
    const wrapStorageKey = 'freeRequestStandaloneResponseWrapEnabled';
    let bodyViewMode = 'pretty';
    let bodyWrapEnabled = true;
    let bodyFormatMode = 'auto';
    let detectedBodyFormat = 'text';
    let isSearchVisible = false;
    let currentMatchIndex = -1;
    let matchElements = [];

    try {
      const storedWrapState = window.localStorage.getItem(wrapStorageKey);
      if (storedWrapState === 'false') {
        bodyWrapEnabled = false;
      }
      if (storedWrapState === 'true') {
        bodyWrapEnabled = true;
      }
    } catch {
      // ignore localStorage read errors in restricted environments
    }

    function updateSearchStatus(message) {
      const statusEl = document.getElementById('searchStatus');
      if (!statusEl) {
        return;
      }
      statusEl.textContent = message || '';
    }

    function clearHighlights() {
      const bodyEl = document.getElementById('responseBody');
      if (!bodyEl) {
        return;
      }

      bodyEl.querySelectorAll('span.find-hit').forEach((node) => {
        const parent = node.parentNode;
        if (!parent) {
          return;
        }
        parent.replaceChild(document.createTextNode(node.textContent || ''), node);
        parent.normalize();
      });

      matchElements = [];
      currentMatchIndex = -1;
      updateSearchStatus('');
    }

    function walkTextNodes(root) {
      const nodes = [];
      if (!root) {
        return nodes;
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        nodes.push(current);
        current = walker.nextNode();
      }
      return nodes;
    }

    function applyHighlights(query) {
      const bodyEl = document.getElementById('responseBody');
      if (!bodyEl) {
        return;
      }
      clearHighlights();
      if (!query) {
        return;
      }

      const textNodes = walkTextNodes(bodyEl);
      textNodes.forEach((textNode) => {
        const text = textNode.textContent || '';
        if (!text) {
          return;
        }

        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        let from = 0;
        let matchIndex = lowerText.indexOf(lowerQuery, from);
        if (matchIndex === -1) {
          return;
        }

        const fragment = document.createDocumentFragment();
        while (matchIndex !== -1) {
          const before = text.slice(from, matchIndex);
          if (before) {
            fragment.appendChild(document.createTextNode(before));
          }

          const hitEl = document.createElement('span');
          hitEl.className = 'find-hit';
          hitEl.textContent = text.slice(matchIndex, matchIndex + query.length);
          fragment.appendChild(hitEl);
          matchElements.push(hitEl);

          from = matchIndex + query.length;
          matchIndex = lowerText.indexOf(lowerQuery, from);
        }

        const tail = text.slice(from);
        if (tail) {
          fragment.appendChild(document.createTextNode(tail));
        }

        textNode.parentNode?.replaceChild(fragment, textNode);
      });

      if (matchElements.length > 0) {
        currentMatchIndex = 0;
        activateCurrentMatch();
      } else {
        updateSearchStatus('0');
      }
    }

    function activateCurrentMatch() {
      if (matchElements.length === 0 || currentMatchIndex < 0) {
        updateSearchStatus('0');
        return;
      }

      matchElements.forEach((node, index) => {
        node.classList.toggle('active', index === currentMatchIndex);
      });

      const current = matchElements[currentMatchIndex];
      const bodyEl = document.getElementById('responseBody');
      current?.scrollIntoView({ block: 'center', inline: 'nearest' });
      bodyEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      updateSearchStatus((currentMatchIndex + 1) + '/' + matchElements.length);
    }

    function jumpMatch(forward) {
      if (matchElements.length === 0) {
        updateSearchStatus('0');
        return;
      }
      currentMatchIndex = forward
        ? (currentMatchIndex + 1) % matchElements.length
        : (currentMatchIndex - 1 + matchElements.length) % matchElements.length;
      activateCurrentMatch();
    }

    function showSearchWidget() {
      const widgetEl = document.getElementById('searchWidget');
      const inputEl = document.getElementById('searchInput');
      if (!widgetEl || !inputEl) {
        return;
      }
      isSearchVisible = true;
      widgetEl.classList.remove('hidden');
      inputEl.focus();
      inputEl.select();
    }

    function hideSearchWidget() {
      const widgetEl = document.getElementById('searchWidget');
      if (!widgetEl) {
        return;
      }
      isSearchVisible = false;
      widgetEl.classList.add('hidden');
      clearHighlights();
    }

    function switchTab(tabName) {
      document.querySelectorAll('.tabs .tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
      });
      document.querySelectorAll('.panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === ('panel-' + tabName));
      });
    }

    function normalizeBodyFormat(format) {
      const normalized = String(format || '').trim().toLowerCase();
      if (normalized === 'json' || normalized === 'xml' || normalized === 'html' || normalized === 'text' || normalized === 'auto') {
        return normalized;
      }
      return 'auto';
    }

    function detectBodyFormat(rawText, contentType) {
      const lowerContentType = String(contentType || '').toLowerCase();
      const trimmed = String(rawText || '').trim();

      if (lowerContentType.includes('json')) {
        return 'json';
      }
      if (lowerContentType.includes('html')) {
        return 'html';
      }
      if (lowerContentType.includes('xml')) {
        return 'xml';
      }
      if (lowerContentType.startsWith('text/')) {
        return 'text';
      }

      if (trimmed) {
        try {
          JSON.parse(trimmed);
          return 'json';
        } catch {
          const lowerTrimmed = trimmed.toLowerCase();
          if (lowerTrimmed.startsWith('<!doctype html') || lowerTrimmed.startsWith('<html')) {
            return 'html';
          }
          if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
            return 'xml';
          }
        }
      }

      return 'text';
    }

    function formatXmlLikeText(rawText) {
      const source = String(rawText || '').trim();
      if (!source) {
        return '';
      }

      const tokens = source.replace(/>\s*</g, '><').split(/(<[^>]+>)/g).filter(Boolean);
      let indent = 0;
      const lines = [];

      tokens.forEach((token) => {
        const piece = token.trim();
        if (!piece) {
          return;
        }

        const isClosingTag = /^<\\//.test(piece);
        const isSelfClosingTag = /^<[^>]+\\/>$/.test(piece) || /^<\\?/.test(piece) || /^<!/.test(piece);
        const isOpeningTag = /^<[^/!][^>]*>$/.test(piece);

        if (isClosingTag) {
          indent = Math.max(0, indent - 1);
        }

        lines.push('  '.repeat(indent) + piece);

        if (isOpeningTag && !isSelfClosingTag && !isClosingTag) {
          indent += 1;
        }
      });

      return lines.join('\\n');
    }

    function buildPrettyBodyText(rawText, format) {
      const source = String(rawText || '');
      if (!source.trim()) {
        return '';
      }

      if (format === 'json') {
        try {
          return JSON.stringify(JSON.parse(source), null, 2);
        } catch {
          return source;
        }
      }

      if (format === 'xml' || format === 'html') {
        return formatXmlLikeText(source);
      }

      return source;
    }

    function getEffectiveBodyFormat() {
      return bodyFormatMode === 'auto' ? detectedBodyFormat : bodyFormatMode;
    }

    function updateBodyView() {
      const bodyEl = document.getElementById('responseBody');
      const copyBtn = document.getElementById('copyBodyBtn');
      const wrapBtn = document.getElementById('wrapBodyBtn');
      const prettyBtn = document.getElementById('prettyBtn');
      const rawBtn = document.getElementById('rawBtn');
      const bodyFormatSelectEl = document.getElementById('bodyFormatSelect');
      const formatHint = document.getElementById('formatHint');
      const searchInputEl = document.getElementById('searchInput');
      if (!bodyEl || !copyBtn || !wrapBtn || !prettyBtn || !rawBtn || !bodyFormatSelectEl || !formatHint) {
        return;
      }

      const hasBody = !!responseBodyRaw;
      const effectiveFormat = getEffectiveBodyFormat();
      const usePretty = hasBody && bodyViewMode === 'pretty';
      const prettyText = usePretty ? buildPrettyBodyText(responseBodyRaw, effectiveFormat) : '';
      if (usePretty && effectiveFormat === 'json') {
        try {
          bodyEl.innerHTML = renderJsonValue(JSON.parse(prettyText), 0);
        } catch {
          bodyEl.textContent = prettyText;
        }
      } else if (usePretty) {
        bodyEl.textContent = prettyText;
      } else {
        bodyEl.textContent = responseBodyRaw;
      }
      bodyEl.classList.toggle('no-wrap', !bodyWrapEnabled);

      copyBtn.disabled = !responseBodyRaw;
      wrapBtn.disabled = !hasBody;
      wrapBtn.textContent = bodyWrapEnabled ? '自动换行' : '不换行';
      prettyBtn.disabled = !hasBody || bodyViewMode === 'pretty';
      rawBtn.disabled = !hasBody || bodyViewMode === 'raw';
      bodyFormatSelectEl.value = normalizeBodyFormat(bodyFormatMode);
      if (!hasBody) {
        formatHint.textContent = '暂无响应内容';
      } else {
        const formatLabel = bodyFormatMode === 'auto'
          ? 'Auto (' + String(effectiveFormat).toUpperCase() + ')'
          : String(effectiveFormat).toUpperCase();
        formatHint.textContent = '响应格式：' + formatLabel;
      }

      if (isSearchVisible) {
        applyHighlights(searchInputEl?.value || '');
      } else {
        clearHighlights();
      }
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
      return escaped.replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\\"])*"\\s*:?|\\btrue\\b|\\bfalse\\b|\\bnull\\b|-?\\d+(?:\\.\\d+)?(?:[eE][+\\-]?\\d+)?)/g, (match) => {
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

    function renderJsonPrimitive(value) {
      if (value === null) {
        return '<span class="json-null">null</span>';
      }
      if (typeof value === 'number') {
        return '<span class="json-number">' + String(value) + '</span>';
      }
      if (typeof value === 'boolean') {
        return '<span class="json-boolean">' + String(value) + '</span>';
      }
      return '<span class="json-string">"' + escapeHtmlForDisplay(String(value)) + '"</span>';
    }

    function renderJsonValue(value, indentLevel) {
      const indentUnit = '  ';
      const currentIndent = indentUnit.repeat(indentLevel);
      const nextIndent = indentUnit.repeat(indentLevel + 1);

      if (Array.isArray(value)) {
        if (value.length === 0) {
          return '[]';
        }
        const items = value.map((item) => nextIndent + renderJsonValue(item, indentLevel + 1));
        return '[\\n' + items.join(',\\n') + '\\n' + currentIndent + ']';
      }

      if (value && typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) {
          return '{}';
        }
        const lines = entries.map(([key, item]) => {
          return (
            nextIndent +
            '<span class="json-key">"' + escapeHtmlForDisplay(key) + '"</span>: ' +
            renderJsonValue(item, indentLevel + 1)
          );
        });
        return '{\\n' + lines.join(',\\n') + '\\n' + currentIndent + '}';
      }

      return renderJsonPrimitive(value);
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
    const searchBtn = document.getElementById('searchBodyBtn');
    const wrapBtn = document.getElementById('wrapBodyBtn');
    const bodyFormatSelectEl = document.getElementById('bodyFormatSelect');
    const searchInputEl = document.getElementById('searchInput');
    const searchPrevBtn = document.getElementById('searchPrevBtn');
    const searchNextBtn = document.getElementById('searchNextBtn');
    const searchCloseBtn = document.getElementById('searchCloseBtn');

    prettyBtn?.addEventListener('click', () => {
      bodyViewMode = 'pretty';
      updateBodyView();
    });

    rawBtn?.addEventListener('click', () => {
      bodyViewMode = 'raw';
      updateBodyView();
    });

    bodyFormatSelectEl?.addEventListener('change', () => {
      bodyFormatMode = normalizeBodyFormat(bodyFormatSelectEl.value);
      updateBodyView();
    });

    wrapBtn?.addEventListener('click', () => {
      bodyWrapEnabled = !bodyWrapEnabled;
      try {
        window.localStorage.setItem(wrapStorageKey, bodyWrapEnabled ? 'true' : 'false');
      } catch {
        // ignore localStorage write errors in restricted environments
      }
      updateBodyView();
    });

    searchBtn?.addEventListener('click', () => {
      showSearchWidget();
    });

    copyBtn?.addEventListener('click', async () => {
      const effectiveFormat = getEffectiveBodyFormat();
      const text = bodyViewMode === 'pretty'
        ? buildPrettyBodyText(responseBodyRaw, effectiveFormat)
        : responseBodyRaw;
      try {
        await copyText(text);
        formatHint.textContent = 'Body 已复制到剪贴板';
      } catch {
        formatHint.textContent = '复制失败，请手动选择内容';
      }
    });

    searchInputEl?.addEventListener('input', () => {
      applyHighlights(searchInputEl.value || '');
    });
    searchInputEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        jumpMatch(!event.shiftKey);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        hideSearchWidget();
      }
    });
    searchPrevBtn?.addEventListener('click', () => jumpMatch(false));
    searchNextBtn?.addEventListener('click', () => jumpMatch(true));
    searchCloseBtn?.addEventListener('click', hideSearchWidget);

    document.addEventListener('keydown', (event) => {
      const isFindShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f';
      if (isFindShortcut) {
        event.preventDefault();
        showSearchWidget();
        return;
      }
      if (event.key === 'Escape' && isSearchVisible) {
        event.preventDefault();
        hideSearchWidget();
      }
    });

    detectedBodyFormat = detectBodyFormat(responseBodyRaw, responseContentType);
    bodyFormatMode = 'auto';
    bodyViewMode = responseBodyRaw ? 'pretty' : 'raw';
    updateBodyView();
  </script>
</body>
</html>
  `;
}
