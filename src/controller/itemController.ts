import * as vscode from 'vscode';
import { DataStore } from '../dataStore';
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