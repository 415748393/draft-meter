// Test entry point: `node test/run.mjs` (or `npm test`).
//
// The suites run as module side effects, so importing them in a fixed order is
// the whole runner. Exit code is non-zero when any check fails.

import { packageSuite } from './package.test.mjs';
import { clientSuite } from './client.test.mjs';
import { summarise } from './harness.mjs';

const { text, failed, total } = summarise([packageSuite, clientSuite]);
process.stdout.write(text + '\n');
if (failed > 0) {
  process.stderr.write(`\n${failed} of ${total} checks failed.\n`);
  process.exitCode = 1;
}
