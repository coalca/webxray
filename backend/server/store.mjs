import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createDefaultState, normalizeState } from './defaults.mjs';

export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'state.json');
    this.state = createDefaultState();
    this.queue = Promise.resolve();
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      this.state = normalizeState(JSON.parse(await readFile(this.file, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.save();
    }
    return this.state;
  }

  get() {
    return structuredClone(this.state);
  }

  async update(mutator) {
    let result;
    const operation = this.queue.then(async () => {
      const draft = structuredClone(this.state);
      result = await mutator(draft);
      this.state = normalizeState(draft);
      await this.save();
    });
    this.queue = operation.catch(() => {});
    await operation;
    return result;
  }

  async save() {
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.file);
  }
}
