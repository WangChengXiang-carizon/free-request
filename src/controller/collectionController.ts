import * as vscode from 'vscode';
import { DataStore } from '../dataStore';
import type { RequestModel } from '../models';
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
        bodyItems: [],
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