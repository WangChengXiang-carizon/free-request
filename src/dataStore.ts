import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { homedir } from 'os';
import * as path from 'path';
import type {
  CollectionModel,
  EnvGroupModel,
  EnvModel,
  HistoryModel,
  PersistData,
  RequestModel
} from './models';

function generateUniqueId(prefix: string): string {
  const uuid = randomUUID().substring(0, 8);
  return `${prefix}_${uuid}`;
}

export class DataStore {
  private static instance: DataStore;
  private static readonly MAX_HISTORY_PERSIST_COUNT = 50;
  collections: CollectionModel[] = [];
  requests: RequestModel[] = [];
  environments: EnvModel[] = [];
  envGroups: EnvGroupModel[] = [];
  history: HistoryModel[] = [];

  private persistPath: vscode.Uri;
  private persistDir: vscode.Uri;
  private _onDidLoadData = new vscode.EventEmitter<void>();
  readonly onDidLoadData = this._onDidLoadData.event;
  private _isDataLoaded = false;

  get isDataLoaded(): boolean {
    return this._isDataLoaded;
  }

  getPersistPathFsPath(): string {
    return this.persistPath.fsPath;
  }

  private trimHistoryForPersistence() {
    if (this.history.length > DataStore.MAX_HISTORY_PERSIST_COUNT) {
      this.history = this.history.slice(0, DataStore.MAX_HISTORY_PERSIST_COUNT);
      console.log(
        `[History] Trimmed to ${DataStore.MAX_HISTORY_PERSIST_COUNT} entries for persistence`
      );
    }
  }

  private constructor(_context: vscode.ExtensionContext) {
    this.persistDir = vscode.Uri.file(path.join(homedir(), '.cache', '.free-request'));
    this.persistPath = vscode.Uri.joinPath(this.persistDir, 'collections.json');

    this.loadPersistData().then(() => {
      this._isDataLoaded = true;
      this._onDidLoadData.fire();
      this.validateRequestCollectionLinks();
      this.validateEnvGroupLinks();
    });
  }

  static getInstance(context: vscode.ExtensionContext): DataStore {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore(context);
    }
    return DataStore.instance;
  }

  private validateEnvGroupLinks() {
    console.log('Validating environment-group links...');
    this.envGroups.forEach(group => {
      if (group.parentId && !this.envGroups.some(g => g.id === group.parentId)) {
        group.parentId = undefined;
        console.log(`Reset parentId for invalid env group ${group.id}`);
      }
    });
  }

  private validateRequestCollectionLinks() {
    console.log('Validating request-collection links...');
    this.collections.forEach(collection => {
      const validRequestIds = collection.requests.filter(reqId =>
        this.requests.some(r => r.id === reqId)
      );
      if (validRequestIds.length !== collection.requests.length) {
        collection.requests = validRequestIds;
      }
    });
  }

  private async loadPersistData() {
    try {
      await vscode.workspace.fs.stat(this.persistPath);
      const content = await vscode.workspace.fs.readFile(this.persistPath);
      const decoder = new TextDecoder('utf-8');
      const persistData: PersistData = JSON.parse(decoder.decode(content));

      this.collections = Array.isArray(persistData.collections) ? persistData.collections : [];
      this.requests = Array.isArray(persistData.requests) ? persistData.requests : [];
      this.environments = Array.isArray(persistData.environments) ? persistData.environments : [];
      this.envGroups = Array.isArray(persistData.envGroups) ? persistData.envGroups : [];
      this.history = Array.isArray(persistData.history) ? persistData.history : [];
      this.trimHistoryForPersistence();

      console.log(
        `Loaded: ${this.collections.length} collections, ${this.requests.length} requests, ${this.envGroups.length} env groups, ${this.environments.length} envs, ${this.history.length} history`
      );
      vscode.window.setStatusBarMessage(
        `Free Request: Loaded ${this.requests.length} requests, ${this.environments.length} env variables`,
        3000
      );
    } catch (error) {
      console.log(`Load data failed: ${(error as Error).message}`);
      this.collections = [];
      this.requests = [];
      this.environments = [];
      this.envGroups = [];
      this.history = [];
    }
  }

  async reloadPersistData() {
    await this.loadPersistData();
    this._isDataLoaded = true;
    this.validateRequestCollectionLinks();
    this.validateEnvGroupLinks();
    this._onDidLoadData.fire();
  }

  async savePersistData() {
    try {
      this.trimHistoryForPersistence();

      const persistData: PersistData = {
        collections: this.collections,
        requests: this.requests,
        environments: this.environments,
        envGroups: this.envGroups,
        history: this.history
      };

      await vscode.workspace.fs.createDirectory(this.persistDir);

      const encoder = new TextEncoder();
      const content = encoder.encode(JSON.stringify(persistData, null, 2));
      await vscode.workspace.fs.writeFile(this.persistPath, content);

      console.log(`Data saved to: ${this.persistPath.fsPath}`);
    } catch (error) {
      const errMsg = `Save data failed: ${(error as Error).message}`;
      console.error(errMsg);
      vscode.window.showErrorMessage(`Free Request: ${errMsg}`);
    }
  }

  exportPersistData(): PersistData {
    return {
      collections: this.collections,
      requests: this.requests,
      environments: this.environments,
      envGroups: this.envGroups,
      history: this.history
    };
  }

  async importPersistData(persistData: Partial<PersistData>) {
    this.collections = Array.isArray(persistData.collections) ? persistData.collections : [];
    this.requests = Array.isArray(persistData.requests) ? persistData.requests : [];
    this.environments = Array.isArray(persistData.environments) ? persistData.environments : [];
    this.envGroups = Array.isArray(persistData.envGroups) ? persistData.envGroups : [];
    this.history = Array.isArray(persistData.history) ? persistData.history : [];
    this.trimHistoryForPersistence();

    this.validateRequestCollectionLinks();
    this.validateEnvGroupLinks();
    await this.savePersistData();
  }

  getChildCollections(parentId?: string): CollectionModel[] {
    return this.collections.filter(c => c.parentId === parentId);
  }

  private addCollectionInternal(name: string, parentId?: string): CollectionModel {
    const collection: CollectionModel = {
      id: generateUniqueId('col'),
      name,
      parentId,
      requests: []
    };
    this.collections.push(collection);
    console.log(`[AddCollection] Created ${collection.id}: ${collection.name}`);
    return collection;
  }

  addCollection(name: string, parentId?: string): CollectionModel {
    const collection = this.addCollectionInternal(name, parentId);
    this.savePersistData();
    return collection;
  }

  deleteCollection(id: string) {
    const childCollections = this.getChildCollections(id);
    childCollections.forEach(child => this.deleteCollection(child.id));
    const collection = this.collections.find(c => c.id === id);
    if (collection) {
      collection.requests.forEach(reqId => this.deleteRequest(reqId));
    }
    this.collections = this.collections.filter(c => c.id !== id);
    this.savePersistData();
  }

  renameCollection(id: string, newName: string): boolean {
    const collection = this.collections.find(c => c.id === id);
    if (collection) {
      collection.name = newName;
      this.savePersistData();
      return true;
    }
    return false;
  }

  async duplicateCollection(sourceCollectionId: string): Promise<CollectionModel> {
    const sourceCollection = this.collections.find(c => c.id === sourceCollectionId);
    if (!sourceCollection) {
      throw new Error(`Collection ${sourceCollectionId} not found`);
    }

    const newCollectionName = `${sourceCollection.name} (Copy)`;
    const newCollection = this.addCollectionInternal(newCollectionName, sourceCollection.parentId);

    const newRequestIds: string[] = [];
    for (const sourceReqId of sourceCollection.requests) {
      const sourceRequest = this.requests.find(r => r.id === sourceReqId);
      if (sourceRequest) {
        const newRequest = this.duplicateRequestInternal(sourceReqId, newCollection.id);
        newRequestIds.push(newRequest.id);
      }
    }

    newCollection.requests = [...newRequestIds];

    const childCollections = this.getChildCollections(sourceCollectionId);
    for (const childCollection of childCollections) {
      const duplicatedChild = await this.duplicateCollection(childCollection.id);
      duplicatedChild.parentId = newCollection.id;
    }

    this.validateRequestCollectionLinks();
    await this.savePersistData();

    return newCollection;
  }

  private addRequestInternal(request: Omit<RequestModel, 'id'>): RequestModel {
    const newRequest: RequestModel = {
      id: generateUniqueId('req'),
      ...request
    };

    const existingRequest = this.requests.find(r => r.id === newRequest.id);
    if (existingRequest) {
      console.error(`[AddRequest] DUPLICATE ID: ${newRequest.id} - regenerating`);
      newRequest.id = generateUniqueId('req');
    }

    this.requests.push(newRequest);
    console.log(`[AddRequest] Added ${newRequest.id}: ${newRequest.name}`);

    if (request.collectionId) {
      const collection = this.collections.find(c => c.id === request.collectionId);
      if (collection && !collection.requests.includes(newRequest.id)) {
        collection.requests.push(newRequest.id);
      }
    }
    return newRequest;
  }

  addRequest(request: Omit<RequestModel, 'id'>): RequestModel {
    const newRequest = this.addRequestInternal(request);
    this.savePersistData();
    return newRequest;
  }

  deleteRequest(id: string) {
    this.collections.forEach(collection => {
      collection.requests = collection.requests.filter(reqId => reqId !== id);
    });
    this.requests = this.requests.filter(r => r.id !== id);
    this.history = this.history.filter(h => h.requestId !== id);
    this.savePersistData();
  }

  renameRequest(id: string, newName: string): boolean {
    const request = this.requests.find(r => r.id === id);
    if (request) {
      request.name = newName;
      this.savePersistData();
      return true;
    }
    return false;
  }

  moveRequest(requestId: string, targetCollectionId?: string): boolean {
    const request = this.requests.find(r => r.id === requestId);
    if (!request) {
      return false;
    }

    if (targetCollectionId) {
      const targetCollection = this.collections.find(c => c.id === targetCollectionId);
      if (!targetCollection) {
        return false;
      }
    }

    if (request.collectionId === targetCollectionId) {
      return true;
    }

    this.collections.forEach(collection => {
      collection.requests = collection.requests.filter(id => id !== requestId);
    });

    request.collectionId = targetCollectionId;

    if (targetCollectionId) {
      const targetCollection = this.collections.find(c => c.id === targetCollectionId);
      if (targetCollection && !targetCollection.requests.includes(requestId)) {
        targetCollection.requests.push(requestId);
      }
    }

    this.savePersistData();
    return true;
  }

  moveRequestsBeforeTarget(requestIds: string[], targetRequestId: string): boolean {
    const targetRequest = this.requests.find(request => request.id === targetRequestId);
    if (!targetRequest?.collectionId) {
      return false;
    }

    const targetCollection = this.collections.find(collection => collection.id === targetRequest.collectionId);
    if (!targetCollection) {
      return false;
    }

    const movingRequestIds = Array.from(new Set(requestIds)).filter(requestId => requestId !== targetRequestId);
    if (movingRequestIds.length === 0) {
      return false;
    }

    const movingRequests = movingRequestIds
      .map(requestId => this.requests.find(request => request.id === requestId))
      .filter((request): request is RequestModel => !!request);
    if (movingRequests.length !== movingRequestIds.length) {
      return false;
    }

    this.collections.forEach(collection => {
      collection.requests = collection.requests.filter(requestId => !movingRequestIds.includes(requestId));
    });

    movingRequests.forEach(request => {
      request.collectionId = targetRequest.collectionId;
    });

    const normalizedTargetOrder = targetCollection.requests.filter(requestId =>
      this.requests.some(request => request.id === requestId)
    );
    const targetIndex = normalizedTargetOrder.indexOf(targetRequestId);
    if (targetIndex === -1) {
      return false;
    }

    const nextOrder = [
      ...normalizedTargetOrder.slice(0, targetIndex),
      ...movingRequestIds,
      ...normalizedTargetOrder.slice(targetIndex)
    ];

    targetCollection.requests = nextOrder;
    this.savePersistData();
    return true;
  }

  updateRequestStatus(id: string, status: number) {
    const request = this.requests.find(r => r.id === id);
    if (request) {
      request.lastStatus = status;
      this.savePersistData();
    }
  }

  private duplicateRequestInternal(sourceRequestId: string, newCollectionId?: string): RequestModel {
    const sourceRequest = this.requests.find(r => r.id === sourceRequestId);
    if (!sourceRequest) {
      throw new Error(`Request ${sourceRequestId} not found`);
    }

    const newRequestData: Omit<RequestModel, 'id'> = {
      name: `${sourceRequest.name} (Copy)`,
      description: sourceRequest.description,
      method: sourceRequest.method,
      url: sourceRequest.url,
      params: sourceRequest.params ? sourceRequest.params.map(item => ({ ...item })) : [],
      headers: { ...sourceRequest.headers },
      body: sourceRequest.body,
      bodyMode: sourceRequest.bodyMode,
      rawType: sourceRequest.rawType,
      bodyItems: sourceRequest.bodyItems ? sourceRequest.bodyItems.map(item => ({ ...item })) : undefined,
      binaryFilePath: sourceRequest.binaryFilePath,
      graphQLQuery: sourceRequest.graphQLQuery,
      graphQLVariables: sourceRequest.graphQLVariables,
      authType: sourceRequest.authType,
      authBearerToken: sourceRequest.authBearerToken,
      authBasicUsername: sourceRequest.authBasicUsername,
      authBasicPassword: sourceRequest.authBasicPassword,
      envGroupId: sourceRequest.envGroupId,
      collectionId: newCollectionId || sourceRequest.collectionId,
      lastStatus: undefined
    };
    const newRequest = this.addRequestInternal(newRequestData);

    if (!newCollectionId) {
      const sourceIndex = this.requests.findIndex(r => r.id === sourceRequestId);
      const newIndex = this.requests.findIndex(r => r.id === newRequest.id);
      if (sourceIndex >= 0 && newIndex >= 0) {
        this.requests.splice(newIndex, 1);
        this.requests.splice(sourceIndex + 1, 0, newRequest);
      }

      if (sourceRequest.collectionId) {
        const collection = this.collections.find(c => c.id === sourceRequest.collectionId);
        if (collection) {
          collection.requests = collection.requests.filter(reqId => reqId !== newRequest.id);
          const sourceReqIndex = collection.requests.indexOf(sourceRequestId);
          if (sourceReqIndex >= 0) {
            collection.requests.splice(sourceReqIndex + 1, 0, newRequest.id);
          } else {
            collection.requests.push(newRequest.id);
          }
        }
      }
    }

    return newRequest;
  }

  duplicateRequest(sourceRequestId: string, newCollectionId?: string): RequestModel {
    const newRequest = this.duplicateRequestInternal(sourceRequestId, newCollectionId);
    this.savePersistData();
    return newRequest;
  }

  getChildEnvGroups(parentId?: string): EnvGroupModel[] {
    return this.envGroups.filter(g => g.parentId === parentId);
  }

  private addEnvGroupInternal(name: string, parentId?: string): EnvGroupModel {
    const envGroup: EnvGroupModel = {
      id: generateUniqueId('env_grp'),
      name,
      parentId
    };
    this.envGroups.push(envGroup);
    console.log(`[AddEnvGroup] Created ${envGroup.id}: ${envGroup.name}`);
    return envGroup;
  }

  addEnvGroup(name: string, parentId?: string): EnvGroupModel {
    const envGroup = this.addEnvGroupInternal(name, parentId);
    this.savePersistData();
    return envGroup;
  }

  deleteEnvGroup(id: string) {
    const childEnvGroups = this.getChildEnvGroups(id);
    childEnvGroups.forEach(child => this.deleteEnvGroup(child.id));
    this.environments = this.environments.filter(env => env.groupId !== id);
    this.envGroups = this.envGroups.filter(g => g.id !== id);
    console.log(`[DeleteEnvGroup] Deleted ${id} and its children/envs`);
    this.savePersistData();
  }

  renameEnvGroup(id: string, newName: string): boolean {
    const envGroup = this.envGroups.find(g => g.id === id);
    if (envGroup) {
      envGroup.name = newName;
      this.savePersistData();
      console.log(`[RenameEnvGroup] ${id} -> ${newName}`);
      return true;
    }
    return false;
  }

  async duplicateEnvGroup(sourceGroupId: string): Promise<EnvGroupModel> {
    const sourceGroup = this.envGroups.find(g => g.id === sourceGroupId);
    if (!sourceGroup) {
      throw new Error(`Env group ${sourceGroupId} not found`);
    }

    const newGroupName = `${sourceGroup.name} (Copy)`;
    const newGroup = this.addEnvGroupInternal(newGroupName, sourceGroup.parentId);

    const sourceEnvs = this.environments.filter(env => env.groupId === sourceGroupId);
    sourceEnvs.forEach(sourceEnv => {
      this.duplicateEnvInternal(sourceEnv.id, newGroup.id);
    });

    const childEnvGroups = this.getChildEnvGroups(sourceGroupId);
    for (const childGroup of childEnvGroups) {
      const duplicatedChild = await this.duplicateEnvGroup(childGroup.id);
      duplicatedChild.parentId = newGroup.id;
    }

    await this.savePersistData();
    console.log(`[DuplicateEnvGroup] ${sourceGroupId} -> ${newGroup.id}`);
    return newGroup;
  }

  private addEnvInternal(env: Omit<EnvModel, 'id'>): EnvModel {
    const newEnv: EnvModel = {
      id: generateUniqueId('env_var'),
      ...env
    };

    const existingEnv = this.environments.find(e => e.id === newEnv.id);
    if (existingEnv) {
      console.error(`[AddEnv] DUPLICATE ID: ${newEnv.id} - regenerating`);
      newEnv.id = generateUniqueId('env_var');
    }

    this.environments.push(newEnv);
    console.log(`[AddEnv] Added ${newEnv.id}: ${newEnv.name}=${newEnv.value}`);
    return newEnv;
  }

  addEnv(env: Omit<EnvModel, 'id'>): EnvModel {
    const newEnv = this.addEnvInternal(env);
    this.savePersistData();
    return newEnv;
  }

  deleteEnv(id: string) {
    this.environments = this.environments.filter(e => e.id !== id);
    console.log(`[DeleteEnv] Deleted ${id}`);
    this.savePersistData();
  }

  updateEnv(id: string, newData: Partial<Omit<EnvModel, 'id'>>): boolean {
    const env = this.environments.find(e => e.id === id);
    if (env) {
      Object.assign(env, newData);
      this.savePersistData();
      console.log(`[UpdateEnv] ${id}: ${JSON.stringify(newData)}`);
      return true;
    }
    return false;
  }

  private duplicateEnvInternal(sourceEnvId: string, newGroupId?: string): EnvModel {
    const sourceEnv = this.environments.find(e => e.id === sourceEnvId);
    if (!sourceEnv) {
      throw new Error(`Env variable ${sourceEnvId} not found`);
    }

    const newEnvData: Omit<EnvModel, 'id'> = {
      name: `${sourceEnv.name} (Copy)`,
      value: sourceEnv.value,
      groupId: newGroupId || sourceEnv.groupId
    };

    return this.addEnvInternal(newEnvData);
  }

  duplicateEnv(sourceEnvId: string, newGroupId?: string): EnvModel {
    const newEnv = this.duplicateEnvInternal(sourceEnvId, newGroupId);
    this.savePersistData();
    return newEnv;
  }

  deleteHistory(id: string): boolean {
    const beforeCount = this.history.length;
    this.history = this.history.filter(item => item.id !== id);
    if (this.history.length === beforeCount) {
      return false;
    }
    this.savePersistData();
    return true;
  }

  clearHistory(): boolean {
    if (this.history.length === 0) {
      return false;
    }

    this.history = [];
    this.savePersistData();
    return true;
  }

  addHistory(
    requestId: string,
    status: number,
    url: string,
    extras?: Partial<Pick<HistoryModel, 'requestName' | 'requestSnapshot' | 'responseSnapshot'>>
  ) {
    const history: HistoryModel = {
      id: generateUniqueId('hist'),
      requestId,
      timestamp: Date.now(),
      status,
      url,
      requestName: extras?.requestName,
      requestSnapshot: extras?.requestSnapshot,
      responseSnapshot: extras?.responseSnapshot
    };
    this.history.unshift(history);
    this.trimHistoryForPersistence();
    this.savePersistData();
  }
}
