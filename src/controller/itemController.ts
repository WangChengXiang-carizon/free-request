import * as vscode from 'vscode';
import { DataStore } from '../dataStore';
import type { HistoryModel, RequestModel } from '../models';
import type { ShowInputDialog } from '../view/input';

interface CommandNode {
  type: string;
  id: string;
  label: string;
}

export interface ItemControllerDeps {
  dataStore: DataStore;
  refreshCollections: () => void;
  refreshEnvironments: () => void;
  refreshHistory: () => void;
  showInputDialog: ShowInputDialog;
  closeRequestEditorsByIds: (requestIds: string[]) => void;
}

function collectCollectionRequestIds(dataStore: DataStore, collectionId: string): string[] {
  const targetCollectionIds = new Set<string>();
  const stack = [collectionId];

  while (stack.length > 0) {
    const currentCollectionId = stack.pop();
    if (!currentCollectionId || targetCollectionIds.has(currentCollectionId)) {
      continue;
    }

    targetCollectionIds.add(currentCollectionId);
    dataStore.collections
      .filter(collection => collection.parentId === currentCollectionId)
      .forEach(collection => stack.push(collection.id));
  }

  return dataStore.requests
    .filter(request => request.collectionId && targetCollectionIds.has(request.collectionId))
    .map(request => request.id);
}

export function registerItemCommands(deps: ItemControllerDeps): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('free-request.viewHistoryItem', async (node: CommandNode) => {
      if (node.type !== 'history') {
        return;
      }

      const history = deps.dataStore.history.find(item => item.id === node.id);
      if (!history) {
        vscode.window.showErrorMessage('历史记录不存在或已删除');
        return;
      }

      const request = deps.dataStore.requests.find(item => item.id === history.requestId);
      const titleBase = history.requestName || request?.name || 'History';
      const panel = vscode.window.createWebviewPanel(
        'freeRequestHistoryDetail',
        `History: ${titleBase}`,
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      panel.webview.html = buildHistoryDetailHtml(history, request);
    }),

    vscode.commands.registerCommand('free-request.deleteItem', async (node: CommandNode) => {
      const confirm = await vscode.window.showWarningMessage(
        `确定要删除 "${node.label}" 吗？`,
        { modal: true },
        '删除'
      );
      if (confirm === '删除') {
        if (node.type === 'collection') {
          const requestIds = collectCollectionRequestIds(deps.dataStore, node.id);
          deps.closeRequestEditorsByIds(requestIds);
          deps.dataStore.deleteCollection(node.id);
        } else if (node.type === 'request') {
          deps.closeRequestEditorsByIds([node.id]);
          deps.dataStore.deleteRequest(node.id);
        } else if (node.type === 'env_group') {
          deps.dataStore.deleteEnvGroup(node.id);
        } else if (node.type === 'environment') {
          deps.dataStore.deleteEnv(node.id);
        } else if (node.type === 'history') {
          deps.dataStore.deleteHistory(node.id);
        }
        deps.refreshCollections();
        deps.refreshEnvironments();
        deps.refreshHistory();
      }
    }),

    vscode.commands.registerCommand('free-request.renameItem', async (node: CommandNode) => {
      let originalName = node.label;
      let title = '';
      let prompt = '';
      let renameFunc: (id: string, newName: string) => boolean;

      if (node.type === 'collection') {
        title = '重命名集合';
        prompt = `请输入新的集合名称（当前：${originalName}）`;
        renameFunc = deps.dataStore.renameCollection.bind(deps.dataStore);
      } else if (node.type === 'request') {
        originalName = node.label.replace(/^\[\w+\]\s+/, '').replace(/\s\(\d+\)$/, '');
        title = '重命名请求';
        prompt = `请输入新的请求名称（当前：${originalName}）`;
        renameFunc = deps.dataStore.renameRequest.bind(deps.dataStore);
      } else if (node.type === 'env_group') {
        title = '重命名环境组';
        prompt = `请输入新的环境组名称（当前：${originalName}）`;
        renameFunc = deps.dataStore.renameEnvGroup.bind(deps.dataStore);
      } else if (node.type === 'environment') {
        originalName = node.label.split(' = ')[0];
        title = '重命名环境变量';
        prompt = `请输入新的环境变量名称（当前：${originalName}）`;
        renameFunc = (id, newName) => deps.dataStore.updateEnv(id, { name: newName });
      } else {
        vscode.window.showErrorMessage('仅支持重命名集合/请求/环境变量');
        return;
      }

      const newName = await deps.showInputDialog(
        title,
        prompt,
        originalName,
        (val) => {
          if (!val || val.trim() === '') {
            return '名称不能为空或仅包含空格';
          }
          if (val === originalName) {
            return '新名称不能与原名称相同';
          }
          return null;
        },
        originalName
      );

      if (newName) {
        const success = renameFunc(node.id, newName.trim());
        if (success) {
          vscode.window.setStatusBarMessage(`成功重命名为：${newName}`, 3000);
          deps.refreshCollections();
          deps.refreshEnvironments();
          deps.refreshHistory();
        } else {
          vscode.window.showErrorMessage('重命名失败');
        }
      }
    })
  ];
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toPreText(value: string | undefined): string {
  if (!value || value.trim() === '') {
    return '(empty)';
  }
  return value;
}

function buildHistoryDetailHtml(history: HistoryModel, request?: RequestModel): string {
  const requestMethod = history.requestSnapshot?.method || request?.method || 'GET';
  const requestUrl = history.requestSnapshot?.url || history.url || request?.url || '';
  const requestHeaders = history.requestSnapshot?.headersText || (request ? JSON.stringify(request.headers ?? {}, null, 2) : '');
  const requestBody = history.requestSnapshot?.bodyText || request?.body || '';

  const responseStatus = history.responseSnapshot?.status ?? history.status;
  const responseStatusText = history.responseSnapshot?.statusText ?? '';
  const responseDuration = history.responseSnapshot?.durationMs ?? 0;
  const responseSize = history.responseSnapshot?.responseSizeBytes ?? 0;
  const responseHeaders = history.responseSnapshot?.headersText ?? '';
  const responseBody = history.responseSnapshot?.bodyText ?? '';
  const responseErrorMessage = history.responseSnapshot?.errorMessage;

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>History Detail</title>
  <style>
    body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 8px; font-size: 13px; }
    .tabs { display: flex; border-bottom: 1px solid #d9d9d9; margin-bottom: 8px; }
    .tab { padding: 8px 12px; cursor: pointer; border-bottom: 2px solid transparent; }
    .tab.active { border-bottom-color: #007acc; color: #007acc; font-weight: 600; }
    .panel { display: none; }
    .panel.active { display: block; }
    .row-title { margin: 10px 0 6px; font-size: 12px; color: #666; }
    pre { margin: 0; padding: 10px; border: 1px solid #d0d7de; border-radius: 4px; background: #f7f8fa; color: #1f2328; white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
    .error { margin-top: 10px; color: #b42318; font-size: 13px; }
  </style>
</head>
<body>
  <div class="meta">
    <strong>${escapeHtml(history.requestName || request?.name || 'History')}</strong>
    <span>${escapeHtml(new Date(history.timestamp).toLocaleString())}</span>
    <span>Status: ${responseStatus} ${escapeHtml(responseStatusText)}</span>
  </div>

  <div class="tabs">
    <div class="tab active" data-tab="request">Request</div>
    <div class="tab" data-tab="response">Response</div>
  </div>

  <section id="panel-request" class="panel active">
    <div class="row-title">Method & URL</div>
    <pre>${escapeHtml(`${requestMethod} ${requestUrl}`)}</pre>
    <div class="row-title">Headers</div>
    <pre>${escapeHtml(toPreText(requestHeaders))}</pre>
    <div class="row-title">Body</div>
    <pre>${escapeHtml(toPreText(requestBody))}</pre>
  </section>

  <section id="panel-response" class="panel">
    <div class="row-title">Summary</div>
    <pre>${escapeHtml(`Status: ${responseStatus} ${responseStatusText}\nTime: ${responseDuration} ms\nSize: ${responseSize} B`)}</pre>
    <div class="row-title">Headers</div>
    <pre>${escapeHtml(toPreText(responseHeaders))}</pre>
    <div class="row-title">Body</div>
    <pre>${escapeHtml(toPreText(responseBody))}</pre>
    ${responseErrorMessage ? `<div class="error">Error: ${escapeHtml(responseErrorMessage)}</div>` : ''}
  </section>

  <script>
    const tabs = Array.from(document.querySelectorAll('.tab'));
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach(item => item.classList.remove('active'));
        tab.classList.add('active');

        const key = tab.getAttribute('data-tab');
        const requestPanel = document.getElementById('panel-request');
        const responsePanel = document.getElementById('panel-response');

        requestPanel?.classList.toggle('active', key === 'request');
        responsePanel?.classList.toggle('active', key === 'response');
      });
    });
  </script>
</body>
</html>
`;
}