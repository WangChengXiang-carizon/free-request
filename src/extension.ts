import * as vscode from 'vscode';
import { DataStore } from './dataStore';
import type {
  CollectionModel,
  EnvGroupModel,
  EnvModel,
  HistoryModel,
  RequestModel
} from './models';
import {
  openRequestEditor,
  registerRequestCommands,
  type RequestControllerDeps
} from './controller/requestController';
import {
  registerEnvironmentCommands,
  type EnvControllerDeps
} from './controller/envController';
import {
  registerCollectionCommands,
  type CollectionControllerDeps
} from './controller/collectionController';
import {
  registerItemCommands,
  type ItemControllerDeps
} from './controller/itemController';
import {
  registerSystemCommands,
  type SystemControllerDeps
} from './controller/systemController';
import { showCustomInputDialog, showStepwiseInputDialog } from './view/input';

// ===================== 树节点定义 =====================
type TreeNodeType = 'collection' | 'request' | 'environment' | 'history' | 'env_group';

abstract class BaseTreeNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: TreeNodeType,
    public readonly id: string
  ) {
    super(label, collapsibleState);
    this.contextValue = type;
    this.id = id;
  }
}

class CollectionNode extends BaseTreeNode {
  constructor(collection: CollectionModel, private dataStore: DataStore) {
    super(
      collection.name,
      vscode.TreeItemCollapsibleState.Expanded,
      'collection',
      collection.id
    );
    this.iconPath = new vscode.ThemeIcon('folder');
    const totalRequests = this.calcTotalRequests(collection.id);
    this.description = `${totalRequests} requests`;
  }

  private calcTotalRequests(collectionId: string): number {
    const collection = this.dataStore.collections.find(c => c.id === collectionId);
    if (!collection) return 0;
    let count = collection.requests.length;
    const childCollections = this.dataStore.getChildCollections(collectionId);
    childCollections.forEach(child => {
      count += this.calcTotalRequests(child.id);
    });
    return count;
  }
}

class RequestNode extends BaseTreeNode {
  constructor(request: RequestModel) {
    const methodBadge = `[${request.method}]`;
    const label = `${methodBadge} ${request.name}`;
    
    super(label, vscode.TreeItemCollapsibleState.None, 'request', request.id);
    
    switch (request.method) {
      case 'GET':
        this.iconPath = new vscode.ThemeIcon('cloud-download', new vscode.ThemeColor('charts.green'));
        break;
      case 'POST':
        this.iconPath = new vscode.ThemeIcon('cloud-upload', new vscode.ThemeColor('charts.blue'));
        break;
      case 'PUT':
        this.iconPath = new vscode.ThemeIcon('cloud-update', new vscode.ThemeColor('charts.orange'));
        break;
      case 'DELETE':
        this.iconPath = new vscode.ThemeIcon('cloud-delete', new vscode.ThemeColor('charts.red'));
        break;
      case 'PATCH':
        this.iconPath = new vscode.ThemeIcon('wrench', new vscode.ThemeColor('charts.purple'));
        break;
      case 'HEAD':
        this.iconPath = new vscode.ThemeIcon('symbol-key', new vscode.ThemeColor('charts.foreground'));
        break;
      case 'OPTIONS':
        this.iconPath = new vscode.ThemeIcon('settings', new vscode.ThemeColor('charts.yellow'));
        break;
    }
    
    this.tooltip = request.url;
    this.command = {
      command: 'free-request.editRequest',
      title: 'Edit Request',
      arguments: [this]
    };
  }
}

class EnvGroupNode extends BaseTreeNode {
  constructor(envGroup: EnvGroupModel, private dataStore: DataStore) {
    super(
      envGroup.name,
      vscode.TreeItemCollapsibleState.Expanded,
      'env_group',
      envGroup.id
    );
    this.iconPath = new vscode.ThemeIcon('folder-library');
    const envCount = this.dataStore.environments.filter(e => e.groupId === envGroup.id).length;
    this.description = `${envCount} variables`;
  }
}

class EnvNode extends BaseTreeNode {
  constructor(env: EnvModel) {
    const valueDisplay = env.value.length > 20 ? `${env.value.substring(0, 20)}...` : env.value;
    const label = `${env.name} = ${valueDisplay}`;
    
    super(label, vscode.TreeItemCollapsibleState.None, 'environment', env.id);
    this.iconPath = new vscode.ThemeIcon('settings-gear');
    this.tooltip = `${env.name} = ${env.value}`;
    this.command = {
      command: 'free-request.editEnv',
      title: 'Edit Environment Variable',
      arguments: [this]
    };
  }
}

class HistoryNode extends BaseTreeNode {
  constructor(history: HistoryModel, request: RequestModel) {
    const date = new Date(history.timestamp);
    const timeStr = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    const label = `[${request.method}] ${request.name} (${history.status})`;
    
    super(label, vscode.TreeItemCollapsibleState.None, 'history', history.id);
    this.iconPath = new vscode.ThemeIcon('clock');
    this.description = timeStr;
    this.tooltip = `${request.url} (${new Date(history.timestamp).toLocaleString()})`;
  }
}

// ===================== 树数据提供者 =====================
class CollectionsTreeProvider implements vscode.TreeDataProvider<BaseTreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<BaseTreeNode | undefined> = new vscode.EventEmitter<BaseTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private dataStore: DataStore;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
    dataStore.onDidLoadData(() => {
      this.refreshWithRetry();
    });
  }

  public refreshWithRetry(retries = 5, delay = 800) {
    this.refresh();
    if (retries > 0) {
      setTimeout(() => {
        this.refreshWithRetry(retries - 1, delay * 1.2);
      }, delay);
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: BaseTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BaseTreeNode): Promise<BaseTreeNode[]> {
    const nodes: BaseTreeNode[] = [];

    if (!this.dataStore.isDataLoaded) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!element) {
      // 根层级先显示Request，再显示Collection
      const rootRequests = this.dataStore.requests.filter(r => !r.collectionId);
      rootRequests.forEach(request => {
        nodes.push(new RequestNode(request));
      });
      
      const rootCollections = this.dataStore.getChildCollections(undefined);
      const collectionIds = new Set<string>();
      rootCollections.forEach(collection => {
        if (collectionIds.has(collection.id)) {
          console.error(`[TreeProvider] DUPLICATE COLLECTION ID: ${collection.id}`);
        }
        collectionIds.add(collection.id);
        nodes.push(new CollectionNode(collection, this.dataStore));
      });
    } else if (element.type === 'collection') {
      const collectionId = element.id;
      const childCollections = this.dataStore.getChildCollections(collectionId);
      childCollections.forEach(collection => {
        nodes.push(new CollectionNode(collection, this.dataStore));
      });
      
      const collection = this.dataStore.collections.find(c => c.id === collectionId);
      if (collection) {
        const validRequests = [];
        const requestIds = new Set<string>();
        
        for (const reqId of collection.requests) {
          if (requestIds.has(reqId)) {
            console.error(`[TreeProvider] DUPLICATE REQUEST ID: ${reqId}`);
            continue;
          }
          
          const req = this.dataStore.requests.find(r => r.id === reqId);
          if (req) {
            validRequests.push(req);
            requestIds.add(reqId);
          }
        }
        
        validRequests.forEach(request => {
          nodes.push(new RequestNode(request));
        });
      }
    }

    return nodes;
  }

  getParent(element: BaseTreeNode): vscode.ProviderResult<BaseTreeNode> {
    if (element.type === 'request') {
      const request = this.dataStore.requests.find(r => r.id === element.id);
      if (request && !request.collectionId) {
        return undefined;
      }
      if (request?.collectionId) {
        const collection = this.dataStore.collections.find(c => c.id === request.collectionId);
        if (collection) {
          return new CollectionNode(collection, this.dataStore);
        }
      }
    } else if (element.type === 'collection') {
      const collection = this.dataStore.collections.find(c => c.id === element.id);
      if (collection?.parentId) {
        const parentCollection = this.dataStore.collections.find(c => c.id === collection.parentId);
        if (parentCollection) {
          return new CollectionNode(parentCollection, this.dataStore);
        }
      }
    }
    return undefined;
  }
}

class EnvironmentsTreeProvider implements vscode.TreeDataProvider<BaseTreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<BaseTreeNode | undefined> = new vscode.EventEmitter<BaseTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private dataStore: DataStore;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
    vscode.commands.executeCommand('setContext', 'free-request-environments:loaded', true);
    dataStore.onDidLoadData(() => {
      this.refresh();
      vscode.commands.executeCommand('setContext', 'free-request-environments:loaded', true);
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: BaseTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BaseTreeNode): Promise<BaseTreeNode[]> {
    const nodes: BaseTreeNode[] = [];

    if (!this.dataStore.isDataLoaded) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!element) {
      // 根层级先显示Env，再显示EnvGroup
      const rootEnvs = this.dataStore.environments.filter(e => !e.groupId);
      rootEnvs.forEach(env => {
        nodes.push(new EnvNode(env));
      });
      
      const rootEnvGroups = this.dataStore.getChildEnvGroups(undefined);
      rootEnvGroups.forEach(group => {
        nodes.push(new EnvGroupNode(group, this.dataStore));
      });
      return nodes;
    } else if (element.type === 'env_group') {
      const groupId = element.id;
      const childEnvGroups = this.dataStore.getChildEnvGroups(groupId);
      childEnvGroups.forEach(group => {
        nodes.push(new EnvGroupNode(group, this.dataStore));
      });
      const envs = this.dataStore.environments.filter(e => e.groupId === groupId);
      envs.forEach(env => {
        nodes.push(new EnvNode(env));
      });
      return nodes;
    }

    return [];
  }

  getParent(element: BaseTreeNode): vscode.ProviderResult<BaseTreeNode> {
    if (element.type === 'environment') {
      const env = this.dataStore.environments.find(e => e.id === element.id);
      if (env && !env.groupId) {
        return undefined;
      }
      if (env?.groupId) {
        const envGroup = this.dataStore.envGroups.find(g => g.id === env.groupId);
        if (envGroup) {
          return new EnvGroupNode(envGroup, this.dataStore);
        }
      }
    } else if (element.type === 'env_group') {
      const envGroup = this.dataStore.envGroups.find(g => g.id === element.id);
      if (envGroup?.parentId) {
        const parentEnvGroup = this.dataStore.envGroups.find(g => g.id === envGroup.parentId);
        if (parentEnvGroup) {
          return new EnvGroupNode(parentEnvGroup, this.dataStore);
        }
      }
    }
    return undefined;
  }
}

class HistoryTreeProvider implements vscode.TreeDataProvider<BaseTreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<BaseTreeNode | undefined> = new vscode.EventEmitter<BaseTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private dataStore: DataStore;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
    dataStore.onDidLoadData(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: BaseTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BaseTreeNode): Thenable<BaseTreeNode[]> {
    if (!element && this.dataStore.isDataLoaded) {
      return Promise.resolve(
        this.dataStore.history.map(history => {
          const request = this.dataStore.requests.find(r => r.id === history.requestId);
          return request ? new HistoryNode(history, request) : null;
        }).filter(Boolean) as BaseTreeNode[]
      );
    }
    return Promise.resolve([]);
  }
}

class RequestDragAndDropController implements vscode.TreeDragAndDropController<BaseTreeNode> {
  readonly dragMimeTypes: string[] = ['application/vnd.code.tree.free-request-collections'];
  readonly dropMimeTypes: string[] = ['application/vnd.code.tree.free-request-collections'];

  constructor(
    private readonly dataStore: DataStore,
    private readonly refreshCollections: () => void
  ) {}

  async handleDrag(
    source: readonly BaseTreeNode[],
    dataTransfer: vscode.DataTransfer
  ): Promise<void> {
    const requestIds = source
      .filter(node => node.type === 'request')
      .map(node => node.id);

    if (requestIds.length === 0) {
      return;
    }

    dataTransfer.set(
      'application/vnd.code.tree.free-request-collections',
      new vscode.DataTransferItem(JSON.stringify({ requestIds }))
    );
  }

  async handleDrop(target: BaseTreeNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const item = dataTransfer.get('application/vnd.code.tree.free-request-collections');
    if (!item) {
      return;
    }

    const payloadText = await item.asString();
    let requestIds: string[] = [];
    try {
      const payload = JSON.parse(payloadText) as { requestIds?: unknown };
      requestIds = Array.isArray(payload.requestIds)
        ? payload.requestIds.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      return;
    }

    if (requestIds.length === 0) {
      return;
    }

    if (target && target.type !== 'collection') {
      vscode.window.showWarningMessage('请求只能拖拽到 Collection 或根目录。');
      return;
    }

    const targetCollectionId = target?.type === 'collection' ? target.id : undefined;
    let movedCount = 0;
    for (const requestId of requestIds) {
      const moved = this.dataStore.moveRequest(requestId, targetCollectionId);
      if (moved) {
        movedCount += 1;
      }
    }

    if (movedCount > 0) {
      this.refreshCollections();
      const targetName = target?.type === 'collection' ? target.label : '根目录';
      vscode.window.setStatusBarMessage(`已移动 ${movedCount} 个请求到 ${targetName}`, 3000);
    }
  }
}

// ===================== 核心扩展逻辑 =====================
let collectionsProvider: CollectionsTreeProvider;
let environmentsProvider: EnvironmentsTreeProvider;
let historyProvider: HistoryTreeProvider;
let dataStore: DataStore;
let collectionsTreeView: vscode.TreeView<BaseTreeNode> | undefined;

export function activate(context: vscode.ExtensionContext) {
  dataStore = DataStore.getInstance(context);

  collectionsProvider = new CollectionsTreeProvider(dataStore);
  environmentsProvider = new EnvironmentsTreeProvider(dataStore);
  historyProvider = new HistoryTreeProvider(dataStore);

  const requestDnDController = new RequestDragAndDropController(dataStore, () => collectionsProvider.refresh());
  collectionsTreeView = vscode.window.createTreeView('free-request-collections', {
    treeDataProvider: collectionsProvider,
    dragAndDropController: requestDnDController,
    canSelectMany: true
  });
  const envDisposable = vscode.window.registerTreeDataProvider('free-request-environments', environmentsProvider);
  const histDisposable = vscode.window.registerTreeDataProvider('free-request-history', historyProvider);
  
  context.subscriptions.push(collectionsTreeView, envDisposable, histDisposable);

  vscode.commands.executeCommand('setContext', 'free-request:activated', true);
  vscode.commands.executeCommand('setContext', 'view:free-request-environments', true);

  collectionsProvider.refresh();
  environmentsProvider.refresh();
  historyProvider.refresh();

  setTimeout(() => {
    environmentsProvider.refresh();
    vscode.commands.executeCommand('workbench.action.refreshExplorer');
  }, 100);

  dataStore.onDidLoadData(() => {
    setTimeout(() => {
      collectionsProvider.refreshWithRetry();
      environmentsProvider.refresh();
      historyProvider.refresh();
    }, 300);
  });

  const requestControllerDeps: RequestControllerDeps = {
    context,
    dataStore,
    refreshCollections: () => collectionsProvider.refresh(),
    refreshHistory: () => historyProvider.refresh(),
    showInputDialog: showCustomInputDialog
  };

  const envControllerDeps: EnvControllerDeps = {
    dataStore,
    refreshEnvironments: () => environmentsProvider.refresh(),
    showInputDialog: showCustomInputDialog,
    showStepwiseInputDialog
  };

  const collectionControllerDeps: CollectionControllerDeps = {
    dataStore,
    refreshCollections: () => collectionsProvider.refresh(),
    refreshCollectionsWithRetry: () => collectionsProvider.refreshWithRetry(),
    showInputDialog: showCustomInputDialog,
    showStepwiseInputDialog,
    openRequestEditor: (request: RequestModel) => openRequestEditor(request, requestControllerDeps)
  };

  const itemControllerDeps: ItemControllerDeps = {
    dataStore,
    refreshCollections: () => collectionsProvider.refresh(),
    refreshEnvironments: () => environmentsProvider.refresh(),
    refreshHistory: () => historyProvider.refresh(),
    showInputDialog: showCustomInputDialog
  };

  const systemControllerDeps: SystemControllerDeps = {
    dataStore,
    refreshCollectionsWithRetry: () => collectionsProvider.refreshWithRetry(),
    refreshEnvironments: () => environmentsProvider.refresh(),
    refreshHistory: () => historyProvider.refresh()
  };

  // 注册命令
  context.subscriptions.push(
    ...registerRequestCommands(requestControllerDeps),
    ...registerCollectionCommands(collectionControllerDeps),
    ...registerItemCommands(itemControllerDeps),
    ...registerEnvironmentCommands(envControllerDeps),
    ...registerSystemCommands(systemControllerDeps)
  );
}

export function deactivate() {
  if (dataStore) {
    dataStore.savePersistData().then(() => {
      console.log('Free Request: 扩展停用，数据已保存');
    });
  }
}