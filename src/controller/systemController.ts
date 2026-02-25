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
    vscode.commands.registerCommand('free-request.manualSave', async () => {
      await deps.dataStore.savePersistData();
      vscode.window.showInformationMessage(`Free Request: 数据已手动保存到 ${deps.dataStore.getPersistPathFsPath()}`);
    }),

    vscode.commands.registerCommand('free-request.refreshTree', () => {
      deps.refreshCollectionsWithRetry();
      deps.refreshEnvironments();
      deps.refreshHistory();
      vscode.window.showInformationMessage('Free Request: 所有面板已刷新');
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
      vscode.window.showInformationMessage(`Free Request: 导出成功 -> ${saveUri.fsPath}`);
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
      vscode.window.showInformationMessage('Free Request: 导入成功，数据已刷新。');
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