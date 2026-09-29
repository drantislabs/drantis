export * from '@launchproof/contracts';
import type { ExecutionResult, IsolatedRunner } from '@launchproof/contracts';

export class ExecutionDisabledRunner implements IsolatedRunner {
  id = 'disabled';
  async execute(): Promise<ExecutionResult> {
    throw new Error(
      'Dynamic execution is disabled: configure an explicitly authorized isolated runner.',
    );
  }
}

export * from './engine.js';

export * from './capabilities.js';
