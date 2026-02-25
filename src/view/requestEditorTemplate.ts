import type { RequestModel } from '../models';
import type { EnvGroupOption } from './requestView';

type KeyValueRow = {
  key: string;
  value: string;
  enabled: boolean;
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function splitUrlAndParams(rawUrl: string): { baseUrl: string; params: KeyValueRow[] } {
  try {
    const parsed = new URL(rawUrl);
    const params: KeyValueRow[] = [];
    parsed.searchParams.forEach((value, key) => {
      params.push({ key, value, enabled: true });
    });
    const baseUrl = `${parsed.origin}${parsed.pathname}`;
    return { baseUrl, params };
  } catch {
    return { baseUrl: rawUrl, params: [] };
  }
}

export function buildRequestEditorHtml(
  request: RequestModel,
  collectionPath?: string,
  envGroupOptions: EnvGroupOption[] = []
): string {
  const { baseUrl, params } = splitUrlAndParams(request.url);
  const headerRows: KeyValueRow[] = Object.entries(request.headers).map(([key, value]) => ({
    key,
    value,
    enabled: true
  }));
  const normalizedCollectionPath = (collectionPath ?? '').trim();

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>请求编辑器</title>
  <style>
    body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .topbar { display: flex; gap: 8px; align-items: center; }
    .method-select { width: 110px; }
    .url-input { flex: 1; }
    .action-group { margin-left: auto; display: flex; gap: 8px; align-items: center; }
    .save-group { display: inline-flex; border: 1px solid #d0d0d0; border-radius: 4px; overflow: hidden; background: #ffffff; }
    .save-group .btn { border: 0; border-radius: 0; background: transparent; }
    .save-group .btn + .btn { border-left: 1px solid #d0d0d0; }
    .name-row { margin-top: 10px; display: grid; grid-template-columns: 90px 1fr; gap: 8px; align-items: center; }
    .request-header { margin-bottom: 12px; }
    .request-header .name-row { margin-top: 0; }
    .request-path-wrap { display: flex; align-items: center; gap: 8px; }
    .request-path-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.4px; }
    .request-path { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #444; background: #f5f5f5; border: 1px solid #e2e2e2; border-radius: 999px; padding: 4px 10px; }
    .env-select-wrap { margin-left: auto; display: flex; align-items: center; gap: 6px; }
    .env-select-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.4px; }
    .env-select { width: 220px; }
    .path-prefix { color: #666; white-space: nowrap; }
    .path-request-name { min-width: 120px; border: 0; outline: 0; background: transparent; padding: 0; margin: 0; font-size: 12px; font-weight: 600; color: #1f1f1f; }
    .tabs { margin-top: 12px; display: flex; border-bottom: 1px solid #d9d9d9; }
    .tab { padding: 8px 12px; cursor: pointer; font-size: 13px; border-bottom: 2px solid transparent; }
    .tab.active { border-bottom-color: #007acc; color: #007acc; font-weight: 600; }
    .tab-panel { display: none; margin-top: 10px; }
    .tab-panel.active { display: block; }
    .toolbar { margin-bottom: 8px; display: flex; gap: 8px; }
    .toolbar-spacer { margin-left: auto; display: flex; align-items: center; gap: 8px; }
    .find-replace-wrap { margin-bottom: 8px; display: grid; grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr) auto auto auto auto minmax(90px, auto); gap: 6px; align-items: center; }
    .find-input { padding: 6px 8px; }
    input, select, textarea, button { font-family: inherit; font-size: 13px; }
    input, select, textarea { width: 100%; padding: 8px; border: 1px solid #cfcfcf; border-radius: 4px; box-sizing: border-box; }
    textarea { min-height: 220px; resize: none; }
    #body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; line-height: 1.5; }
    .body-resize-handle { height: 8px; margin-top: 4px; border-radius: 4px; background: linear-gradient(90deg, transparent 0%, #c9c9c9 20%, #c9c9c9 80%, transparent 100%); cursor: ns-resize; }
    .body-resize-handle:hover { background: linear-gradient(90deg, transparent 0%, #9e9e9e 20%, #9e9e9e 80%, transparent 100%); }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e5e5e5; padding: 6px; text-align: left; }
    th { background: #f8f8f8; font-weight: 600; }
    .row-actions { width: 80px; text-align: center; }
    .row-input { width: 100%; border: 1px solid #d9d9d9; border-radius: 4px; padding: 6px; }
    .checkbox { width: 16px; height: 16px; }
    .btn { border: 1px solid #d0d0d0; background: #ffffff; border-radius: 4px; padding: 6px 10px; cursor: pointer; }
    .btn-primary { background: #007acc; color: #fff; border-color: #007acc; }
    .topbar .btn { white-space: nowrap; }
    .footer { margin-top: 10px; display: flex; gap: 8px; }
    .hint { margin-top: 8px; font-size: 12px; color: #d32f2f; font-weight: 700; }
    .hidden { display: none; }
    .response-wrap { margin-top: 14px; border-top: 1px solid #e5e5e5; padding-top: 12px; }
    .response-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .response-meta { display: flex; gap: 12px; font-size: 12px; margin-bottom: 8px; }
    .response-url { font-size: 12px; color: #666; margin-bottom: 8px; word-break: break-all; }
    .response-tabs { display: flex; border-bottom: 1px solid #d9d9d9; }
    .response-tab { padding: 8px 12px; cursor: pointer; border-bottom: 2px solid transparent; font-size: 13px; }
    .response-tab.active { border-bottom-color: #007acc; color: #007acc; font-weight: 600; }
    .response-panel { display: none; margin-top: 10px; }
    .response-panel.active { display: block; }
    .response-pre { margin: 0; padding: 10px; background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-editor-foreground, #d4d4d4); border: 1px solid var(--vscode-input-border, #3c3c3c); border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; min-height: 100px; line-height: 1.5; }
    .response-empty { font-size: 12px; color: #666; }
    .json-status { font-size: 12px; color: #666; }
    .json-status.error { color: #d32f2f; font-weight: 700; }
    .json-key { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); font-weight: 700; }
    .json-string { color: var(--vscode-debugTokenExpression-string, #ce9178); font-weight: 500; }
    .json-number { color: var(--vscode-debugTokenExpression-number, #b5cea8); font-weight: 600; }
    .json-boolean { color: var(--vscode-debugTokenExpression-boolean, #569cd6); font-weight: 700; }
    .json-null { color: var(--vscode-debugTokenExpression-value, #c586c0); font-style: normal; font-weight: 700; }
  </style>
</head>
<body>
  <div class="request-header">
    <div class="request-path-wrap">
      <span class="request-path-label">Path</span>
      <div class="request-path" id="requestPath">
        <span class="path-prefix" id="pathPrefix"></span>
        <input type="text" id="pathRequestName" class="path-request-name" value="${escapeHtml(request.name)}" aria-label="请求名称">
      </div>
      <div class="env-select-wrap">
        <span class="env-select-label">Environment</span>
        <select id="envGroupSelect" class="env-select"></select>
      </div>
    </div>
  </div>

  <div class="topbar">
    <select id="method" class="method-select">
      <option value="GET" ${request.method === 'GET' ? 'selected' : ''}>GET</option>
      <option value="POST" ${request.method === 'POST' ? 'selected' : ''}>POST</option>
      <option value="PUT" ${request.method === 'PUT' ? 'selected' : ''}>PUT</option>
      <option value="DELETE" ${request.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
      <option value="PATCH" ${request.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
      <option value="HEAD" ${request.method === 'HEAD' ? 'selected' : ''}>HEAD</option>
      <option value="OPTIONS" ${request.method === 'OPTIONS' ? 'selected' : ''}>OPTIONS</option>
    </select>
    <input type="text" id="baseUrl" class="url-input" value="${escapeHtml(baseUrl)}" placeholder="https://api.example.com/resource">
    <div class="action-group">
      <button class="btn btn-primary" id="sendBtn">Send</button>
      <button class="btn" id="codeBtn">Code</button>
      <div class="save-group">
        <button class="btn" id="saveBtn">Save</button>
        <button class="btn" id="saveAsBtn">Save As</button>
      </div>
    </div>
  </div>

  <div class="tabs">
    <div class="tab active" data-tab="params">Params</div>
    <div class="tab" data-tab="headers">Headers</div>
    <div class="tab" data-tab="auth">Auth</div>
    <div class="tab" data-tab="body">Body</div>
  </div>

  <section class="tab-panel active" id="tab-params">
    <div class="toolbar">
      <button class="btn" id="addParamBtn">+ Add Param</button>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:36px;">On</th>
          <th>Key</th>
          <th>Value</th>
          <th class="row-actions">操作</th>
        </tr>
      </thead>
      <tbody id="paramsBody"></tbody>
    </table>
  </section>

  <section class="tab-panel" id="tab-headers">
    <div class="toolbar">
      <button class="btn" id="addHeaderBtn">+ Add Header</button>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:36px;">On</th>
          <th>Key</th>
          <th>Value</th>
          <th class="row-actions">操作</th>
        </tr>
      </thead>
      <tbody id="headersBody"></tbody>
    </table>
  </section>

  <section class="tab-panel" id="tab-body">
    <div class="toolbar">
      <label for="bodyMode">Body Type</label>
      <select id="bodyMode">
        <option value="raw" ${(request.bodyMode ?? 'raw') === 'raw' ? 'selected' : ''}>raw (JSON)</option>
        <option value="form-data" ${(request.bodyMode ?? 'raw') === 'form-data' ? 'selected' : ''}>form-data</option>
        <option value="x-www-form-urlencoded" ${(request.bodyMode ?? 'raw') === 'x-www-form-urlencoded' ? 'selected' : ''}>x-www-form-urlencoded</option>
      </select>
      <div id="rawBodyActions" class="toolbar-spacer">
        <button class="btn" id="copyRequestBodyBtn" type="button">Copy Body</button>
        <button class="btn" id="formatJsonBtn" type="button">Format JSON</button>
        <span id="jsonStatus" class="json-status"></span>
      </div>
    </div>
    <div id="rawBodySection">
      <div id="jsonFindReplace" class="find-replace-wrap">
        <input id="findText" class="find-input" type="text" placeholder="搜索 JSON 文本">
        <input id="replaceText" class="find-input" type="text" placeholder="替换为">
        <button class="btn" id="findPrevBtn" type="button">Prev</button>
        <button class="btn" id="findNextBtn" type="button">Next</button>
        <button class="btn" id="replaceOneBtn" type="button">Replace</button>
        <button class="btn" id="replaceAllBtn" type="button">Replace All</button>
        <span id="findStatus" class="json-status"></span>
      </div>
      <textarea id="body" spellcheck="false" placeholder='请输入 JSON 请求体，例如 {"name":"free-request"}'>${escapeHtml(request.body || '')}</textarea>
      <div id="bodyResizeHandle" class="body-resize-handle" title="拖动调整 JSON 输入框高度"></div>
    </div>
    <div id="kvBodySection" class="hidden">
      <div class="toolbar">
        <button class="btn" id="addBodyItemBtn">+ Add Field</button>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:36px;">On</th>
            <th>Key</th>
            <th>Value</th>
            <th class="row-actions">操作</th>
          </tr>
        </thead>
        <tbody id="bodyItemsBody"></tbody>
      </table>
    </div>
  </section>

  <section class="tab-panel" id="tab-auth">
    <div class="toolbar">
      <label for="authType">Auth Type</label>
      <select id="authType">
        <option value="none" ${(request.authType ?? 'none') === 'none' ? 'selected' : ''}>No Auth</option>
        <option value="bearer" ${(request.authType ?? 'none') === 'bearer' ? 'selected' : ''}>Bearer Token</option>
        <option value="basic" ${(request.authType ?? 'none') === 'basic' ? 'selected' : ''}>Basic Auth</option>
      </select>
    </div>
    <div id="bearerSection" class="hidden">
      <input type="text" id="authBearerToken" value="${escapeHtml(request.authBearerToken ?? '')}" placeholder="Bearer Token">
    </div>
    <div id="basicSection" class="hidden">
      <div class="name-row" style="margin-top:0;">
        <label for="authBasicUsername">Username</label>
        <input type="text" id="authBasicUsername" value="${escapeHtml(request.authBasicUsername ?? '')}" placeholder="Username">
      </div>
      <div class="name-row" style="margin-top:8px;">
        <label for="authBasicPassword">Password</label>
        <input type="password" id="authBasicPassword" value="${escapeHtml(request.authBasicPassword ?? '')}" placeholder="Password">
      </div>
    </div>
  </section>

  <div class="hint">支持在 URL / Header / Body / Auth 中使用自定义环境变量。例如: {{HOST}}</div>

  <div class="response-wrap">
    <div class="response-title">Response</div>
    <div id="responseEmpty" class="response-empty">点击 Send 后在此查看响应结果</div>
    <div id="responseContent" class="hidden">
      <div class="response-meta">
        <strong id="respStatus">Status: -</strong>
        <span id="respTime">Time: - ms</span>
        <span id="respSize">Size: - B</span>
      </div>
      <div id="respUrl" class="response-url"></div>

      <div class="response-tabs">
        <div class="response-tab active" data-resp-tab="body">Body</div>
        <div class="response-tab" data-resp-tab="headers">Headers</div>
      </div>

      <section id="resp-panel-body" class="response-panel active">
        <div class="toolbar">
          <button class="btn" id="copyResponseBodyBtn" type="button">Copy Body</button>
          <button class="btn" id="respPrettyBtn" type="button">Pretty</button>
          <button class="btn" id="respRawBtn" type="button">Raw</button>
          <span id="respJsonHint" class="json-status"></span>
        </div>
        <pre id="respBody" class="response-pre"></pre>
      </section>
      <section id="resp-panel-headers" class="response-panel">
        <pre id="respHeaders" class="response-pre"></pre>
      </section>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const requestId = "${request.id}";
    let requestName = ${toScriptJson(request.name)};
    const collectionPath = ${toScriptJson(normalizedCollectionPath)};
    const envGroupOptions = ${toScriptJson(envGroupOptions)};
    const initialEnvGroupId = ${toScriptJson(request.envGroupId ?? '')};
    const initialParams = ${toScriptJson(params)};
    const initialHeaders = ${toScriptJson(headerRows)};
    let responseBodyRawText = '';
    let responseBodyPrettyText = '';
    let responseBodyIsJson = false;
    let responseBodyViewMode = 'pretty';

        function populateEnvGroupSelect() {
          const envGroupSelectEl = document.getElementById('envGroupSelect');
          if (!envGroupSelectEl) {
            return;
          }

          envGroupSelectEl.innerHTML = '';

          const allOption = document.createElement('option');
          allOption.value = '';
          allOption.textContent = 'All Variables';
          envGroupSelectEl.appendChild(allOption);

          (Array.isArray(envGroupOptions) ? envGroupOptions : []).forEach((item) => {
            const optionEl = document.createElement('option');
            optionEl.value = item.id;
            optionEl.textContent = item.path;
            envGroupSelectEl.appendChild(optionEl);
          });

          envGroupSelectEl.value = initialEnvGroupId || '';
          if (envGroupSelectEl.value !== (initialEnvGroupId || '')) {
            envGroupSelectEl.value = '';
            if (initialEnvGroupId) {
              vscode.postMessage({
                command: 'envGroupFallbackNotice',
                data: { envGroupId: initialEnvGroupId }
              });
            }
          }
        }

    const initialBodyItems = ${toScriptJson(request.bodyItems ?? [])};

    function createRow(containerId, row) {
      const tbody = document.getElementById(containerId);
      if (!tbody) {
        return;
      }
      const tr = document.createElement('tr');

      const enabledTd = document.createElement('td');
      const enabledInput = document.createElement('input');
      enabledInput.className = 'checkbox row-enabled';
      enabledInput.type = 'checkbox';
      enabledInput.checked = !!row.enabled;
      enabledTd.appendChild(enabledInput);

      const keyTd = document.createElement('td');
      const keyInput = document.createElement('input');
      keyInput.className = 'row-input row-key';
      keyInput.type = 'text';
      keyInput.placeholder = 'Key';
      keyInput.value = row.key || '';
      keyTd.appendChild(keyInput);

      const valueTd = document.createElement('td');
      const valueInput = document.createElement('input');
      valueInput.className = 'row-input row-value';
      valueInput.type = 'text';
      valueInput.placeholder = 'Value';
      valueInput.value = row.value || '';
      valueTd.appendChild(valueInput);

      const actionTd = document.createElement('td');
      actionTd.className = 'row-actions';
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn row-delete';
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Del';
      deleteBtn.addEventListener('click', () => tr.remove());
      actionTd.appendChild(deleteBtn);

      tr.appendChild(enabledTd);
      tr.appendChild(keyTd);
      tr.appendChild(valueTd);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    }

    function collectRows(containerId) {
      const rows = [];
      const container = document.getElementById(containerId);
      if (!container) {
        return rows;
      }

      const trs = container.querySelectorAll('tr');
      trs.forEach((tr) => {
        const enabledEl = tr.querySelector('.row-enabled');
        const keyEl = tr.querySelector('.row-key');
        const valueEl = tr.querySelector('.row-value');
        if (!enabledEl || !keyEl || !valueEl) {
          return;
        }
        rows.push({
          enabled: enabledEl.checked,
          key: keyEl.value.trim(),
          value: valueEl.value
        });
      });
      return rows;
    }

    function buildFinalUrl(baseUrl, paramsRows) {
      const enabledRows = paramsRows.filter((r) => r.enabled && r.key);
      if (enabledRows.length === 0) {
        return baseUrl;
      }

      const searchParams = new URLSearchParams();
      enabledRows.forEach((r) => searchParams.append(r.key, r.value));
      const query = searchParams.toString();
      return query ? (baseUrl + '?' + query) : baseUrl;
    }

    function buildHeaders(headersRows) {
      const headers = {};
      headersRows
        .filter((r) => r.enabled && r.key)
        .forEach((r) => {
          headers[r.key] = r.value;
        });
      return headers;
    }

    function switchTab(tabName) {
      document.querySelectorAll('.tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
      });
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === ('tab-' + tabName));
      });
    }

    function updateRequestPath() {
      const pathPrefixEl = document.getElementById('pathPrefix');
      const requestNameEl = document.getElementById('pathRequestName');
      if (!pathPrefixEl || !requestNameEl) {
        return;
      }

      const normalizedRequestName = (requestName || '').trim() || 'untitled';
      requestNameEl.value = normalizedRequestName;
      pathPrefixEl.textContent = collectionPath ? (collectionPath + '/') : '';
    }

    function commitRequestNameRename() {
      const requestNameEl = document.getElementById('pathRequestName');
      if (!requestNameEl) {
        return;
      }

      const nextName = requestNameEl.value.trim();
      if (!nextName) {
        requestNameEl.value = requestName;
        return;
      }
      if (nextName === requestName) {
        return;
      }

      requestName = nextName;
      vscode.postMessage({
        command: 'renameRequestName',
        data: {
          id: requestId,
          name: nextName
        }
      });
      updateRequestPath();
    }

    function switchResponseTab(tabName) {
      document.querySelectorAll('.response-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.respTab === tabName);
      });
      document.querySelectorAll('.response-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === ('resp-panel-' + tabName));
      });
    }

    function updateJsonStatus(message, isError) {
      const jsonStatusEl = document.getElementById('jsonStatus');
      if (!jsonStatusEl) {
        return;
      }

      jsonStatusEl.textContent = message || '';
      jsonStatusEl.classList.toggle('error', !!isError);
    }

    function validateRawJson(showSuccess) {
      const bodyModeEl = document.getElementById('bodyMode');
      const bodyEl = document.getElementById('body');
      if (!bodyModeEl || !bodyEl) {
        return false;
      }

      if (bodyModeEl.value !== 'raw') {
        updateJsonStatus('', false);
        return true;
      }

      const text = bodyEl.value;
      if (!text || text.trim() === '') {
        updateJsonStatus('', false);
        return true;
      }

      try {
        JSON.parse(text);
        updateJsonStatus(showSuccess ? 'JSON 有效' : '', false);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'JSON 格式错误';
        updateJsonStatus('JSON 错误：' + message, true);
        return false;
      }
    }

    function formatRawJsonBody() {
      const bodyModeEl = document.getElementById('bodyMode');
      const bodyEl = document.getElementById('body');
      if (!bodyModeEl || !bodyEl || bodyModeEl.value !== 'raw') {
        return;
      }

      const text = bodyEl.value;
      if (!text || text.trim() === '') {
        updateJsonStatus('', false);
        return;
      }

      try {
        const parsed = JSON.parse(text);
        bodyEl.value = JSON.stringify(parsed, null, 2);
        updateJsonStatus('JSON 已格式化', false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'JSON 格式错误';
        updateJsonStatus('JSON 错误：' + message, true);
      }
    }

    function updateRawBodyActionsVisibility() {
      const bodyModeEl = document.getElementById('bodyMode');
      const rawBodyActionsEl = document.getElementById('rawBodyActions');
      const jsonFindReplaceEl = document.getElementById('jsonFindReplace');
      if (!bodyModeEl || !rawBodyActionsEl || !jsonFindReplaceEl) {
        return;
      }

      rawBodyActionsEl.classList.toggle('hidden', bodyModeEl.value !== 'raw');
      jsonFindReplaceEl.classList.toggle('hidden', bodyModeEl.value !== 'raw');
      if (bodyModeEl.value !== 'raw') {
        updateJsonStatus('', false);
      }
    }

    function updateFindStatus(message, isError) {
      const findStatusEl = document.getElementById('findStatus');
      if (!findStatusEl) {
        return;
      }

      findStatusEl.textContent = message || '';
      findStatusEl.classList.toggle('error', !!isError);
    }

    function findInBody(forward) {
      const bodyEl = document.getElementById('body');
      const findTextEl = document.getElementById('findText');
      if (!bodyEl || !findTextEl) {
        return false;
      }

      const query = findTextEl.value;
      if (!query) {
        updateFindStatus('请输入要搜索的文本', true);
        findTextEl.focus();
        return false;
      }

      const source = bodyEl.value;
      if (!source) {
        updateFindStatus('当前请求体为空', true);
        return false;
      }

      const cursor = forward ? bodyEl.selectionEnd : Math.max(0, bodyEl.selectionStart - 1);
      let index = forward
        ? source.indexOf(query, cursor)
        : source.lastIndexOf(query, cursor);

      if (index === -1) {
        index = forward
          ? source.indexOf(query, 0)
          : source.lastIndexOf(query);
      }

      if (index === -1) {
        updateFindStatus('未找到匹配', true);
        return false;
      }

      bodyEl.focus();
      bodyEl.setSelectionRange(index, index + query.length);
      updateFindStatus('已定位到匹配项', false);
      return true;
    }

    function replaceCurrentInBody() {
      const bodyEl = document.getElementById('body');
      const findTextEl = document.getElementById('findText');
      const replaceTextEl = document.getElementById('replaceText');
      if (!bodyEl || !findTextEl || !replaceTextEl) {
        return;
      }

      const query = findTextEl.value;
      if (!query) {
        updateFindStatus('请输入要替换的文本', true);
        findTextEl.focus();
        return;
      }

      const selectedText = bodyEl.value.slice(bodyEl.selectionStart, bodyEl.selectionEnd);
      if (selectedText !== query) {
        const found = findInBody(true);
        if (!found) {
          return;
        }
      }

      const start = bodyEl.selectionStart;
      const end = bodyEl.selectionEnd;
      const replacement = replaceTextEl.value;
      bodyEl.value = bodyEl.value.slice(0, start) + replacement + bodyEl.value.slice(end);
      bodyEl.focus();
      bodyEl.setSelectionRange(start, start + replacement.length);
      bodyEl.dispatchEvent(new Event('input'));
      updateFindStatus('已替换当前匹配', false);
    }

    function replaceAllInBody() {
      const bodyEl = document.getElementById('body');
      const findTextEl = document.getElementById('findText');
      const replaceTextEl = document.getElementById('replaceText');
      if (!bodyEl || !findTextEl || !replaceTextEl) {
        return;
      }

      const query = findTextEl.value;
      if (!query) {
        updateFindStatus('请输入要替换的文本', true);
        findTextEl.focus();
        return;
      }

      const source = bodyEl.value;
      if (!source.includes(query)) {
        updateFindStatus('未找到可替换内容', true);
        return;
      }

      let count = 0;
      let searchFrom = 0;
      while (true) {
        const index = source.indexOf(query, searchFrom);
        if (index === -1) {
          break;
        }
        count += 1;
        searchFrom = index + query.length;
      }

      bodyEl.value = source.split(query).join(replaceTextEl.value);
      bodyEl.dispatchEvent(new Event('input'));
      updateFindStatus('已替换 ' + count + ' 处', false);
    }

    function tryParseJsonText(text) {
      const normalized = typeof text === 'string' ? text.trim() : '';
      if (!normalized) {
        return { ok: false };
      }

      try {
        return {
          ok: true,
          value: JSON.parse(normalized)
        };
      } catch {
        return { ok: false };
      }
    }

    function updateResponseBodyButtons() {
      const copyBtn = document.getElementById('copyResponseBodyBtn');
      const prettyBtn = document.getElementById('respPrettyBtn');
      const rawBtn = document.getElementById('respRawBtn');
      const hintEl = document.getElementById('respJsonHint');
      if (!copyBtn || !prettyBtn || !rawBtn || !hintEl) {
        return;
      }

      copyBtn.disabled = !responseBodyRawText;
      prettyBtn.disabled = !responseBodyIsJson || responseBodyViewMode === 'pretty';
      rawBtn.disabled = !responseBodyIsJson || responseBodyViewMode === 'raw';
      hintEl.textContent = responseBodyIsJson ? 'JSON 响应，支持 Pretty/Raw 视图' : '非 JSON 响应';
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

    function updateResponseBodyView() {
      const bodyEl = document.getElementById('respBody');
      if (!bodyEl) {
        return;
      }

      const shouldUsePretty = responseBodyIsJson && responseBodyViewMode === 'pretty';
      const selectedText = shouldUsePretty ? responseBodyPrettyText : responseBodyRawText;
      if (responseBodyIsJson) {
        bodyEl.innerHTML = highlightJsonText(selectedText);
      } else {
        bodyEl.textContent = selectedText;
      }
      updateResponseBodyButtons();
    }

    function renderResponse(payload) {
      const emptyEl = document.getElementById('responseEmpty');
      const contentEl = document.getElementById('responseContent');
      const statusEl = document.getElementById('respStatus');
      const timeEl = document.getElementById('respTime');
      const sizeEl = document.getElementById('respSize');
      const urlEl = document.getElementById('respUrl');
      const bodyEl = document.getElementById('respBody');
      const headersEl = document.getElementById('respHeaders');
      if (!emptyEl || !contentEl || !statusEl || !timeEl || !sizeEl || !urlEl || !bodyEl || !headersEl) {
        return;
      }

      emptyEl.classList.add('hidden');
      contentEl.classList.remove('hidden');
      statusEl.textContent = 'Status: ' + (payload.status ?? 0) + (payload.statusText ? (' ' + payload.statusText) : '');
      timeEl.textContent = 'Time: ' + (payload.durationMs ?? 0) + ' ms';
      sizeEl.textContent = 'Size: ' + (payload.responseSizeBytes ?? 0) + ' B';
      urlEl.textContent = payload.resolvedUrl || '';

      if (payload.ok) {
        responseBodyRawText = payload.bodyText || '';
        const parsedBody = tryParseJsonText(responseBodyRawText);
        responseBodyIsJson = parsedBody.ok;
        responseBodyPrettyText = parsedBody.ok ? JSON.stringify(parsedBody.value, null, 2) : '';
        responseBodyViewMode = 'pretty';
        updateResponseBodyView();
        headersEl.textContent = payload.headersText || '';
      } else {
        responseBodyRawText = payload.errorMessage || '请求失败';
        responseBodyPrettyText = '';
        responseBodyIsJson = false;
        responseBodyViewMode = 'raw';
        updateResponseBodyView();
        headersEl.textContent = '';
      }

      switchResponseTab('body');
    }

    function toggleBodyMode() {
      const modeEl = document.getElementById('bodyMode');
      const rawSection = document.getElementById('rawBodySection');
      const kvSection = document.getElementById('kvBodySection');
      if (!modeEl || !rawSection || !kvSection) {
        return;
      }

      const mode = modeEl.value;
      rawSection.classList.toggle('hidden', mode !== 'raw');
      kvSection.classList.toggle('hidden', mode === 'raw');
      updateRawBodyActionsVisibility();
      if (mode === 'raw') {
        validateRawJson(false);
      }
    }

    function toggleAuthFields() {
      const modeEl = document.getElementById('authType');
      const bearerSection = document.getElementById('bearerSection');
      const basicSection = document.getElementById('basicSection');
      if (!modeEl || !bearerSection || !basicSection) {
        return;
      }

      const mode = modeEl.value;
      bearerSection.classList.toggle('hidden', mode !== 'bearer');
      basicSection.classList.toggle('hidden', mode !== 'basic');
    }

    function buildRequestData() {
      const bodyModeEl = document.getElementById('bodyMode');
      const bodyEl = document.getElementById('body');
      const baseUrlEl = document.getElementById('baseUrl');
      const methodEl = document.getElementById('method');
      const authTypeEl = document.getElementById('authType');
      const authBearerTokenEl = document.getElementById('authBearerToken');
      const authBasicUsernameEl = document.getElementById('authBasicUsername');
      const authBasicPasswordEl = document.getElementById('authBasicPassword');
      const envGroupSelectEl = document.getElementById('envGroupSelect');
      if (!bodyModeEl || !bodyEl || !baseUrlEl || !methodEl || !authTypeEl || !authBearerTokenEl || !authBasicUsernameEl || !authBasicPasswordEl || !envGroupSelectEl) {
        alert('编辑器初始化失败，请关闭后重新打开请求编辑页。');
        return null;
      }

      const bodyMode = bodyModeEl.value;
      const body = bodyEl.value;
      const paramsRows = collectRows('paramsBody');
      const headersRows = collectRows('headersBody');
      const bodyItemsRows = collectRows('bodyItemsBody');

      if (bodyMode === 'raw' && body && body.trim() !== '') {
        try {
          JSON.parse(body);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'JSON 格式错误';
          switchTab('body');
          updateJsonStatus('JSON 错误：' + message, true);
          bodyEl.focus();
          return null;
        }
      }

      const finalUrl = buildFinalUrl(baseUrlEl.value.trim(), paramsRows);
      const finalHeaders = buildHeaders(headersRows);

      return {
        id: requestId,
        name: requestName,
        method: methodEl.value,
        url: finalUrl,
        headers: finalHeaders,
        body: body,
        bodyMode: bodyMode,
        bodyItems: bodyItemsRows,
        authType: authTypeEl.value,
        authBearerToken: authBearerTokenEl.value,
        authBasicUsername: authBasicUsernameEl.value,
        authBasicPassword: authBasicPasswordEl.value,
        envGroupId: envGroupSelectEl.value || undefined
      };
    }

    function saveRequest() {
      const requestData = buildRequestData();
      if (!requestData) {
        return false;
      }

      vscode.postMessage({
        command: 'saveRequest',
        data: requestData
      });
      return true;
    }

    function saveAsRequest() {
      const requestData = buildRequestData();
      if (!requestData) {
        return false;
      }

      const suggestedName = (requestData.name || '').trim() ? (requestData.name + ' Copy') : 'New Request Copy';
      vscode.postMessage({
        command: 'saveAsRequest',
        data: {
          ...requestData,
          suggestedName
        }
      });
      return true;
    }

    function openCodePreview() {
      const requestData = buildRequestData();
      if (!requestData) {
        return;
      }

      vscode.postMessage({
        command: 'showCode',
        data: requestData
      });
    }

    function initBodyResize() {
      const bodyEl = document.getElementById('body');
      const resizeHandleEl = document.getElementById('bodyResizeHandle');
      if (!bodyEl || !resizeHandleEl) {
        return;
      }

      const storageKey = 'freeRequestBodyHeight:' + requestId;
      const savedHeight = Number(window.localStorage.getItem(storageKey) || '0');
      if (Number.isFinite(savedHeight) && savedHeight >= 220) {
        bodyEl.style.height = savedHeight + 'px';
      }

      const minHeight = 220;
      const maxHeight = Math.floor(window.innerHeight * 0.8);
      let startY = 0;
      let startHeight = 0;
      let resizing = false;

      const onMouseMove = (event) => {
        if (!resizing) {
          return;
        }
        const offset = event.clientY - startY;
        const nextHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + offset));
        bodyEl.style.height = nextHeight + 'px';
      };

      const onMouseUp = () => {
        if (!resizing) {
          return;
        }
        resizing = false;
        document.body.style.userSelect = '';
        window.localStorage.setItem(storageKey, String(bodyEl.offsetHeight));
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      resizeHandleEl.addEventListener('mousedown', (event) => {
        event.preventDefault();
        resizing = true;
        startY = event.clientY;
        startHeight = bodyEl.offsetHeight;
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    (Array.isArray(initialParams) ? initialParams : []).forEach((row) => createRow('paramsBody', row));
    (Array.isArray(initialHeaders) ? initialHeaders : []).forEach((row) => createRow('headersBody', row));
    (Array.isArray(initialBodyItems) ? initialBodyItems : []).forEach((row) => createRow('bodyItemsBody', row));
    if (initialParams.length === 0) createRow('paramsBody', { key: '', value: '', enabled: true });
    if (initialHeaders.length === 0) createRow('headersBody', { key: '', value: '', enabled: true });
    if (initialBodyItems.length === 0) createRow('bodyItemsBody', { key: '', value: '', enabled: true });
    populateEnvGroupSelect();
    try {
      toggleBodyMode();
      toggleAuthFields();
      initBodyResize();
    } catch (error) {
      console.error('Editor init error', error);
    }

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.querySelectorAll('.response-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchResponseTab(tab.dataset.respTab));
    });

    const addParamBtn = document.getElementById('addParamBtn');
    const addHeaderBtn = document.getElementById('addHeaderBtn');
    const addBodyItemBtn = document.getElementById('addBodyItemBtn');
    const saveBtn = document.getElementById('saveBtn');
    const saveAsBtn = document.getElementById('saveAsBtn');
    const codeBtn = document.getElementById('codeBtn');
    const bodyModeEl = document.getElementById('bodyMode');
    const bodyEl = document.getElementById('body');
    const copyRequestBodyBtn = document.getElementById('copyRequestBodyBtn');
    const formatJsonBtn = document.getElementById('formatJsonBtn');
    const findTextEl = document.getElementById('findText');
    const replaceTextEl = document.getElementById('replaceText');
    const findPrevBtn = document.getElementById('findPrevBtn');
    const findNextBtn = document.getElementById('findNextBtn');
    const replaceOneBtn = document.getElementById('replaceOneBtn');
    const replaceAllBtn = document.getElementById('replaceAllBtn');
    const authTypeEl = document.getElementById('authType');
    const pathRequestNameEl = document.getElementById('pathRequestName');
    const copyResponseBodyBtn = document.getElementById('copyResponseBodyBtn');
    const respPrettyBtn = document.getElementById('respPrettyBtn');
    const respRawBtn = document.getElementById('respRawBtn');

    addParamBtn?.addEventListener('click', () => createRow('paramsBody', { key: '', value: '', enabled: true }));
    addHeaderBtn?.addEventListener('click', () => createRow('headersBody', { key: '', value: '', enabled: true }));
    addBodyItemBtn?.addEventListener('click', () => createRow('bodyItemsBody', { key: '', value: '', enabled: true }));
    saveBtn?.addEventListener('click', saveRequest);
    saveAsBtn?.addEventListener('click', saveAsRequest);
    codeBtn?.addEventListener('click', openCodePreview);
    bodyModeEl?.addEventListener('change', toggleBodyMode);
    bodyEl?.addEventListener('input', () => validateRawJson(false));
    copyRequestBodyBtn?.addEventListener('click', () => {
      const text = bodyEl?.value || '';
      vscode.postMessage({
        command: 'copyText',
        data: {
          text,
          label: '请求 Body'
        }
      });
    });
    formatJsonBtn?.addEventListener('click', formatRawJsonBody);
    findPrevBtn?.addEventListener('click', () => findInBody(false));
    findNextBtn?.addEventListener('click', () => findInBody(true));
    replaceOneBtn?.addEventListener('click', replaceCurrentInBody);
    replaceAllBtn?.addEventListener('click', replaceAllInBody);
    findTextEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        findInBody(!event.shiftKey);
      }
    });
    replaceTextEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        replaceCurrentInBody();
      }
    });
    authTypeEl?.addEventListener('change', toggleAuthFields);
    copyResponseBodyBtn?.addEventListener('click', () => {
      const text = responseBodyIsJson && responseBodyViewMode === 'pretty'
        ? responseBodyPrettyText
        : responseBodyRawText;
      vscode.postMessage({
        command: 'copyText',
        data: {
          text,
          label: '响应 Body'
        }
      });
    });
    respPrettyBtn?.addEventListener('click', () => {
      responseBodyViewMode = 'pretty';
      updateResponseBodyView();
    });
    respRawBtn?.addEventListener('click', () => {
      responseBodyViewMode = 'raw';
      updateResponseBodyView();
    });
    pathRequestNameEl?.addEventListener('blur', commitRequestNameRename);
    pathRequestNameEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitRequestNameRename();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (pathRequestNameEl) {
          pathRequestNameEl.value = requestName;
          pathRequestNameEl.blur();
        }
      }
    });

    const sendBtn = document.getElementById('sendBtn');
    sendBtn?.addEventListener('click', () => {
      const ok = saveRequest();
      if (ok) {
        setTimeout(() => {
          vscode.postMessage({ command: 'sendRequest', data: { id: requestId } });
        }, 120);
      }
    });

    document.addEventListener('keydown', (event) => {
      const isModifierPressed = event.metaKey || event.ctrlKey;
      if (!isModifierPressed || event.key.toLowerCase() !== 's') {
        const key = event.key.toLowerCase();
        if (isModifierPressed && key === 'f') {
          event.preventDefault();
          switchTab('body');
          findTextEl?.focus();
          findTextEl?.select();
          return;
        }
        if (isModifierPressed && key === 'h') {
          event.preventDefault();
          switchTab('body');
          replaceTextEl?.focus();
          replaceTextEl?.select();
          return;
        }
        return;
      }

      event.preventDefault();
      if (event.shiftKey) {
        saveAsRequest();
      } else {
        saveRequest();
      }
    });

    updateRequestPath();
    updateResponseBodyButtons();

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || message.command !== 'requestResponse') {
        if (message && message.command === 'requestNameUpdated' && typeof message.data?.name === 'string') {
          requestName = message.data.name;
          updateRequestPath();
          return;
        }
        return;
      }
      renderResponse(message.data || {});
    });
  </script>
</body>
</html>
  `;
}
