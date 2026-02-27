import type { AxiosResponse } from 'axios';
import type { RequestModel } from '../models';
import { buildRequestEditorHtml } from './requestEditorTemplate';
import { buildResponseHtml } from './responseTemplate';

export interface EnvGroupOption {
  id: string;
  path: string;
}

export interface EnvVariableOption {
  name: string;
  value: string;
}

export type EnvGroupVariableMap = Record<string, EnvVariableOption[]>;

export function renderRequestEditorHtml(
  request: RequestModel,
  collectionPath?: string,
  envGroupOptions: EnvGroupOption[] = [],
  envGroupVariableMap: EnvGroupVariableMap = {}
): string {
  return buildRequestEditorHtml(request, collectionPath, envGroupOptions, envGroupVariableMap);
}

export function renderResponseHtml(
  response: AxiosResponse,
  durationMs: number,
  responseSizeBytes: number,
  resolvedUrl: string
): string {
  return buildResponseHtml(response, durationMs, responseSizeBytes, resolvedUrl);
}
