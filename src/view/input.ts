import * as vscode from 'vscode';

export type ShowInputDialog = (
  title: string,
  prompt: string,
  placeholder: string,
  validateInput?: (value: string) => string | null | undefined,
  defaultValue?: string
) => Promise<string | undefined>;

export type ShowStepwiseInputDialog = <T extends Record<string, string>>(
  steps: {
    [K in keyof T]: {
      title: string;
      prompt: string;
      placeholder: string;
      validate?: (value: string) => string | null;
      defaultValue?: string;
    }
  }
) => Promise<T | undefined>;

export const showCustomInputDialog: ShowInputDialog = async (
  title,
  prompt,
  placeholder,
  validateInput,
  defaultValue
) => {
  return await vscode.window.showInputBox({
    title,
    prompt,
    placeHolder: placeholder,
    validateInput,
    value: defaultValue
  });
};

export const showStepwiseInputDialog: ShowStepwiseInputDialog = async <T extends Record<string, string>>(
  steps: {
    [K in keyof T]: {
      title: string;
      prompt: string;
      placeholder: string;
      validate?: (value: string) => string | null;
      defaultValue?: string;
    }
  }
) => {
  const result: Partial<T> = {};

  for (const [key, config] of Object.entries(steps) as [keyof T, typeof steps[keyof T]][]) {
    const value = await showCustomInputDialog(
      config.title,
      config.prompt,
      config.placeholder,
      config.validate,
      config.defaultValue
    );

    if (value === undefined) {
      return undefined;
    }

    if (config.validate && config.validate(value) !== null) {
      vscode.window.showErrorMessage(`输入无效: ${config.validate(value)}`);
      return undefined;
    }

    result[key] = value as T[keyof T];
  }

  return result as T;
};
