export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
export type RequestAuthType = 'none' | 'bearer' | 'basic';
export type RequestBodyMode = 'raw' | 'form-data' | 'x-www-form-urlencoded';

export interface KeyValueItem {
  key: string;
  value: string;
  enabled: boolean;
}

export interface RequestModel {
  id: string;
  name: string;
  description?: string;
  method: HttpMethod;
  url: string;
  params?: KeyValueItem[];
  headers: Record<string, string>;
  body: string;
  bodyMode?: RequestBodyMode;
  bodyItems?: KeyValueItem[];
  authType?: RequestAuthType;
  authBearerToken?: string;
  authBasicUsername?: string;
  authBasicPassword?: string;
  envGroupId?: string;
  collectionId?: string;
  lastStatus?: number;
}

export interface CollectionModel {
  id: string;
  name: string;
  parentId?: string;
  requests: string[];
}

export interface EnvGroupModel {
  id: string;
  name: string;
  parentId?: string;
}

export interface EnvModel {
  id: string;
  name: string;
  value: string;
  groupId?: string;
}

export interface HistoryModel {
  id: string;
  requestId: string;
  timestamp: number;
  status: number;
  url: string;
}

export interface PersistData {
  collections: CollectionModel[];
  requests: RequestModel[];
  environments: EnvModel[];
  envGroups: EnvGroupModel[];
  history: HistoryModel[];
}
