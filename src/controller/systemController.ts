import * as vscode from 'vscode';
import { DataStore } from '../dataStore';
import type { PersistData } from '../models';

export interface SystemControllerDeps {
  dataStore: DataStore;
  refreshCollectionsWithRetry: () => void;
  refreshEnvironments: () => void;
  refreshHistory: () => void;
}

export function registerSystemCommands(deps: SystemControllerDeps): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('free-request.clearHistory', async () => {
      const confirm = await vscode.window.showWarningMessage(
        '确定要清空所有 History 记录吗？此操作不可恢复。',
        { modal: true },
        '清空'
      );

      if (confirm !== '清空') {
        return;
      }

      const cleared = deps.dataStore.clearHistory();
      deps.refreshHistory();
      if (cleared) {
        vscode.window.setStatusBarMessage('Free Request: History 已清空', 3000);
      } else {
        vscode.window.setStatusBarMessage('Free Request: History 当前为空', 3000);
      }
    }),

    vscode.commands.registerCommand('free-request.refreshCollections', async () => {
      await deps.dataStore.reloadPersistData();
      deps.refreshCollectionsWithRetry();
      vscode.window.setStatusBarMessage('Free Request: Collections 面板已刷新并重载数据', 3000);
    }),

    vscode.commands.registerCommand('free-request.refreshEnvironments', async () => {
      await deps.dataStore.reloadPersistData();
      deps.refreshEnvironments();
      vscode.window.setStatusBarMessage('Free Request: Environments 面板已刷新并重载数据', 3000);
    }),

    vscode.commands.registerCommand('free-request.manualSave', async () => {
      await deps.dataStore.savePersistData();
      vscode.window.setStatusBarMessage(`Free Request: 数据已手动保存到 ${deps.dataStore.getPersistPathFsPath()}`, 5000);
    }),

    vscode.commands.registerCommand('free-request.refreshTree', () => {
      deps.refreshCollectionsWithRetry();
      deps.refreshEnvironments();
      deps.refreshHistory();
      vscode.window.setStatusBarMessage('Free Request: 所有面板已刷新', 3000);
    }),

    vscode.commands.registerCommand('free-request.exportData', async () => {
      const defaultUri = vscode.workspace.workspaceFolders?.[0]
        ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'collections_envs.json')
        : undefined;

      const saveUri = await vscode.window.showSaveDialog({
        title: '导出 Free Request 数据',
        defaultUri,
        filters: {
          JSON: ['json']
        }
      });

      if (!saveUri) {
        return;
      }

      const persistData = deps.dataStore.exportPersistData();
      const content = JSON.stringify(persistData, null, 2);
      await vscode.workspace.fs.writeFile(saveUri, new TextEncoder().encode(content));
      vscode.window.setStatusBarMessage(`Free Request: 导出成功 -> ${saveUri.fsPath}`, 5000);
    }),

    vscode.commands.registerCommand('free-request.importData', async () => {
      const openUris = await vscode.window.showOpenDialog({
        title: '导入 Free Request 数据',
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          JSON: ['json']
        }
      });

      if (!openUris || openUris.length === 0) {
        return;
      }

      const targetUri = openUris[0];
      const raw = await vscode.workspace.fs.readFile(targetUri);
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(raw));
      } catch {
        vscode.window.showErrorMessage('Free Request: 导入失败，JSON 格式无效。');
        return;
      }

      if (!isValidImportPayload(parsed)) {
        vscode.window.showErrorMessage('Free Request: 导入失败，缺少 collections/requests/environments 数组。');
        return;
      }

      const importPreview = buildImportPreview(parsed);

      const confirm = await vscode.window.showWarningMessage(
        `即将导入：Collections ${importPreview.collections} / Requests ${importPreview.requests} / Environments ${importPreview.environments}`
          + ` / EnvGroups ${importPreview.envGroups} / History ${importPreview.history}。\n导入将覆盖当前 Free Request 数据，是否继续？`,
        { modal: true },
        '继续导入'
      );
      if (confirm !== '继续导入') {
        return;
      }

      await deps.dataStore.importPersistData(parsed as Partial<PersistData>);
      deps.refreshCollectionsWithRetry();
      deps.refreshEnvironments();
      deps.refreshHistory();
      vscode.window.setStatusBarMessage('Free Request: 导入成功，数据已刷新。', 5000);
    })
  ];
}

function isValidImportPayload(value: unknown): value is Partial<PersistData> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PersistData>;
  return Array.isArray(candidate.collections)
    && Array.isArray(candidate.requests)
    && Array.isArray(candidate.environments);
}

function buildImportPreview(value: Partial<PersistData>) {
  return {
    collections: Array.isArray(value.collections) ? value.collections.length : 0,
    requests: Array.isArray(value.requests) ? value.requests.length : 0,
    environments: Array.isArray(value.environments) ? value.environments.length : 0,
    envGroups: Array.isArray(value.envGroups) ? value.envGroups.length : 0,
    history: Array.isArray(value.history) ? value.history.length : 0
  };
}