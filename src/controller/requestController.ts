import * as vscode from 'vscode';
import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { DataStore } from '../dataStore';
import type {
  KeyValueItem,
  RequestAuthType,
  RequestBodyMode,
  RequestModel
} from '../models';
import { parseRequestBody } from '../requestBodyParser';
import { renderRequestEditorHtml, renderResponseHtml } from '../view/requestView';
import type { ShowInputDialog } from '../view/input';
import type { EnvGroupOption } from '../view/requestView';

interface CommandNode {
  type: string;
  id: string;
}

export interface RequestControllerDeps {
  context: vscode.ExtensionContext;
  dataStore: DataStore;
  refreshCollections: () => void;
  refreshHistory: () => void;
  showInputDialog: ShowInputDialog;
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

  const envGroupOptions = buildEnvGroupOptions(deps.dataStore);
  panel.webview.html = renderRequestEditorHtml(request, collectionPath, envGroupOptions);
  let hasShownEnvFallbackNotice = false;

  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case 'envGroupFallbackNotice':
        if (!hasShownEnvFallbackNotice) {
          hasShownEnvFallbackNotice = true;
          vscode.window.showWarningMessage('当前请求关联的环境组已不存在，已自动切换为 All Variables。');
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
        vscode.window.showInformationMessage('请求已成功保存！');
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
        const suggestedName = typeof message.data?.suggestedName === 'string' && message.data.suggestedName.trim()
          ? message.data.suggestedName.trim()
          : `${request.name} Copy`;

        const saveAsName = await deps.showInputDialog(
          '另存为请求',
          '请输入另存为的新请求名称',
          suggestedName,
          value => value && value.trim() ? null : '名称不能为空',
          suggestedName
        );

        if (!saveAsName || !saveAsName.trim()) {
          break;
        }

        const normalizedSaveAsName = saveAsName.trim();
        const sourceRequest = deps.dataStore.requests.find(r => r.id === request.id) ?? request;

        const collectionPickItems = buildCollectionPickItems(deps.dataStore, sourceRequest.collectionId);
        const selectedCollection = await vscode.window.showQuickPick(collectionPickItems, {
          title: '选择保存位置',
          placeHolder: '选择要保存到的 Collection（可选根目录）'
        });

        if (!selectedCollection) {
          break;
        }

        const targetCollectionId = selectedCollection.collectionId;
        const hasDuplicateName = deps.dataStore.requests.some(existingRequest =>
          existingRequest.name.trim().toLowerCase() === normalizedSaveAsName.toLowerCase()
          && existingRequest.collectionId === targetCollectionId
        );
        if (hasDuplicateName) {
          vscode.window.showErrorMessage(`另存为失败：目标位置已存在同名请求 "${normalizedSaveAsName}"`);
          break;
        }

        const newRequest = deps.dataStore.addRequest({
          name: normalizedSaveAsName,
          method: message.data.method,
          url: message.data.url,
          headers: message.data.headers,
          body: message.data.body,
          bodyMode: message.data.bodyMode ?? 'raw',
          bodyItems: Array.isArray(message.data.bodyItems) ? message.data.bodyItems : [],
          authType: message.data.authType ?? 'none',
          authBearerToken: message.data.authBearerToken ?? '',
          authBasicUsername: message.data.authBasicUsername ?? '',
          authBasicPassword: message.data.authBasicPassword ?? '',
          envGroupId: typeof message.data.envGroupId === 'string' ? message.data.envGroupId : undefined,
          collectionId: targetCollectionId
        });

        deps.refreshCollections();
        vscode.window.showInformationMessage(`已另存为新请求：${newRequest.name}`);
        await openRequestEditor(newRequest, deps);
        break;
      }
      case 'sendRequest':
        const sendResult = await sendRequest(
          deps.dataStore.requests.find(r => r.id === request.id) ?? request,
          deps,
          { showResponsePanel: false }
        );
        panel.webview.postMessage({
          command: 'requestResponse',
          data: sendResult
        });
        deps.refreshCollections();
        deps.refreshHistory();
        break;
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
        vscode.window.showInformationMessage(`${label} 已复制到剪贴板`);
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
  options?: { showResponsePanel?: boolean }
): Promise<SendRequestResult> {
  let resolvedUrl = request.url;
  try {
    const environmentMap = toEnvironmentMap(deps.dataStore, request.envGroupId);
    resolvedUrl = resolveTemplateVariables(request.url, environmentMap);
    const resolvedHeaders = Object.entries(request.headers).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = resolveTemplateVariables(value, environmentMap);
      return acc;
    }, {});
    const resolvedBodyText = resolveTemplateVariables(request.body || '', environmentMap);
    const bodyMode: RequestBodyMode = request.bodyMode ?? 'raw';
    const authType: RequestAuthType = request.authType ?? 'none';
    const resolvedBodyItems = resolveKeyValueItems(request.bodyItems, environmentMap);

    const axiosConfig: AxiosRequestConfig = {
      method: request.method,
      url: resolvedUrl,
      headers: resolvedHeaders,
      validateStatus: () => true
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

    if (request.method !== 'GET') {
      if (bodyMode === 'x-www-form-urlencoded') {
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
      } else {
        axiosConfig.data = parseRequestBody(resolvedBodyText);
        if (!resolvedHeaders['Content-Type']) {
          resolvedHeaders['Content-Type'] = 'application/json';
        }
      }
    }

    vscode.window.setStatusBarMessage(`正在发送 ${request.method} 请求到 ${resolvedUrl}...`, 5000);
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
    vscode.window.showErrorMessage(`请求失败：${err.message}`);
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
      errorMessage: err.message
    };
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
    method: (messageData.method as RequestModel['method']) ?? dataStore.requests[index].method,
    url: String(messageData.url ?? dataStore.requests[index].url),
    headers: (messageData.headers as Record<string, string>) ?? dataStore.requests[index].headers,
    body: String(messageData.body ?? dataStore.requests[index].body ?? ''),
    bodyMode: (messageData.bodyMode as RequestBodyMode) ?? 'raw',
    bodyItems: Array.isArray(messageData.bodyItems) ? messageData.bodyItems as KeyValueItem[] : [],
    authType: (messageData.authType as RequestAuthType) ?? 'none',
    authBearerToken: String(messageData.authBearerToken ?? ''),
    authBasicUsername: String(messageData.authBasicUsername ?? ''),
    authBasicPassword: String(messageData.authBasicPassword ?? ''),
    envGroupId: typeof messageData.envGroupId === 'string' && messageData.envGroupId.trim() !== ''
      ? messageData.envGroupId
      : undefined
  };
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
    : dataStore.environments;

  return envList.reduce<Record<string, string>>((acc, env) => {
    acc[env.name] = env.value;
    return acc;
  }, {});
}

function resolveTemplateVariables(content: string, environmentMap: Record<string, string>): string {
  return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (fullMatch, variableName: string) => {
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
  const body = resolveTemplateVariables(String(source.body ?? ''), environmentMap);
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
    if (bodyMode === 'x-www-form-urlencoded') {
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
    } else if (body.trim()) {
      lines.push(`  --data-raw ${shellQuote(body)}`);
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