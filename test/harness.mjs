// Minimal assertion harness shared by the test suites: no dependencies,
// no framework, works on a bare `node`.
//
// Every check appends to a report and the process exits non-zero if any check
// failed, so CI and `npm test` both get the standard contract.

export function createSuite(name) {
  const lines = [];
  const failures = [];
  let count = 0;

  return {
    get name() {
      return name;
    },
    get count() {
      return count;
    },
    get failures() {
      return failures;
    },
    ok(message) {
      count += 1;
      lines.push(`  ok   ${message}`);
    },
    fail(message, detail) {
      count += 1;
      const suffix = detail === undefined || detail === '' ? '' : ` — ${detail}`;
      lines.push(`  FAIL ${message}${suffix}`);
      failures.push(message + suffix);
    },
    check(condition, message, detail) {
      if (condition) this.ok(message);
      else this.fail(message, detail);
    },
    equal(actual, expected, message) {
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      this.check(pass, message, pass ? '' : `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
    },
    match(value, pattern, message) {
      this.check(pattern.test(String(value)), message, `"${value}" did not match ${pattern}`);
    },
    note(message) {
      lines.push(`  note ${message}`);
    },
    report() {
      const status = failures.length === 0 ? 'PASS' : `FAIL (${failures.length} of ${count})`;
      return [`${name}: ${status}`, ...lines].join('\n');
    },
  };
}

export function summarise(suites) {
  const lines = [];
  let failed = 0;
  for (const suite of suites) {
    lines.push(suite.report(), '');
    failed += suite.failures.length;
  }
  const total = suites.reduce((sum, suite) => sum + suite.count, 0);
  lines.push(failed === 0 ? `RESULT: PASS (${total} checks)` : `RESULT: FAIL (${failed} failed of ${total})`);
  return { text: lines.join('\n'), failed, total };
}
