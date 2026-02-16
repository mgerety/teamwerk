#!/usr/bin/env node
/**
 * Test Integrity Linter — Rule Zero Enforcement
 *
 * Scans test files for violations of the fundamental rule:
 * "Tests must NEVER modify the application under test."
 *
 * Supports JavaScript/TypeScript (Playwright), C# (Selenium), Python (Selenium),
 * and Go test files.
 *
 * Run before tests execute. Exits with code 1 if critical violations found.
 *
 * Usage:
 *   node test-integrity-linter.js
 *   node test-integrity-linter.js --dir tests/e2e
 *   node test-integrity-linter.js --file tests/e2e/login.spec.ts
 *   node test-integrity-linter.js --json
 *   node test-integrity-linter.js --fix-suggestions
 */

const fs = require('fs');
const path = require('path');

// --- CLI argument parsing ---
const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}
const hasFlag = (flag) => args.includes(flag);

const cliDir = getArg('--dir');
const cliFile = getArg('--file');
const jsonOutput = hasFlag('--json');
const showSuggestions = hasFlag('--fix-suggestions');

// --- Auto-detect test directories ---
const AUTO_DETECT_DIRS = ['tests', 'test', '__tests__', 'spec', 'Tests'];

function resolveTestDirs(projectRoot) {
  if (cliDir) {
    const resolved = path.isAbsolute(cliDir) ? cliDir : path.join(projectRoot, cliDir);
    return [resolved];
  }
  const found = [];
  for (const dir of AUTO_DETECT_DIRS) {
    const candidate = path.join(projectRoot, dir);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      found.push(candidate);
    }
  }
  return found;
}

// --- Test file extensions ---
const TEST_FILE_PATTERNS = [
  /\.spec\.js$/,
  /\.test\.js$/,
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /\.spec\.mjs$/,
  /\.test\.mjs$/,
  /Tests\.cs$/,
  /test_.*\.py$/,
  /.*_test\.py$/,
  /.*_test\.go$/,
];

function isTestFile(filename) {
  return TEST_FILE_PATTERNS.some(p => p.test(filename));
}

// --- Violation Patterns ---

// JavaScript/TypeScript Playwright patterns (kept exactly as original)
const JS_VIOLATION_PATTERNS = [
  {
    pattern: /page\.evaluate\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[\s\S]*?\.\s*style\s*\.\s*\w+\s*=/,
    id: 'DOM_STYLE_MUTATION',
    description: 'page.evaluate() modifies element .style property',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never modify application CSS/styles',
    lang: 'js',
  },
  {
    pattern: /page\.evaluate\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[\s\S]*?\.\s*hidden\s*=/,
    id: 'DOM_HIDDEN_MUTATION',
    description: 'page.evaluate() modifies element .hidden property',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never modify application visibility',
    lang: 'js',
  },
  {
    pattern: /page\.evaluate\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[\s\S]*?\.\s*(?:innerHTML|outerHTML)\s*=/,
    id: 'DOM_HTML_MUTATION',
    description: 'page.evaluate() modifies element innerHTML/outerHTML',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never modify application DOM content',
    lang: 'js',
  },
  {
    pattern: /page\.evaluate\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[\s\S]*?\.\s*(?:className\s*=|classList\s*\.\s*(?:add|remove|toggle))/,
    id: 'DOM_CLASS_MUTATION',
    description: 'page.evaluate() modifies element classes',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never modify application CSS classes',
    lang: 'js',
  },
  {
    pattern: /page\.evaluate\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[\s\S]*?\.\s*remove\s*\(\s*\)/,
    id: 'DOM_ELEMENT_REMOVAL',
    description: 'page.evaluate() removes DOM elements',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never remove application elements',
    lang: 'js',
  },
  {
    pattern: /\.display\s*=\s*['"`](?:none|block|flex|grid|inline|inherit)/,
    id: 'CSS_DISPLAY_OVERRIDE',
    description: 'Test overrides CSS display property',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never override application CSS display',
    lang: 'js',
  },
  {
    pattern: /new\s+MutationObserver/,
    id: 'MUTATION_OBSERVER',
    description: 'Test creates a MutationObserver to reactively modify the DOM',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never use MutationObserver to alter app behavior',
    lang: 'js',
  },
  {
    pattern: /page\.addStyleTag\s*\(/,
    id: 'INJECTED_STYLE',
    description: 'Test injects a <style> tag into the application',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never inject CSS into the application',
    lang: 'js',
  },
  {
    pattern: /page\.addScriptTag\s*\(/,
    id: 'INJECTED_SCRIPT',
    description: 'Test injects a <script> tag into the application',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never inject JavaScript into the application',
    lang: 'js',
  },
  {
    pattern: /page\.evaluate\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[\s\S]*?document\.getElementById\s*\([^)]+\)\s*\.\s*\w+\s*=/,
    id: 'DOM_PROPERTY_SET',
    description: 'page.evaluate() sets a property on a DOM element by ID',
    severity: 'warning',
    rule: 'Potential Rule Zero violation: verify this is read-only',
    lang: 'js',
  },
  {
    pattern: /page\.evaluate\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[\s\S]*?document\.querySelector\s*\([^)]+\)\s*\.\s*\w+\s*=/,
    id: 'DOM_QUERY_SET',
    description: 'page.evaluate() sets a property on a queried DOM element',
    severity: 'warning',
    rule: 'Potential Rule Zero violation: verify this is read-only',
    lang: 'js',
  },
];

// C# Selenium patterns
const CSHARP_VIOLATION_PATTERNS = [
  {
    pattern: /driver\.ExecuteScript\s*\([\s\S]*?\.style\s*\.\s*\w+\s*=/,
    id: 'CS_DOM_STYLE_MUTATION',
    description: 'ExecuteScript() modifies element .style property',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never modify application CSS/styles',
    lang: 'cs',
  },
  {
    pattern: /driver\.ExecuteScript\s*\([\s\S]*?\.hidden\s*=/,
    id: 'CS_DOM_HIDDEN_MUTATION',
    description: 'ExecuteScript() modifies element .hidden property',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never modify application visibility',
    lang: 'cs',
  },
  {
    pattern: /driver\.ExecuteScript\s*\([\s\S]*?\.(?:innerHTML|outerHTML)\s*=/,
    id: 'CS_DOM_HTML_MUTATION',
    description: 'ExecuteScript() modifies element innerHTML/outerHTML',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never modify application DOM content',
    lang: 'cs',
  },
  {
    pattern: /driver\.ExecuteScript\s*\([\s\S]*?\.(?:className\s*=|classList\s*\.\s*(?:add|remove|toggle))/,
    id: 'CS_DOM_CLASS_MUTATION',
    description: 'ExecuteScript() modifies element classes',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never modify application CSS classes',
    lang: 'cs',
  },
  {
    pattern: /driver\.ExecuteScript\s*\([\s\S]*?\.remove\s*\(\s*\)/,
    id: 'CS_DOM_ELEMENT_REMOVAL',
    description: 'ExecuteScript() removes DOM elements',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never remove application elements',
    lang: 'cs',
  },
  {
    pattern: /driver\.ExecuteScript\s*\([\s\S]*?\.display\s*=\s*['"]/,
    id: 'CS_CSS_DISPLAY_OVERRIDE',
    description: 'ExecuteScript() overrides CSS display property',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never override application CSS display',
    lang: 'cs',
  },
  {
    pattern: /driver\.ExecuteScript\s*\([\s\S]*?document\.getElementById\s*\([^)]+\)\s*\.\s*\w+\s*=/,
    id: 'CS_DOM_PROPERTY_SET',
    description: 'ExecuteScript() sets a property on a DOM element by ID',
    severity: 'warning',
    rule: 'Potential Rule Zero violation: verify this is read-only',
    lang: 'cs',
  },
];

// Python Selenium patterns
const PYTHON_VIOLATION_PATTERNS = [
  {
    pattern: /driver\.execute_script\s*\([\s\S]*?\.style\s*\.\s*\w+\s*=/,
    id: 'PY_DOM_STYLE_MUTATION',
    description: 'execute_script() modifies element .style property',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never modify application CSS/styles',
    lang: 'py',
  },
  {
    pattern: /driver\.execute_script\s*\([\s\S]*?\.hidden\s*=/,
    id: 'PY_DOM_HIDDEN_MUTATION',
    description: 'execute_script() modifies element .hidden property',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never modify application visibility',
    lang: 'py',
  },
  {
    pattern: /driver\.execute_script\s*\([\s\S]*?\.(?:innerHTML|outerHTML)\s*=/,
    id: 'PY_DOM_HTML_MUTATION',
    description: 'execute_script() modifies element innerHTML/outerHTML',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never modify application DOM content',
    lang: 'py',
  },
  {
    pattern: /driver\.execute_script\s*\([\s\S]*?\.(?:className\s*=|classList\s*\.\s*(?:add|remove|toggle))/,
    id: 'PY_DOM_CLASS_MUTATION',
    description: 'execute_script() modifies element classes',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never modify application CSS classes',
    lang: 'py',
  },
  {
    pattern: /driver\.execute_script\s*\([\s\S]*?\.remove\s*\(\s*\)/,
    id: 'PY_DOM_ELEMENT_REMOVAL',
    description: 'execute_script() removes DOM elements',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never remove application elements',
    lang: 'py',
  },
  {
    pattern: /driver\.execute_script\s*\([\s\S]*?\.display\s*=\s*['"]/,
    id: 'PY_CSS_DISPLAY_OVERRIDE',
    description: 'execute_script() overrides CSS display property',
    severity: 'critical',
    rule: 'Rule Zero: Tests must never override application CSS display',
    lang: 'py',
  },
  {
    pattern: /driver\.execute_script\s*\([\s\S]*?document\.getElementById\s*\([^)]+\)\s*\.\s*\w+\s*=/,
    id: 'PY_DOM_PROPERTY_SET',
    description: 'execute_script() sets a property on a DOM element by ID',
    severity: 'warning',
    rule: 'Potential Rule Zero violation: verify this is read-only',
    lang: 'py',
  },
];

const ALL_VIOLATION_PATTERNS = [
  ...JS_VIOLATION_PATTERNS,
  ...CSHARP_VIOLATION_PATTERNS,
  ...PYTHON_VIOLATION_PATTERNS,
];

// These are ALLOWED page.evaluate patterns (read-only queries)
const ALLOWED_PATTERNS = [
  /getComputedStyle/,
  /getBoundingClientRect/,
  /\.textContent(?!\s*=)/,
  /\.innerText(?!\s*=)/,
  /querySelectorAll[\s\S]*?\.(?:length|filter|map|forEach)/,
  /scroll(?:Width|Height|Top|Left)(?!\s*=)/,
  /\.(?:src|href)(?!\s*=)/,
  /Array\.from/,
];

function getFileLanguage(filePath) {
  if (/\.cs$/.test(filePath)) return 'cs';
  if (/\.py$/.test(filePath)) return 'py';
  if (/\.go$/.test(filePath)) return 'go';
  return 'js'; // js/ts/mjs
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];
  const lang = getFileLanguage(filePath);

  // Filter patterns relevant to this file's language
  const applicablePatterns = ALL_VIOLATION_PATTERNS.filter(rule => {
    if (rule.lang === lang) return true;
    // JS patterns also apply to ts/mjs files
    if (rule.lang === 'js' && lang === 'js') return true;
    return false;
  });

  for (const rule of applicablePatterns) {
    const matches = content.match(new RegExp(rule.pattern.source, 'g'));
    if (!matches) continue;

    for (const match of matches) {
      const matchIndex = content.indexOf(match);
      const lineNum = content.substring(0, matchIndex).split('\n').length;

      const contextStart = Math.max(0, lineNum - 3);
      const contextEnd = Math.min(lines.length, lineNum + 5);
      const context = lines.slice(contextStart, contextEnd).join('\n');

      violations.push({
        file: path.relative(process.cwd(), filePath),
        line: lineNum,
        id: rule.id,
        severity: rule.severity,
        description: rule.description,
        rule: rule.rule,
        context: context,
      });
    }
  }

  return violations;
}

function findTestFilesRecursive(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip common non-test directories
      if (['node_modules', '.git', 'bin', 'obj', '__pycache__', '.venv', 'venv'].includes(entry.name)) continue;
      files.push(...findTestFilesRecursive(fullPath));
    } else if (entry.isFile() && isTestFile(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function main() {
  const projectRoot = process.cwd();

  if (!jsonOutput) {
    console.log('');
    console.log('=== Test Integrity Linter — Rule Zero Enforcement ===');
    console.log('');
  }

  // Determine files to scan
  let files = [];
  if (cliFile) {
    const resolved = path.isAbsolute(cliFile) ? cliFile : path.join(projectRoot, cliFile);
    if (!fs.existsSync(resolved)) {
      if (jsonOutput) {
        console.log(JSON.stringify({ error: `File not found: ${resolved}`, violations: [], files: 0 }));
      } else {
        console.error(`Error: File not found: ${resolved}`);
      }
      process.exit(1);
    }
    files = [resolved];
  } else {
    const dirs = resolveTestDirs(projectRoot);
    if (dirs.length === 0) {
      if (jsonOutput) {
        console.log(JSON.stringify({ error: 'No test directories found', violations: [], files: 0 }));
      } else {
        console.log('No test directories found. Use --dir or --file to specify.');
      }
      process.exit(0);
    }
    for (const dir of dirs) {
      files.push(...findTestFilesRecursive(dir));
    }
  }

  if (files.length === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify({ violations: [], files: 0, critical: 0, warnings: 0, status: 'clean' }));
    } else {
      console.log('No test files found.');
    }
    process.exit(0);
  }

  if (!jsonOutput) {
    console.log(`Scanning ${files.length} test file(s)...\n`);
  }

  let allViolations = [];
  for (const file of files) {
    const violations = scanFile(file);
    allViolations = allViolations.concat(violations);
  }

  // Deduplicate violations (same file + line + id)
  const seen = new Set();
  allViolations = allViolations.filter(v => {
    const key = `${v.file}:${v.line}:${v.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const critical = allViolations.filter(v => v.severity === 'critical');
  const warnings = allViolations.filter(v => v.severity === 'warning');

  // JSON output mode
  if (jsonOutput) {
    const result = {
      files: files.length,
      violations: allViolations,
      critical: critical.length,
      warnings: warnings.length,
      status: critical.length > 0 ? 'blocked' : warnings.length > 0 ? 'warnings' : 'clean',
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(critical.length > 0 ? 1 : 0);
  }

  // Human-readable output
  if (allViolations.length === 0) {
    console.log('  PASS: No Rule Zero violations detected.\n');
    console.log('All test files respect application integrity.\n');
    process.exit(0);
  }

  if (critical.length > 0) {
    console.log(`  CRITICAL VIOLATIONS: ${critical.length}\n`);
    for (const v of critical) {
      console.log(`  [CRITICAL] ${v.file}:${v.line}`);
      console.log(`    Violation: ${v.description}`);
      console.log(`    Rule: ${v.rule}`);
      console.log(`    Context:`);
      v.context.split('\n').forEach(line => console.log(`      ${line}`));
      if (showSuggestions) {
        console.log(`    Fix: Remove this code. If the application is broken, the test should FAIL`);
        console.log(`         and document the defect — not work around it.`);
      }
      console.log('');
    }
  }

  if (warnings.length > 0) {
    console.log(`  WARNINGS (manual review needed): ${warnings.length}\n`);
    for (const v of warnings) {
      console.log(`  [WARNING] ${v.file}:${v.line}`);
      console.log(`    ${v.description}`);
      console.log(`    ${v.rule}`);
      console.log('');
    }
  }

  console.log('---');
  console.log(`Total violations: ${allViolations.length} (${critical.length} critical, ${warnings.length} warnings)`);
  console.log('');

  if (critical.length > 0) {
    console.log('BLOCKED: Tests cannot run until all critical Rule Zero violations are removed.');
    console.log('A test that modifies the application to make itself pass is worse than no test at all.');
    console.log('');
    process.exit(1);
  }

  console.log('WARNINGS ONLY: Tests may proceed, but flagged items need manual review.');
  process.exit(0);
}

main();
