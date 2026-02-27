import * as vscode from 'vscode';
import axios from 'axios';
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { DataStore } from '../dataStore';
import type {
  KeyValueItem,
  RequestAuthType,
  RequestBodyMode,
  RequestRawType,
  RequestModel
} from '../models';
import { parseRequestBody } from '../requestBodyParser';
import { renderRequestEditorHtml, renderResponseHtml } from '../view/requestView';
import type { EnvGroupOption, EnvGroupVariableMap } from '../view/requestView';

interface CommandNode {
  type: string;
  id: string;
}

export interface RequestControllerDeps {
  context: vscode.ExtensionContext;
  dataStore: DataStore;
  refreshCollections: () => void;
  refreshHistory: () => void;
}

interface SendRequestResult {
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  responseSizeBytes: number;
  resolvedUrl: string;
  bodyText: string;
  headersText: string;
  errorMessage?: string;
}

interface CollectionPickItem extends vscode.QuickPickItem {
  collectionId?: string;
}

const requestEditorPanels = new Map<string, Set<vscode.WebviewPanel>>();

function registerRequestEditorPanel(requestId: string, panel: vscode.WebviewPanel) {
  const existingPanels = requestEditorPanels.get(requestId) ?? new Set<vscode.WebviewPanel>();
  existingPanels.add(panel);
  requestEditorPanels.set(requestId, existingPanels);

  panel.onDidDispose(() => {
    const panels = requestEditorPanels.get(requestId);
    if (!panels) {
      return;
    }

    panels.delete(panel);
    if (panels.size === 0) {
      requestEditorPanels.delete(requestId);
    }
  });
}

export function closeRequestEditorsByIds(requestIds: string[]) {
  requestIds.forEach(requestId => {
    const panels = requestEditorPanels.get(requestId);
    if (!panels) {
      return;
    }

    const snapshot = Array.from(panels);
    snapshot.forEach(panel => panel.dispose());
    requestEditorPanels.delete(requestId);
  });
}

export function registerRequestCommands(deps: RequestControllerDeps): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('free-request.sendRequest', async (node: CommandNode) => {
      if (node?.type === 'request') {
        const request = deps.dataStore.requests.find(r => r.id === node.id);
        if (request) {
          await sendRequest(request, deps);
          deps.refreshCollections();
          deps.refreshHistory();
        }
      }
    }),

    vscode.commands.registerCommand('free-request.editRequest', async (node: CommandNode) => {
      if (node?.type === 'request') {
        const request = deps.dataStore.requests.find(r => r.id === node.id);
        if (request) {
          await openRequestEditor(request, deps);
        } else {
          vscode.window.showErrorMessage('Request not found!');
        }
      }
    })
  ];
}

export async function openRequestEditor(request: RequestModel, deps: RequestControllerDeps) {
  const collectionPath = request.collectionId
    ? buildCollectionPath(request.collectionId, deps.dataStore)
    : '';
  const tabTitle = `${request.method} ${request.name}`;

  const panel = vscode.window.createWebviewPanel(
    'freeRequestEditor',
    tabTitle,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  registerRequestEditorPanel(request.id, panel);

  const envGroupOptions = buildEnvGroupOptions(deps.dataStore);
  const envGroupVariableMap = buildEnvGroupVariableMap(deps.dataStore);
  panel.webview.html = renderRequestEditorHtml(
    request,
    collectionPath,
    envGroupOptions,
    envGroupVariableMap
  );
  let hasShownEnvFallbackNotice = false;
  let activeRequestAbortController: AbortController | undefined;

  panel.onDidDispose(() => {
    activeRequestAbortController?.abort();
    activeRequestAbortController = undefined;
  });

  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case 'envGroupFallbackNotice':
        if (!hasShownEnvFallbackNotice) {
          hasShownEnvFallbackNotice = true;
          vscode.window.showWarningMessage('当前请求关联的环境组已不存在，已自动切换为 NO ENVIRONMENTS。');
        }
        break;
      case 'saveRequest':
        saveRequestData(request.id, message.data, deps.dataStore);
        const updatedRequest = deps.dataStore.requests.find(item => item.id === request.id);
        if (updatedRequest) {
          panel.title = `${updatedRequest.method} ${updatedRequest.name}`;
        }
        await deps.dataStore.savePersistData();
        deps.refreshCollections();
        vscode.window.setStatusBarMessage('请求已成功保存！', 3000);
        break;
      case 'renameRequestName': {
        const newName = typeof message.data?.name === 'string' ? message.data.name.trim() : '';
        if (!newName) {
          break;
        }

        const targetRequest = deps.dataStore.requests.find(item => item.id === request.id);
        if (!targetRequest) {
          break;
        }
        if (targetRequest.name === newName) {
          break;
        }

        const renamed = deps.dataStore.renameRequest(request.id, newName);
        if (!renamed) {
          break;
        }

        const latestRequest = deps.dataStore.requests.find(item => item.id === request.id);
        if (latestRequest) {
          panel.title = `${latestRequest.method} ${latestRequest.name}`;
        }

        await deps.dataStore.savePersistData();
        deps.refreshCollections();
        panel.webview.postMessage({
          command: 'requestNameUpdated',
          data: { name: newName }
        });
        break;
      }
      case 'saveAsRequest': {
        const sourceRequest = deps.dataStore.requests.find(r => r.id === request.id) ?? request;
        const targetCollectionId = sourceRequest.collectionId;
        const normalizedSaveAsName = getNextSaveAsRequestName(deps.dataStore, sourceRequest);

        const newRequest = deps.dataStore.addRequest({
          name: normalizedSaveAsName,
          description: typeof message.data.description === 'string' ? message.data.description : '',
          method: message.data.method,
          url: message.data.url,
          params: Array.isArray(message.data.params) ? message.data.params : [],
          headers: message.data.headers,
          body: message.data.body,
          bodyMode: message.data.bodyMode ?? 'raw',
          rawType: message.data.rawType ?? 'json',
          bodyItems: Array.isArray(message.data.bodyItems) ? message.data.bodyItems : [],
          binaryFilePath: typeof message.data.binaryFilePath === 'string' ? message.data.binaryFilePath : '',
          graphQLQuery: typeof message.data.graphQLQuery === 'string' ? message.data.graphQLQuery : '',
          graphQLVariables: typeof message.data.graphQLVariables === 'string' ? message.data.graphQLVariables : '',
          authType: message.data.authType ?? 'none',
          authBearerToken: message.data.authBearerToken ?? '',
          authBasicUsername: message.data.authBasicUsername ?? '',
          authBasicPassword: message.data.authBasicPassword ?? '',
          envGroupId: typeof message.data.envGroupId === 'string' ? message.data.envGroupId : undefined,
          collectionId: targetCollectionId
        });

        deps.refreshCollections();
        vscode.window.setStatusBarMessage(`已另存为新请求：${newRequest.name}`, 3000);
        await openRequestEditor(newRequest, deps);
        break;
      }
      case 'browseBinaryFile': {
        const pickResult = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: false,
          canSelectFolders: false,
          openLabel: '选择二进制文件'
        });

        const selectedPath = pickResult?.[0]?.fsPath;
        if (!selectedPath) {
          break;
        }

        panel.webview.postMessage({
          command: 'binaryFileSelected',
          data: { filePath: selectedPath }
        });
        break;
      }
      case 'sendRequest': {
        if (activeRequestAbortController) {
          break;
        }

        activeRequestAbortController = new AbortController();
        panel.webview.postMessage({
          command: 'requestSendingState',
          data: { isSending: true }
        });

        const sendResult = await sendRequest(
          deps.dataStore.requests.find(r => r.id === request.id) ?? request,
          deps,
          {
            showResponsePanel: false,
            abortController: activeRequestAbortController
          }
        );

        panel.webview.postMessage({
          command: 'requestResponse',
          data: sendResult
        });

        activeRequestAbortController = undefined;
        panel.webview.postMessage({
          command: 'requestSendingState',
          data: { isSending: false }
        });

        deps.refreshCollections();
        deps.refreshHistory();
        break;
      }
      case 'cancelRequest': {
        if (!activeRequestAbortController) {
          break;
        }
        activeRequestAbortController.abort();
        activeRequestAbortController = undefined;
        panel.webview.postMessage({
          command: 'requestSendingState',
          data: { isSending: false }
        });
        vscode.window.setStatusBarMessage('请求已取消', 3000);
        break;
      }
      case 'copyText': {
        const rawText = typeof message.data?.text === 'string' ? message.data.text : '';
        if (!rawText) {
          vscode.window.showWarningMessage('没有可复制的内容');
          break;
        }

        const label = typeof message.data?.label === 'string' && message.data.label.trim()
          ? message.data.label.trim()
          : '内容';
        await vscode.env.clipboard.writeText(rawText);
        vscode.window.setStatusBarMessage(`${label} 已复制到剪贴板`, 3000);
        break;
      }
      case 'showCode': {
        const source = message.data as Record<string, unknown> | undefined;
        if (!source) {
          break;
        }

        const envGroupId = typeof source.envGroupId === 'string' ? source.envGroupId : undefined;
        const environmentMap = toEnvironmentMap(deps.dataStore, envGroupId);
        const curlCommand = buildCurlCommand(source, environmentMap);
        const name = typeof source.name === 'string' && source.name.trim()
          ? source.name.trim()
          : request.name;

        const codePanel = vscode.window.createWebviewPanel(
          'freeRequestCode',
          `Code: ${name}`,
          vscode.ViewColumn.Beside,
          { enableScripts: true }
        );
        codePanel.webview.html = buildCodePreviewHtml(curlCommand, name);
        break;
      }
    }
  }, undefined, deps.context.subscriptions);
}

export async function sendRequest(
  request: RequestModel,
  deps: RequestControllerDeps,
  options?: { showResponsePanel?: boolean; abortController?: AbortController }
): Promise<SendRequestResult> {
  let resolvedUrl = request.url;
  let inProgressStatusBarMessage: vscode.Disposable | undefined;
  try {
    const environmentMap = toEnvironmentMap(deps.dataStore, request.envGroupId);
    resolvedUrl = resolveTemplateVariables(request.url, environmentMap);
    const resolvedHeaders = Object.entries(request.headers).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = resolveTemplateVariables(value, environmentMap);
      return acc;
    }, {});
    const resolvedBodyText = resolveTemplateVariables(request.body || '', environmentMap);
    const bodyMode: RequestBodyMode = request.bodyMode ?? 'raw';
    const rawType: RequestRawType = request.rawType ?? 'json';
    const authType: RequestAuthType = request.authType ?? 'none';
    const resolvedBodyItems = resolveKeyValueItems(request.bodyItems, environmentMap);
    const resolvedGraphQLQuery = resolveTemplateVariables(request.graphQLQuery ?? '', environmentMap);
    const resolvedGraphQLVariables = resolveTemplateVariables(request.graphQLVariables ?? '', environmentMap);

    const axiosConfig: AxiosRequestConfig = {
      method: request.method,
      url: resolvedUrl,
      headers: resolvedHeaders,
      validateStatus: () => true,
      timeout: 0,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      signal: options?.abortController?.signal
    };

    if (authType === 'bearer') {
      const token = resolveTemplateVariables(request.authBearerToken ?? '', environmentMap).trim();
      if (token) {
        resolvedHeaders.Authorization = `Bearer ${token}`;
      }
    } else if (authType === 'basic') {
      axiosConfig.auth = {
        username: resolveTemplateVariables(request.authBasicUsername ?? '', environmentMap),
        password: resolveTemplateVariables(request.authBasicPassword ?? '', environmentMap)
      };
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (bodyMode === 'none') {
        delete axiosConfig.data;
      } else if (bodyMode === 'x-www-form-urlencoded') {
        const params = new URLSearchParams();
        getEnabledKeyValueItems(resolvedBodyItems).forEach(item => {
          params.append(item.key, item.value);
        });
        axiosConfig.data = params.toString();
        if (!resolvedHeaders['Content-Type']) {
          resolvedHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      } else if (bodyMode === 'form-data') {
        const formData = new FormData();
        getEnabledKeyValueItems(resolvedBodyItems).forEach(item => {
          formData.append(item.key, item.value);
        });
        axiosConfig.data = formData;
        delete resolvedHeaders['Content-Type'];
        delete resolvedHeaders['content-type'];
      } else if (bodyMode === 'binary') {
        const rawFilePath = resolveTemplateVariables(request.binaryFilePath ?? '', environmentMap).trim();
        if (!rawFilePath) {
          throw new Error('Binary 模式需要先选择文件');
        }

        const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(rawFilePath));
        axiosConfig.data = fileContent;
        if (!resolvedHeaders['Content-Type']) {
          resolvedHeaders['Content-Type'] = 'application/octet-stream';
        }
      } else if (bodyMode === 'graphql') {
        const query = resolvedGraphQLQuery.trim();
        if (!query) {
          throw new Error('GraphQL 模式下 query 不能为空');
        }

        const variables = parseGraphQLVariables(resolvedGraphQLVariables);
        axiosConfig.data = { query, variables };
        if (!resolvedHeaders['Content-Type']) {
          resolvedHeaders['Content-Type'] = 'application/json';
        }
      } else {
        if (rawType === 'json') {
          axiosConfig.data = parseRequestBody(resolvedBodyText);
          if (!resolvedHeaders['Content-Type']) {
            resolvedHeaders['Content-Type'] = 'application/json';
          }
        } else {
          axiosConfig.data = resolvedBodyText;
          if (!resolvedHeaders['Content-Type']) {
            resolvedHeaders['Content-Type'] = getRawContentType(rawType);
          }
        }
      }
    }

    inProgressStatusBarMessage = vscode.window.setStatusBarMessage(
      `正在发送 ${request.method} 请求到 ${resolvedUrl}...`
    );
    const startedAt = Date.now();
    const response: AxiosResponse = await axios(axiosConfig);
    const durationMs = Date.now() - startedAt;
    const responseSizeBytes = getResponseSizeBytes(response.data);

    deps.dataStore.updateRequestStatus(request.id, response.status);
    deps.dataStore.addHistory(request.id, response.status, resolvedUrl);

    if (options?.showResponsePanel ?? true) {
      showResponsePanel(request, response, durationMs, responseSizeBytes, resolvedUrl);
    }
    vscode.window.setStatusBarMessage(`请求成功：${response.status}`, 3000);

    return {
      ok: true,
      status: response.status,
      statusText: response.statusText || '',
      durationMs,
      responseSizeBytes,
      resolvedUrl,
      bodyText: stringifyResponseBody(response.data),
      headersText: JSON.stringify(response.headers, null, 2)
    };
  } catch (error) {
    const err = error as Error;
    const axiosErr = error as AxiosError;
    const cancelled = axiosErr.code === 'ERR_CANCELED';
    if (cancelled) {
      vscode.window.setStatusBarMessage('请求已取消', 3000);
      return {
        ok: false,
        status: 0,
        statusText: '',
        durationMs: 0,
        responseSizeBytes: 0,
        resolvedUrl,
        bodyText: '',
        headersText: '',
        errorMessage: '请求已取消'
      };
    }

    const timeoutLikeError = axiosErr.code === 'ECONNABORTED' || /timeout/i.test(err.message);
    const message = timeoutLikeError
      ? '请求超时或连接被中断，请稍后重试'
      : err.message;

    vscode.window.showErrorMessage(`请求失败：${message}`);
    deps.dataStore.updateRequestStatus(request.id, 0);
    deps.dataStore.addHistory(request.id, 0, resolvedUrl);

    return {
      ok: false,
      status: 0,
      statusText: '',
      durationMs: 0,
      responseSizeBytes: 0,
      resolvedUrl,
      bodyText: '',
      headersText: '',
      errorMessage: message
    };
  } finally {
    inProgressStatusBarMessage?.dispose();
  }
}

function saveRequestData(requestId: string, messageData: Record<string, unknown>, dataStore: DataStore) {
  const index = dataStore.requests.findIndex(r => r.id === requestId);
  if (index === -1) {
    return;
  }

  dataStore.requests[index] = {
    ...dataStore.requests[index],
    name: String(messageData.name ?? dataStore.requests[index].name),
    description: String(messageData.description ?? dataStore.requests[index].description ?? ''),
    method: (messageData.method as RequestModel['method']) ?? dataStore.requests[index].method,
    url: String(messageData.url ?? dataStore.requests[index].url),
    params: Array.isArray(messageData.params) ? messageData.params as KeyValueItem[] : [],
    headers: (messageData.headers as Record<string, string>) ?? dataStore.requests[index].headers,
    body: String(messageData.body ?? dataStore.requests[index].body ?? ''),
    bodyMode: (messageData.bodyMode as RequestBodyMode) ?? 'raw',
    rawType: (messageData.rawType as RequestRawType) ?? 'json',
    bodyItems: Array.isArray(messageData.bodyItems) ? messageData.bodyItems as KeyValueItem[] : [],
    binaryFilePath: String(messageData.binaryFilePath ?? ''),
    graphQLQuery: String(messageData.graphQLQuery ?? ''),
    graphQLVariables: String(messageData.graphQLVariables ?? ''),
    authType: (messageData.authType as RequestAuthType) ?? 'none',
    authBearerToken: String(messageData.authBearerToken ?? ''),
    authBasicUsername: String(messageData.authBasicUsername ?? ''),
    authBasicPassword: String(messageData.authBasicPassword ?? ''),
    envGroupId: typeof messageData.envGroupId === 'string' && messageData.envGroupId.trim() !== ''
      ? messageData.envGroupId
      : undefined
  };
}

function getNextSaveAsRequestName(dataStore: DataStore, sourceRequest: RequestModel): string {
  const baseName = `${sourceRequest.name} Copy`;
  const targetCollectionId = sourceRequest.collectionId;

  const usedNames = new Set(
    dataStore.requests
      .filter(request => request.collectionId === targetCollectionId)
      .map(request => request.name.trim().toLowerCase())
  );

  if (!usedNames.has(baseName.trim().toLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (true) {
    const candidate = `${baseName} (${suffix})`;
    if (!usedNames.has(candidate.trim().toLowerCase())) {
      return candidate;
    }
    suffix += 1;
  }
}

function showResponsePanel(
  request: RequestModel,
  response: AxiosResponse,
  durationMs: number,
  responseSizeBytes: number,
  resolvedUrl: string
) {
  const panel = vscode.window.createWebviewPanel(
    'freeRequestResponse',
    `响应: ${request.name} (${response.status})`,
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );

  panel.webview.html = renderResponseHtml(response, durationMs, responseSizeBytes, resolvedUrl);
}

function toEnvironmentMap(dataStore: DataStore, envGroupId?: string): Record<string, string> {
  const envList = envGroupId
    ? dataStore.environments.filter(env => env.groupId === envGroupId)
    : [];

  return envList.reduce<Record<string, string>>((acc, env) => {
    acc[env.name] = env.value;
    return acc;
  }, {});
}

function resolveTemplateVariables(content: string, environmentMap: Record<string, string>): string {
  const normalized = content
    .replace(/%7B%7B/gi, '{{')
    .replace(/%7D%7D/gi, '}}');

  return normalized.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (fullMatch, variableName: string) => {
    if (Object.prototype.hasOwnProperty.call(environmentMap, variableName)) {
      return environmentMap[variableName];
    }
    return fullMatch;
  });
}

function stringifyResponseBody(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function getResponseSizeBytes(data: unknown): number {
  const text = typeof data === 'string' ? data : stringifyResponseBody(data);
  return new TextEncoder().encode(text).length;
}

function resolveKeyValueItems(
  items: KeyValueItem[] | undefined,
  environmentMap: Record<string, string>
): KeyValueItem[] {
  return (items ?? []).map(item => ({
    key: resolveTemplateVariables(item.key, environmentMap),
    value: resolveTemplateVariables(item.value, environmentMap),
    enabled: item.enabled
  }));
}

function getEnabledKeyValueItems(items: KeyValueItem[]): KeyValueItem[] {
  return items.filter(item => item.enabled && item.key.trim() !== '');
}

function getRawContentType(rawType: RequestRawType): string {
  switch (rawType) {
    case 'text':
      return 'text/plain';
    case 'javascript':
      return 'text/javascript';
    case 'html':
      return 'text/html';
    case 'xml':
      return 'application/xml';
    case 'json':
    default:
      return 'application/json';
  }
}

function parseGraphQLVariables(rawVariables: string): Record<string, unknown> {
  const normalized = rawVariables.trim();
  if (!normalized) {
    return {};
  }

  try {
    const parsed = JSON.parse(normalized);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error('GraphQL Variables 必须是 JSON 对象');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GraphQL Variables 必须是合法 JSON';
    throw new Error(`GraphQL Variables 解析失败：${message}`);
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

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

function buildCodePreviewHtml(curlCommand: string, requestName: string): string {
  const escapedCommand = escapeHtml(curlCommand);
  const escapedName = escapeHtml(requestName);

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Code</title>
  <style>
    body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .title { margin-bottom: 10px; font-size: 13px; color: #666; }
    .toolbar { margin-bottom: 10px; display: flex; gap: 8px; }
    .btn { border: 1px solid #d0d0d0; background: #ffffff; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 13px; }
    pre { margin: 0; padding: 10px; border: 1px solid #ebebeb; border-radius: 4px; background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-editor-foreground, #d4d4d4); white-space: pre-wrap; word-break: break-word; overflow-x: auto; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="title">${escapedName} · cURL</div>
  <div class="toolbar">
    <button id="copyBtn" class="btn" type="button">Copy</button>
  </div>
  <pre id="codeBlock">${escapedCommand}</pre>

  <script>
    const commandText = ${toScriptJson(curlCommand)};

    async function copyText(text) {
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

    const copyBtn = document.getElementById('copyBtn');
    copyBtn?.addEventListener('click', async () => {
      await copyText(commandText);
    });
  </script>
</body>
</html>
  `;
}

function buildCurlCommand(source: Record<string, unknown>, environmentMap: Record<string, string>): string {
  const method = String(source.method ?? 'GET').toUpperCase();
  const url = resolveTemplateVariables(String(source.url ?? ''), environmentMap);
  const bodyMode = String(source.bodyMode ?? 'raw');
  const rawType = String(source.rawType ?? 'json');
  const body = resolveTemplateVariables(String(source.body ?? ''), environmentMap);
  const binaryFilePath = resolveTemplateVariables(String(source.binaryFilePath ?? ''), environmentMap).trim();
  const graphQLQuery = resolveTemplateVariables(String(source.graphQLQuery ?? ''), environmentMap);
  const graphQLVariables = resolveTemplateVariables(String(source.graphQLVariables ?? ''), environmentMap);
  const authType = String(source.authType ?? 'none');
  const authBearerToken = resolveTemplateVariables(String(source.authBearerToken ?? ''), environmentMap);
  const authBasicUsername = resolveTemplateVariables(String(source.authBasicUsername ?? ''), environmentMap);
  const authBasicPassword = resolveTemplateVariables(String(source.authBasicPassword ?? ''), environmentMap);
  const headersValue = source.headers;
  const bodyItemsValue = source.bodyItems;

  const lines: string[] = [];
    lines.push(`curl --request ${method} \\\n  --url ${shellQuote(url)}`);

  if (headersValue && typeof headersValue === 'object' && !Array.isArray(headersValue)) {
    Object.entries(headersValue as Record<string, unknown>).forEach(([key, value]) => {
      const resolvedHeaderValue = resolveTemplateVariables(String(value ?? ''), environmentMap);
      lines.push(`  --header ${shellQuote(`${key}: ${resolvedHeaderValue}`)}`);
    });
  }

  if (authType === 'bearer' && authBearerToken.trim()) {
    lines.push(`  --header ${shellQuote(`Authorization: Bearer ${authBearerToken}`)}`);
  }

  if (authType === 'basic') {
    lines.push(`  --user ${shellQuote(`${authBasicUsername}:${authBasicPassword}`)}`);
  }

  if (method !== 'GET' && method !== 'HEAD') {
    if (bodyMode === 'none') {
    } else if (bodyMode === 'x-www-form-urlencoded') {
      const enabledItems = (Array.isArray(bodyItemsValue) ? bodyItemsValue : [])
        .filter(item => item && typeof item === 'object' && (item as { enabled?: boolean }).enabled !== false)
        .map(item => ({
          key: resolveTemplateVariables(String((item as { key?: unknown }).key ?? ''), environmentMap),
          value: resolveTemplateVariables(String((item as { value?: unknown }).value ?? ''), environmentMap)
        }))
        .filter(item => item.key.trim() !== '');

      enabledItems.forEach(item => {
        lines.push(`  --data-urlencode ${shellQuote(`${item.key}=${item.value}`)}`);
      });
    } else if (bodyMode === 'form-data') {
      const enabledItems = (Array.isArray(bodyItemsValue) ? bodyItemsValue : [])
        .filter(item => item && typeof item === 'object' && (item as { enabled?: boolean }).enabled !== false)
        .map(item => ({
          key: resolveTemplateVariables(String((item as { key?: unknown }).key ?? ''), environmentMap),
          value: resolveTemplateVariables(String((item as { value?: unknown }).value ?? ''), environmentMap)
        }))
        .filter(item => item.key.trim() !== '');

      enabledItems.forEach(item => {
        lines.push(`  --form ${shellQuote(`${item.key}=${item.value}`)}`);
      });
    } else if (bodyMode === 'binary') {
      if (binaryFilePath) {
        lines.push(`  --data-binary ${shellQuote(`@${binaryFilePath}`)}`);
      }
    } else if (bodyMode === 'graphql') {
      const query = graphQLQuery.trim();
      const variables = graphQLVariables.trim();
      if (query) {
        const payload = {
          query,
          variables: (() => {
            if (!variables) {
              return {};
            }
            try {
              return JSON.parse(variables);
            } catch {
              return {};
            }
          })()
        };
        lines.push(`  --data-raw ${shellQuote(JSON.stringify(payload))}`);
      }
    } else if (body.trim()) {
      lines.push(`  --data-raw ${shellQuote(body)}`);
      if (rawType !== 'json') {
        lines.push(`  --header ${shellQuote(`Content-Type: ${getRawContentType(rawType as RequestRawType)}`)}`);
      }
    }
  }

    return lines.join(' \\\n');
}

function buildCollectionPath(collectionId: string, dataStore: DataStore): string {
  const pathParts: string[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = collectionId;

  while (currentId) {
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);

    const collection = dataStore.collections.find(item => item.id === currentId);
    if (!collection) {
      break;
    }

    pathParts.unshift(collection.name);
    currentId = collection.parentId;
  }

  return pathParts.join('/');
}

function buildEnvGroupOptions(dataStore: DataStore): EnvGroupOption[] {
  return dataStore.envGroups
    .map(group => ({
      id: group.id,
      path: buildEnvGroupPath(group.id, dataStore)
    }))
    .filter(item => item.path !== '')
    .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}

function buildEnvGroupPath(envGroupId: string, dataStore: DataStore): string {
  const pathParts: string[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = envGroupId;

  while (currentId) {
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);

    const envGroup = dataStore.envGroups.find(item => item.id === currentId);
    if (!envGroup) {
      break;
    }

    pathParts.unshift(envGroup.name);
    currentId = envGroup.parentId;
  }

  return pathParts.join('/');
}

function buildEnvGroupVariableMap(dataStore: DataStore): EnvGroupVariableMap {
  const map: EnvGroupVariableMap = {};

  dataStore.environments.forEach(env => {
    if (!env.groupId) {
      return;
    }

    if (!map[env.groupId]) {
      map[env.groupId] = [];
    }

    if (!map[env.groupId].some(item => item.name === env.name)) {
      map[env.groupId].push({
        name: env.name,
        value: env.value
      });
    }
  });

  Object.keys(map).forEach(groupId => {
    map[groupId].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  });

  return map;
}

function buildCollectionPickItems(dataStore: DataStore, currentCollectionId?: string): CollectionPickItem[] {
  const rootItem: CollectionPickItem = {
    label: '$(root-folder) 根目录（无 Collection）',
    description: currentCollectionId ? '' : '当前',
    collectionId: undefined
  };

  const collectionItems: CollectionPickItem[] = dataStore.collections.map(collection => {
    const path = buildCollectionPath(collection.id, dataStore);
    return {
      label: `$(folder) ${collection.name}`,
      description: path,
      detail: collection.id === currentCollectionId ? '当前 Collection' : undefined,
      collectionId: collection.id
    };
  });

  collectionItems.sort((a, b) => (a.description ?? '').localeCompare(b.description ?? '', 'zh-CN'));
  return [rootItem, ...collectionItems];
}