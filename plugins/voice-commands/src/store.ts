import { randomUUID } from "node:crypto";
import type { PluginStorage } from "freestyle-voice";
import type { CommandAction, VoiceCommand } from "./types.js";

const STORAGE_KEY = "commands";

export interface CommandDraft {
  name: string;
  triggers: string[];
  description: string;
  action: CommandAction;
  enabled: boolean;
}

/**
 * In-memory, storage-backed collection of voice commands. Seeded from
 * {@link PluginStorage} on `load` and persisted on every mutation, so the
 * server-side detection path and the UI CRUD API share one source of truth.
 */
export class CommandStore {
  private commands: VoiceCommand[] = [];
  private storage: PluginStorage | null = null;

  async load(storage: PluginStorage): Promise<void> {
    this.storage = storage;
    const stored = await storage.get<VoiceCommand[]>(STORAGE_KEY);
    this.commands = Array.isArray(stored) ? stored : [];
  }

  list(): VoiceCommand[] {
    return this.commands;
  }

  get(id: string): VoiceCommand | undefined {
    return this.commands.find((c) => c.id === id);
  }

  async create(draft: CommandDraft): Promise<VoiceCommand> {
    const command: VoiceCommand = { id: randomUUID(), ...draft };
    this.commands.push(command);
    await this.persist();
    return command;
  }

  async update(id: string, draft: CommandDraft): Promise<VoiceCommand | null> {
    const index = this.commands.findIndex((c) => c.id === id);
    if (index === -1) return null;
    const updated: VoiceCommand = { id, ...draft };
    this.commands[index] = updated;
    await this.persist();
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    const before = this.commands.length;
    this.commands = this.commands.filter((c) => c.id !== id);
    if (this.commands.length === before) return false;
    await this.persist();
    return true;
  }

  private async persist(): Promise<void> {
    if (this.storage) await this.storage.set(STORAGE_KEY, this.commands);
  }
}
