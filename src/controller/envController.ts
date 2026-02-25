import * as vscode from 'vscode';
import { DataStore } from '../dataStore';
import type { ShowInputDialog, ShowStepwiseInputDialog } from '../view/input';

interface CommandNode {
  type: string;
  id: string;
  label: string;
}

export interface EnvControllerDeps {
  dataStore: DataStore;
  refreshEnvironments: () => void;
  showInputDialog: ShowInputDialog;
  showStepwiseInputDialog: ShowStepwiseInputDialog;
}

export function registerEnvironmentCommands(deps: EnvControllerDeps): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('free-request.newEnvGroup', async () => {
      const name = await deps.showInputDialog(
        '新建根环境组',
        '请输入根环境组名称',
        '例如：开发环境',
        val => val ? null : '名称不能为空'
      );
      if (name) {
        deps.dataStore.addEnvGroup(name);
        deps.refreshEnvironments();
      }
    }),

    vscode.commands.registerCommand('free-request.newSubEnvGroup', async (node: CommandNode) => {
      if (node?.type === 'env_group') {
        const name = await deps.showInputDialog(
          `新建子环境组 (${node.label})`,
          `请输入子环境组名称（隶属于 ${node.label}）`,
          '例如：API密钥',
          val => val ? null : '名称不能为空'
        );
        if (name) {
          deps.dataStore.addEnvGroup(name, node.id);
          deps.refreshEnvironments();
        }
      }
    }),

    vscode.commands.registerCommand('free-request.newEnv', async (node?: CommandNode) => {
      let groupId: string | undefined;
      if (node?.type === 'env_group') {
        groupId = node.id;
      }

      const inputData = await deps.showStepwiseInputDialog<{
        name: string;
        value: string;
      }>({
        name: {
          title: '新建环境变量',
          prompt: '请输入环境变量名称',
          placeholder: '例如：baseUrl',
          validate: val => val ? null : '变量名称不能为空'
        },
        value: {
          title: '输入变量值',
          prompt: '请输入环境变量的值',
          placeholder: '例如：https://api.example.com',
          validate: val => val ? null : '变量值不能为空'
        }
      });

      if (!inputData) {
        return;
      }

      const newEnv = deps.dataStore.addEnv({
        name: inputData.name,
        value: inputData.value,
        groupId
      });

      vscode.window.showInformationMessage(`已创建环境变量：${newEnv.name}=${newEnv.value}`);
      deps.refreshEnvironments();
    }),

    vscode.commands.registerCommand('free-request.editEnv', async (node: CommandNode) => {
      if (node?.type === 'environment') {
        const env = deps.dataStore.environments.find(e => e.id === node.id);
        if (!env) {
          vscode.window.showErrorMessage('未找到环境变量！');
          return;
        }

        const inputData = await deps.showStepwiseInputDialog<{
          name: string;
          value: string;
        }>({
          name: {
            title: '编辑环境变量',
            prompt: '请输入新的变量名称',
            placeholder: env.name,
            validate: val => val ? null : '变量名称不能为空',
            defaultValue: env.name
          },
          value: {
            title: '编辑变量值',
            prompt: `请输入 ${env.name} 的新值`,
            placeholder: env.value,
            validate: val => val ? null : '变量值不能为空',
            defaultValue: env.value
          }
        });

        if (!inputData) {
          return;
        }

        const success = deps.dataStore.updateEnv(env.id, {
          name: inputData.name,
          value: inputData.value
        });

        if (success) {
          vscode.window.showInformationMessage(`已更新环境变量：${inputData.name}=${inputData.value}`);
          deps.refreshEnvironments();
        } else {
          vscode.window.showErrorMessage('更新环境变量失败');
        }
      }
    }),

    vscode.commands.registerCommand('free-request.duplicateEnvGroup', async (node: CommandNode) => {
      if (node?.type === 'env_group') {
        try {
          const newEnvGroup = await deps.dataStore.duplicateEnvGroup(node.id);
          vscode.window.showInformationMessage(`已复制环境组：${newEnvGroup.name}`);
          setTimeout(() => deps.refreshEnvironments(), 800);
        } catch (error) {
          vscode.window.showErrorMessage(`复制环境组失败：${(error as Error).message}`);
        }
      }
    }),

    vscode.commands.registerCommand('free-request.duplicateEnv', async (node: CommandNode) => {
      if (node?.type === 'environment') {
        try {
          const newEnv = deps.dataStore.duplicateEnv(node.id);
          vscode.window.showInformationMessage(`已复制环境变量：${newEnv.name}=${newEnv.value}`);
          setTimeout(() => deps.refreshEnvironments(), 800);
        } catch (error) {
          vscode.window.showErrorMessage(`复制环境变量失败：${(error as Error).message}`);
        }
      }
    })
  ];
}