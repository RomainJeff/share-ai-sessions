#!/usr/bin/env node
// Claude Session Share CLI. One JSON result on stdout; on failure, safe JSON on stderr and exit 1.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { doctor } from "./commands/doctor.ts";
import { list } from "./commands/list.ts";
import { uploadCommand } from "./commands/upload.ts";
import { ClientError } from "./lib.ts";

// One line per command; each command lives in its own file under commands/.
const COMMANDS: Record<string, (args: string[]) => Promise<unknown>> = {
  doctor: () => doctor(),
  upload: uploadCommand,
  list: (args) => list(args),
};

export async function main(argv: string[]): Promise<unknown> {
  const [name, ...args] = argv;
  const command = name ? COMMANDS[name] : undefined;
  if (!command) throw new ClientError("usage", `Usage: client.ts ${Object.keys(COMMANDS).join("|")}`);
  return command(args);
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try {
    process.stdout.write(`${JSON.stringify(await main(process.argv.slice(2)))}\n`);
  } catch (error) {
    const safe =
      error instanceof ClientError
        ? { code: error.code, message: error.message }
        : { code: "internal_error", message: "Client failed" };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  }
}
