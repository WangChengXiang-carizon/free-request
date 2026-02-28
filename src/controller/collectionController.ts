import * as vscode from 'vscode';
import { DataStore } from '../dataStore';
import type { CollectionModel, RequestModel } from '../models';
import type { ShowInputDialog } from '../view/input';

interface CommandNode {
  type: string;
  id: string;
  label: string;
}

export interface CollectionControllerDeps {
  dataStore: DataStore;
  refreshCollections: () => void;
  refreshCollectionsWithRetry: () => void;
  showInputDialog: ShowInputDialog;
  openRequestEditor: (request: RequestModel) => Promise<void>;
}

function getNextDefaultRequestName(dataStore: DataStore, collectionId?: string): string {
  const baseName = '未命名请求';
  const pattern = new RegExp(`^${baseName}(?:\\s+(\\d+))?$`);

  const scopedRequests = dataStore.requests.filter(request => request.collectionId === collectionId);
  const usedIndexes = new Set<number>();

  scopedRequests.forEach(request => {
    const match = request.name.trim().match(pattern);
    if (!match) {
      return;
    }

    const suffix = match[1];
    usedIndexes.add(suffix ? Number(suffix) : 1);
  });

  let nextIndex = 1;
  while (usedIndexes.has(nextIndex)) {
    nextIndex += 1;
  }

  return nextIndex === 1 ? baseName : `${baseName} ${nextIndex}`;
}

export function registerCollectionCommands(deps: CollectionControllerDeps): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('free-request.exportSingleCollection', async (node: CommandNode) => {
      if (node?.type !== 'collection') {
        return;
      }

      const defaultUri = vscode.workspace.workspaceFolders?.[0]
        ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, `${node.label}.collection.json`)
        : undefined;

      const saveUri = await vscode.window.showSaveDialog({
        title: '导出当前 Collection',
        defaultUri,
        filters: { JSON: ['json'] }
      });
      if (!saveUri) {
        return;
      }

      try {
        const exportPayload = deps.dataStore.exportCollectionData(node.id);
        const content = JSON.stringify(exportPayload, null, 2);
        await vscode.workspace.fs.writeFile(saveUri, new TextEncoder().encode(content));
        vscode.window.setStatusBarMessage(`Free Request: Collection 导出成功 -> ${saveUri.fsPath}`, 5000);
      } catch (error) {
        vscode.window.showErrorMessage(`导出 Collection 失败：${(error as Error).message}`);
      }
    }),

    vscode.commands.registerCommand('free-request.importIntoCollection', async (node: CommandNode) => {
      if (node?.type !== 'collection') {
        return;
      }

      const openUris = await vscode.window.showOpenDialog({
        title: `导入到 Collection: ${node.label}`,
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { JSON: ['json'] }
      });
      if (!openUris || openUris.length === 0) {
        return;
      }

      const targetUri = openUris[0];
      try {
        const raw = await vscode.workspace.fs.readFile(targetUri);
        const parsed = JSON.parse(new TextDecoder().decode(raw)) as Partial<{ collections: unknown; requests: unknown }>;
        const payload = {
          collections: Array.isArray(parsed.collections)
            ? parsed.collections as CollectionModel[]
            : [],
          requests: Array.isArray(parsed.requests)
            ? parsed.requests as RequestModel[]
            : []
        };

        const result = await deps.dataStore.importCollectionData(payload, node.id);

        deps.refreshCollectionsWithRetry();
        vscode.window.setStatusBarMessage(
          `Free Request: 已导入 ${result.collectionCount} 个 Collection，${result.requestCount} 个 Request`,
          5000
        );
      } catch (error) {
        vscode.window.showErrorMessage(`导入 Collection 失败：${(error as Error).message}`);
      }
    }),

    vscode.commands.registerCommand('free-request.newCollection', async () => {
      const name = await deps.showInputDialog(
        '新建根集合',
        '请输入根集合名称',
        '例如：用户API',
        val => val ? null : '名称不能为空'
      );
      if (name) {
        deps.dataStore.addCollection(name);
        deps.refreshCollections();
      }
    }),

    vscode.commands.registerCommand('free-request.newSubCollection', async (node: CommandNode) => {
      if (node?.type === 'collection') {
        const name = await deps.showInputDialog(
          `新建子集合 (${node.label})`,
          `请输入子集合名称（隶属于 ${node.label}）`,
          '例如：V1 API',
          val => val ? null : '名称不能为空'
        );
        if (name) {
          deps.dataStore.addCollection(name, node.id);
          deps.refreshCollections();
        }
      }
    }),

    vscode.commands.registerCommand('free-request.newRequest', async (node?: CommandNode) => {
      let collectionId: string | undefined;
      if (node?.type === 'collection') {
        collectionId = node.id;
      }

      const defaultRequestName = getNextDefaultRequestName(deps.dataStore, collectionId);
      const newRequest = deps.dataStore.addRequest({
        name: defaultRequestName,
        description: '',
        method: 'GET',
        url: 'https://example.com',
        params: [],
        headers: { 'Content-Type': 'application/json' },
        body: '',
        bodyMode: 'raw',
        rawType: 'json',
        bodyItems: [],
        binaryFilePath: '',
        graphQLQuery: '',
        graphQLVariables: '',
        authType: 'none',
        authBearerToken: '',
        authBasicUsername: '',
        authBasicPassword: '',
        collectionId
      });

      await deps.openRequestEditor(newRequest);
      deps.refreshCollections();
    }),

    vscode.commands.registerCommand('free-request.duplicateRequest', async (node: CommandNode) => {
      if (node?.type === 'request') {
        try {
          const newRequest = deps.dataStore.duplicateRequest(node.id);
          vscode.window.setStatusBarMessage(`已复制请求：${newRequest.name}`, 3000);
          setTimeout(() => deps.refreshCollectionsWithRetry(), 800);
        } catch (error) {
          vscode.window.showErrorMessage(`复制请求失败：${(error as Error).message}`);
        }
      }
    }),

    vscode.commands.registerCommand('free-request.duplicateCollection', async (node: CommandNode) => {
      if (node?.type === 'collection') {
        try {
          const newCollection = await deps.dataStore.duplicateCollection(node.id);
          vscode.window.setStatusBarMessage(`已复制集合：${newCollection.name}`, 3000);
          setTimeout(() => deps.refreshCollectionsWithRetry(), 2000);
        } catch (error) {
          vscode.window.showErrorMessage(`复制集合失败：${(error as Error).message}`);
        }
      }
    })
  ];
}