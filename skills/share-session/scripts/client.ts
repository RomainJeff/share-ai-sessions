#!/usr/bin/env node
// Claude Session Share CLI. One JSON result on stdout; on failure, safe JSON on stderr and exit 1.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { doctor } from "./commands/doctor.ts";
import { list } from "./commands/list.ts";
import { uploadCommand } from "./commands/upload.ts";
import { sync } from "./commands/sync.ts";
import { stop } from "./commands/stop.ts";
import { pull } from "./commands/pull.ts";
import { hookStop } from "./commands/hook-stop.ts";
import { project } from "./commands/project.ts";
import { ClientError } from "./lib.ts";

// One line per command; each command lives in its own file under commands/.
const COMMANDS: Record<string, (args: string[]) => Promise<unknown>> = {
  doctor: () => doctor(),
  upload: uploadCommand,
  list: (args) => list(args),
  sync: (args) => sync(args),
  stop: (args) => stop(args),
  pull: (args) => pull(args),
  project: (args) => project(args),
  "hook-stop": () => hookStop(),
};

export async function main(argv: string[]): Promise<unknown> {
  const [name, ...args] = argv;
  const command = name ? COMMANDS[name] : undefined;
  if (!command) throw new ClientError("usage", `Usage: client.ts ${Object.keys(COMMANDS).join("|")}`);
  return command(args);
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try {
    const result = await main(process.argv.slice(2));
    if (process.argv[2] !== "hook-stop") process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const safe =
      error instanceof ClientError
        ? { code: error.code, message: error.message }
        : { code: "internal_error", message: "Client failed" };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  }
}
