#!/usr/bin/env -S npx tsx
// Shipyard CLI entry (PRD 15). Usage: npx tsx cli/shipyard.ts <command> [args]   (see --help, docs/CLI.md)
import { run } from './program';

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
  },
);
