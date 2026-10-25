// Shared runtime context for CLI commands: client, styling, output streams and the exit code.
import type { Client } from './http';
import type { Style } from './ansi';

export interface Io {
  out(s: string): void;
  err(s: string): void;
  /** Raw write without newline (live redraws). */
  write(s: string): void;
  isTTY: boolean;
  columns: number;
}

export const processIo: Io = {
  out: (s) => process.stdout.write(`${s}\n`),
  err: (s) => process.stderr.write(`${s}\n`),
  write: (s) => process.stdout.write(s),
  isTTY: process.stdout.isTTY === true,
  columns: process.stdout.columns || 100,
};

export interface Ctx {
  client: Client;
  st: Style;
  io: Io;
  json: boolean;
  pollMs: number;
}

export const EXIT = { ok: 0, blocked: 1, error: 2 } as const;

export class CliExit extends Error {
  constructor(readonly code: number, message = '') {
    super(message);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
