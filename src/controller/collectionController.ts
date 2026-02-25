import * as vscode from 'vscode';
import { DataStore } from '../dataStore';
import type { RequestModel } from '../models';
import type { ShowInputDialog, ShowStepwiseInputDialog } from '../view/input';

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
  showStepwiseInputDialog: ShowStepwiseInputDialog;
  openRequestEditor: (request: RequestModel) => Promise<void>;
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

      const inputData = await deps.showStepwiseInputDialog<{
        name: string;
        method: string;
        url: string;
      }>({
        name: {
          title: '新建请求',
          prompt: '请输入请求名称',
          placeholder: '例如：获取用户信息',
          validate: val => val ? null : '请求名称不能为空'
        },
        method: {
          title: '选择请求方法',
          prompt: '请选择HTTP请求方法',
          placeholder: 'GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS',
          validate: val => ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(val.toUpperCase())
            ? null
            : '请输入有效的HTTP方法：GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS',
          defaultValue: 'GET'
        },
        url: {
          title: '输入请求URL',
          prompt: '请输入完整的请求URL',
          placeholder: 'https://jsonplaceholder.typicode.com/todos/1',
          validate: val => val.startsWith('http')
            ? null
            : '请输入有效的URL（以http开头）',
          defaultValue: 'https://jsonplaceholder.typicode.com/todos/1'
        }
      });

      if (!inputData) {
        return;
      }

      const method = inputData.method.toUpperCase() as RequestModel['method'];

      const newRequest = deps.dataStore.addRequest({
        name: inputData.name,
        method,
        url: inputData.url,
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
          vscode.window.showInformationMessage(`已复制请求：${newRequest.name}`);
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
          vscode.window.showInformationMessage(`已复制集合：${newCollection.name}`);
          setTimeout(() => deps.refreshCollectionsWithRetry(), 2000);
        } catch (error) {
          vscode.window.showErrorMessage(`复制集合失败：${(error as Error).message}`);
        }
      }
    })
  ];
}