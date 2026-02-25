import type { AxiosResponse } from 'axios';
import type { RequestModel } from '../models';
import { buildRequestEditorHtml } from './requestEditorTemplate';
import { buildResponseHtml } from './responseTemplate';

export interface EnvGroupOption {
  id: string;
  path: string;
}

export function renderRequestEditorHtml(
  request: RequestModel,
  collectionPath?: string,
  envGroupOptions: EnvGroupOption[] = []
): string {
  return buildRequestEditorHtml(request, collectionPath, envGroupOptions);
}

export function renderResponseHtml(
  response: AxiosResponse,
  durationMs: number,
  responseSizeBytes: number,
  resolvedUrl: string
): string {
  return buildResponseHtml(response, durationMs, responseSizeBytes, resolvedUrl);
}
