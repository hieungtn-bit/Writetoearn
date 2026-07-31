#!/usr/bin/env node
import { main } from "../src/cli.mjs";

try {
  process.exitCode = (await main()) ?? 0;
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
}
