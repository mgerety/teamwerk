#!/usr/bin/env node
/**
 * Test Evidence Report Generator
 *
 * Reads test results in multiple formats (Playwright JSON, JUnit XML, TRX)
 * plus screenshots, and builds a grouped HTML evidence report.
 * Automatically detects AC definitions from config, markdown, or test names.
 * Optionally includes adversarial review findings.
 *
 * Usage:
 *   node report-generator.js
 *   node report-generator.js --results path/to/test-results.json
 *   node report-generator.js --format playwright-json|junit-xml|trx|auto
 *   node report-generator.js --reviewer path/to/adversarial-review.md
 *   node report-generator.js --template path/to/template.html
 *   node report-generator.js --output path/to/evidence-report.html
 *   node report-generator.js --config path/to/teamwerk-config.yml
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

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = process.cwd();

const cliResults = getArg('--results');
const cliTemplate = getArg('--template');
const cliOutput = getArg('--output');
const cliConfig = getArg('--config');
const cliFormat = getArg('--format') || 'auto';
const cliReviewer = getArg('--reviewer');

// --- Auto-detect paths ---

function findResultsFile() {
  if (cliResults) {
    const resolved = path.isAbsolute(cliResults) ? cliResults : path.join(PROJECT_ROOT, cliResults);
    if (fs.existsSync(resolved)) return resolved;
    console.error(`Error: Results file not found: ${resolved}`);
    process.exit(1);
  }
  // Common Playwright JSON reporter output paths
  const candidates = [
    path.join(PROJECT_ROOT, 'tests', 'report', 'test-results.json'),
    path.join(PROJECT_ROOT, 'test-results', 'results.json'),
    path.join(PROJECT_ROOT, 'test-results.json'),
    path.join(PROJECT_ROOT, 'playwright-report', 'test-results.json'),
    path.join(PROJECT_ROOT, 'reports', 'test-results.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  console.error('Error: No test results JSON found. Use --results <path> to specify.');
  console.error('Searched:', candidates.map(c => path.relative(PROJECT_ROOT, c)).join(', '));
  process.exit(1);
}

function findTemplatePath() {
  if (cliTemplate) {
    const resolved = path.isAbsolute(cliTemplate) ? cliTemplate : path.join(PROJECT_ROOT, cliTemplate);
    if (fs.existsSync(resolved)) return resolved;
    console.error(`Error: Template file not found: ${resolved}`);
    process.exit(1);
  }
  // Default: bundled template in the plugin's scripts directory
  const bundled = path.join(__dirname, 'report-template.html');
  if (fs.existsSync(bundled)) return bundled;
  console.error('Error: No report template found. Use --template <path> to specify.');
  process.exit(1);
}

function findOutputPath() {
  if (cliOutput) {
    return path.isAbsolute(cliOutput) ? cliOutput : path.join(PROJECT_ROOT, cliOutput);
  }
  return path.join(PROJECT_ROOT, 'tests', 'report', 'evidence-report.html');
}

function findEvidenceDir() {
  const candidates = [
    path.join(PROJECT_ROOT, 'tests', 'evidence'),
    path.join(PROJECT_ROOT, 'test-evidence'),
    path.join(PROJECT_ROOT, 'evidence'),
    path.join(PROJECT_ROOT, 'tests', 'screenshots'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
  }
  return null;
}

// --- AC Definition Loading ---

function parseSimpleYaml(content) {
  // Minimal YAML parser for teamwerk-config.yml
  // Supports: key: value, nested objects (2-space indent), arrays (- item)
  const result = {};
  const lines = content.split('\n');
  let currentSection = null;
  let currentSubKey = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;

    const topMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    const nestedMatch = line.match(/^  (\w[\w-]*):\s*(.*)/);
    const arrayMatch = line.match(/^  - (.*)/);

    if (topMatch && !line.startsWith(' ')) {
      currentSection = topMatch[1];
      const val = topMatch[2].trim();
      if (val) {
        result[currentSection] = val;
      } else {
        result[currentSection] = {};
      }
      currentSubKey = null;
    } else if (nestedMatch && currentSection && typeof result[currentSection] === 'object' && !Array.isArray(result[currentSection])) {
      currentSubKey = nestedMatch[1];
      const val = nestedMatch[2].trim();
      if (val) {
        result[currentSection][currentSubKey] = val;
      }
    } else if (arrayMatch && currentSection) {
      if (!Array.isArray(result[currentSection])) {
        result[currentSection] = [];
      }
      result[currentSection].push(arrayMatch[1].trim());
    }
  }
  return result;
}

function loadACFromConfig(configPath) {
  if (!fs.existsSync(configPath)) return null;
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = parseSimpleYaml(content);
    const defs = {};
    const mins = {};

    if (config['acceptance-criteria'] && typeof config['acceptance-criteria'] === 'object') {
      for (const [key, val] of Object.entries(config['acceptance-criteria'])) {
        defs[key] = val;
        mins[key] = 1; // Default minimum
      }
    }

    if (config['minimum-tests'] && typeof config['minimum-tests'] === 'object') {
      for (const [key, val] of Object.entries(config['minimum-tests'])) {
        mins[key] = parseInt(val, 10) || 1;
      }
    }

    const projectName = config['project-name'] || config['name'] || null;

    if (Object.keys(defs).length > 0) {
      return { definitions: defs, minimums: mins, projectName };
    }
    return null;
  } catch {
    return null;
  }
}

function loadACFromMarkdown(mdPath) {
  if (!fs.existsSync(mdPath)) return null;
  try {
    const content = fs.readFileSync(mdPath, 'utf8');
    const defs = {};
    const mins = {};
    const statuses = {};

    // Match lines like "## AC-1.1: Task Creation with Validation" or "- AC-1: ..."
    const acPattern = /(?:^#+\s*|^[-*]\s*|^)(AC-[\d.]+)[:\s]+(.+)/gm;
    let match;
    while ((match = acPattern.exec(content)) !== null) {
      const acId = match[1];
      let desc = match[2].trim().replace(/\*+/g, '');

      // Extract inline status: "— DONE", "-- DONE", "— ACTIVE", etc.
      const inlineStatusMatch = desc.match(/\s*[—–-]{1,2}\s*(DONE|ACTIVE|OPEN)\s*$/i);
      if (inlineStatusMatch) {
        statuses[acId] = inlineStatusMatch[1].toUpperCase();
        desc = desc.slice(0, inlineStatusMatch.index).trim();
      }

      defs[acId] = desc;
      mins[acId] = 1;
    }

    // Second pass: check for **Status**: VALUE lines following AC headings
    // Structured field overrides inline if both present
    const structuredStatusPattern = /(?:^#+\s*|^[-*]\s*|^)(AC-[\d.]+)[:\s]+.+\n\*\*Status\*\*:\s*(DONE|ACTIVE|OPEN)/gim;
    let statusMatch;
    while ((statusMatch = structuredStatusPattern.exec(content)) !== null) {
      statuses[statusMatch[1]] = statusMatch[2].toUpperCase();
    }

    if (Object.keys(defs).length > 0) {
      return { definitions: defs, minimums: mins, statuses, projectName: null };
    }
    return null;
  } catch {
    return null;
  }
}

function loadACFromTestResults(results) {
  const defs = {};
  const mins = {};

  function walkSuites(suites) {
    for (const suite of suites) {
      if (suite.specs) {
        for (const spec of suite.specs) {
          const acMatch = spec.title.match(/^(AC-[\d.]+)[:\s]+(.+)/);
          if (acMatch) {
            const acId = acMatch[1];
            if (!defs[acId]) {
              // Use the part after AC-X: as description (take first occurrence)
              defs[acId] = acMatch[2].trim();
              mins[acId] = 1;
            }
          }
        }
      }
      if (suite.suites) walkSuites(suite.suites);
    }
  }
  walkSuites(results.suites || []);

  // For auto-detected ACs, try to derive a group description from the first test
  // by stripping the specific test detail
  if (Object.keys(defs).length > 0) {
    return { definitions: defs, minimums: mins, statuses: {}, projectName: null };
  }
  return null;
}

function loadACFromDirectory(dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return null;
  try {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md')).sort();
    if (files.length === 0) return null;
    const merged = { definitions: {}, minimums: {}, statuses: {}, projectName: null };
    for (const file of files) {
      const fromMd = loadACFromMarkdown(path.join(dirPath, file));
      if (fromMd) {
        Object.assign(merged.definitions, fromMd.definitions);
        Object.assign(merged.minimums, fromMd.minimums);
        Object.assign(merged.statuses, fromMd.statuses || {});
        if (!merged.projectName && fromMd.projectName) merged.projectName = fromMd.projectName;
      }
    }
    return Object.keys(merged.definitions).length > 0 ? merged : null;
  } catch {
    return null;
  }
}

function getActivePathFromConfig(configPath) {
  // Read teamwerk-config.yml and extract the active work items path
  if (!fs.existsSync(configPath)) return null;
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = parseSimpleYaml(content);

    // New format: work-items.active
    if (config['work-items'] && typeof config['work-items'] === 'object' && config['work-items']['active']) {
      return config['work-items']['active'];
    }

    // Legacy format: acceptance-criteria.path
    if (config['acceptance-criteria'] && typeof config['acceptance-criteria'] === 'object' && config['acceptance-criteria']['path']) {
      return config['acceptance-criteria']['path'];
    }

    return null;
  } catch {
    return null;
  }
}

function loadACDefinitions(results) {
  // Priority 1: Explicit config path
  if (cliConfig) {
    const resolved = path.isAbsolute(cliConfig) ? cliConfig : path.join(PROJECT_ROOT, cliConfig);
    const fromConfig = loadACFromConfig(resolved);
    if (fromConfig) return fromConfig;
    console.warn(`Warning: Config file ${resolved} did not contain AC definitions.`);
  }

  // Priority 2: teamwerk-config.yml work-items.active path (file or directory)
  const configPath = path.join(PROJECT_ROOT, 'teamwerk-config.yml');
  const activePath = getActivePathFromConfig(configPath);
  if (activePath) {
    const resolved = path.isAbsolute(activePath) ? activePath : path.join(PROJECT_ROOT, activePath);
    if (fs.existsSync(resolved)) {
      if (fs.statSync(resolved).isDirectory()) {
        const fromDir = loadACFromDirectory(resolved);
        if (fromDir) {
          // Also try to get project name from config
          const fromConfig = loadACFromConfig(configPath);
          if (fromConfig && fromConfig.projectName) fromDir.projectName = fromConfig.projectName;
          return fromDir;
        }
      } else {
        const fromMd = loadACFromMarkdown(resolved);
        if (fromMd) {
          const fromConfig = loadACFromConfig(configPath);
          if (fromConfig && fromConfig.projectName) fromMd.projectName = fromConfig.projectName;
          return fromMd;
        }
      }
    }
  }

  // Priority 3: teamwerk-config.yml inline AC definitions (legacy)
  const fromConfig = loadACFromConfig(configPath);
  if (fromConfig) return fromConfig;

  // Priority 4: docs/acceptance-criteria.md (hardcoded fallback)
  const mdCandidates = [
    path.join(PROJECT_ROOT, 'docs', 'acceptance-criteria.md'),
    path.join(PROJECT_ROOT, 'docs', 'acceptance_criteria.md'),
    path.join(PROJECT_ROOT, 'acceptance-criteria.md'),
  ];
  for (const mdPath of mdCandidates) {
    const fromMd = loadACFromMarkdown(mdPath);
    if (fromMd) return fromMd;
  }

  // Priority 5: Auto-detect from test result names
  const fromTests = loadACFromTestResults(results);
  if (fromTests) return fromTests;

  // Fallback: empty
  console.warn('Warning: No AC definitions found. Report will group tests by detected AC prefixes.');
  return { definitions: {}, minimums: {}, statuses: {}, projectName: null };
}

// --- Utility Functions ---

function stripAnsi(str) {
  return str.replace(/\u001b\[\d+m/g, '');
}

function extractAC(title) {
  const match = title.match(/^(AC-[\d.]+)/);
  return match ? match[1] : null;
}

function readImageAsBase64(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1);
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getScreenshotAC(filename) {
  const match = filename.match(/^(ac\d+)/i);
  if (match) return 'AC-' + match[1].replace(/^ac/i, '');
  return null;
}

function getScreenshotDescription(filename) {
  // Generate human-readable description from filename
  // e.g., "ac1-empty-title-error.png" -> "Empty title error"
  const withoutExt = filename.replace(/\.\w+$/, '');
  const withoutAC = withoutExt.replace(/^ac\d+-?/i, '');
  if (!withoutAC) return filename;
  return withoutAC.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// --- Multi-Format Parsers ---

/**
 * Minimal XML tag parser (no external deps).
 * Returns array of {tag, attrs, children, text} nodes.
 * Handles self-closing tags and nested structures.
 */
function parseXmlSimple(xml) {
  const nodes = [];
  // Remove XML declaration and comments
  xml = xml.replace(/<\?xml[^?]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim();

  const tagRe = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  const stack = [{ children: nodes }];
  let lastIndex = 0;
  let match;

  while ((match = tagRe.exec(xml)) !== null) {
    const [fullMatch, isClosing, tagName, attrsStr, selfClosing] = match;
    const textBefore = xml.slice(lastIndex, match.index).trim();

    if (textBefore && stack.length > 0) {
      stack[stack.length - 1].text = (stack[stack.length - 1].text || '') + textBefore;
    }

    if (isClosing) {
      // Closing tag — pop stack
      if (stack.length > 1) stack.pop();
    } else {
      // Parse attributes
      const attrs = {};
      const attrRe = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
      let attrMatch;
      while ((attrMatch = attrRe.exec(attrsStr)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }

      const node = { tag: tagName, attrs, children: [], text: '' };
      stack[stack.length - 1].children = stack[stack.length - 1].children || [];
      stack[stack.length - 1].children.push(node);

      if (!selfClosing) {
        stack.push(node);
      }
    }
    lastIndex = match.index + fullMatch.length;
  }

  return nodes;
}

function findNodes(nodes, tagName) {
  const results = [];
  for (const node of nodes) {
    if (node.tag === tagName) results.push(node);
    if (node.children) results.push(...findNodes(node.children, tagName));
  }
  return results;
}

/**
 * Parse JUnit XML format into Playwright-compatible structure.
 * JUnit XML: <testsuites> -> <testsuite> -> <testcase> with optional <failure>/<error>
 * Used by: Maestro, Java (Maven/Gradle), pytest --junitxml, Go
 */
function parseJUnitXML(content) {
  const nodes = parseXmlSimple(content);
  const testcases = findNodes(nodes, 'testcase');

  const suites = {};
  for (const tc of testcases) {
    const name = tc.attrs.name || 'Unknown Test';
    const classname = tc.attrs.classname || tc.attrs.class || '';
    const time = parseFloat(tc.attrs.time || '0') * 1000; // seconds -> ms
    const failures = findNodes(tc.children || [], 'failure');
    const errors = findNodes(tc.children || [], 'error');
    const skipped = findNodes(tc.children || [], 'skipped');

    let status = 'passed';
    const errorMessages = [];
    if (failures.length > 0) {
      status = 'failed';
      for (const f of failures) errorMessages.push(f.attrs.message || f.text || 'Test failed');
    }
    if (errors.length > 0) {
      status = 'failed';
      for (const e of errors) errorMessages.push(e.attrs.message || e.text || 'Test error');
    }
    if (skipped.length > 0) status = 'skipped';

    const suiteName = classname || 'Default Suite';
    if (!suites[suiteName]) suites[suiteName] = { file: classname, specs: [] };
    suites[suiteName].specs.push({
      title: name,
      tests: [{
        projectName: classname.includes('api') || classname.includes('API') ? 'api' : 'e2e',
        results: [{
          status,
          duration: time,
          stdout: [],
          errors: errorMessages.map(m => ({ message: m })),
        }],
      }],
      line: 0,
    });
  }

  return {
    suites: Object.values(suites).map(s => ({
      file: s.file,
      specs: s.specs,
      suites: [],
    })),
  };
}

/**
 * Parse TRX (Visual Studio Test Results) format into Playwright-compatible structure.
 * TRX: <TestRun> -> <Results> -> <UnitTestResult> with outcome attribute
 * Used by: dotnet test, MSTest, NUnit, xUnit (.NET)
 */
function parseTRX(content) {
  const nodes = parseXmlSimple(content);
  const unitResults = findNodes(nodes, 'UnitTestResult');

  const suites = {};
  for (const ur of unitResults) {
    const name = ur.attrs.testName || 'Unknown Test';
    const outcome = (ur.attrs.outcome || '').toLowerCase();
    const duration = ur.attrs.duration || '00:00:00';

    // Parse duration "HH:MM:SS.mmm" to milliseconds
    const durationParts = duration.split(':');
    let durationMs = 0;
    if (durationParts.length === 3) {
      const [h, m, s] = durationParts;
      durationMs = (parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)) * 1000;
    }

    let status = 'passed';
    const errorMessages = [];
    if (outcome === 'failed') {
      status = 'failed';
      const outputs = findNodes(ur.children || [], 'Output');
      for (const out of outputs) {
        const errInfos = findNodes(out.children || [], 'ErrorInfo');
        for (const ei of errInfos) {
          const msgs = findNodes(ei.children || [], 'Message');
          for (const m of msgs) {
            if (m.text) errorMessages.push(m.text);
          }
        }
      }
      if (errorMessages.length === 0) errorMessages.push('Test failed');
    } else if (outcome === 'notexecuted' || outcome === 'inconclusive') {
      status = 'skipped';
    }

    // Group by test class
    const className = ur.attrs.testId ? name.split('.').slice(0, -1).join('.') : 'Default Suite';
    if (!suites[className]) suites[className] = { file: className, specs: [] };
    suites[className].specs.push({
      title: name,
      tests: [{
        projectName: name.includes('Api') || name.includes('API') || name.includes('api') ? 'api' : 'e2e',
        results: [{
          status,
          duration: durationMs,
          stdout: [],
          errors: errorMessages.map(m => ({ message: m })),
        }],
      }],
      line: 0,
    });
  }

  return {
    suites: Object.values(suites).map(s => ({
      file: s.file,
      specs: s.specs,
      suites: [],
    })),
  };
}

/**
 * Detect result format from file content.
 */
function detectFormat(content, filePath) {
  if (cliFormat !== 'auto') return cliFormat;

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.trx') return 'trx';

  const trimmed = content.trim();
  if (trimmed.startsWith('{')) return 'playwright-json';
  if (trimmed.startsWith('<')) {
    if (trimmed.includes('<TestRun') || trimmed.includes('<testrun')) return 'trx';
    if (trimmed.includes('<testsuites') || trimmed.includes('<testsuite')) return 'junit-xml';
  }

  // Default to Playwright JSON
  return 'playwright-json';
}

/**
 * Parse results file based on format.
 */
function parseResults(content, format) {
  switch (format) {
    case 'junit-xml':
      return parseJUnitXML(content);
    case 'trx':
      return parseTRX(content);
    case 'playwright-json':
    default:
      return JSON.parse(content);
  }
}

// --- Adversarial Review Parser ---

/**
 * Parse adversarial-review.md into structured findings.
 * Extracts per-AC verdicts (PASS/FAIL/WARN) and details.
 */
function parseReviewerFindings(reviewPath) {
  if (!reviewPath || !fs.existsSync(reviewPath)) return null;
  try {
    const content = fs.readFileSync(reviewPath, 'utf8');
    const findings = { summary: {}, acs: [], stubAudit: [] };

    // Extract summary counts
    const passMatch = content.match(/PASS:\s*(\d+)/);
    const failMatch = content.match(/FAIL:\s*(\d+)/);
    const warnMatch = content.match(/WARN:\s*(\d+)/);
    findings.summary.pass = passMatch ? parseInt(passMatch[1]) : 0;
    findings.summary.fail = failMatch ? parseInt(failMatch[1]) : 0;
    findings.summary.warn = warnMatch ? parseInt(warnMatch[1]) : 0;

    // Extract per-AC findings
    const acPattern = /^## (AC-[\d.]+):\s*(.+?)\s*[—-]+\s*(PASS|FAIL|WARN)\s*$/gm;
    let acMatch;
    const acPositions = [];
    while ((acMatch = acPattern.exec(content)) !== null) {
      acPositions.push({
        ac: acMatch[1],
        title: acMatch[2].trim(),
        verdict: acMatch[3],
        startIdx: acMatch.index,
      });
    }

    // Extract content between AC headers
    for (let i = 0; i < acPositions.length; i++) {
      const start = acPositions[i].startIdx;
      const end = i + 1 < acPositions.length ? acPositions[i + 1].startIdx : content.length;
      const section = content.slice(start, end);

      // Extract checklist items
      const items = [];
      const itemPattern = /^- \[([ x])\] (.+)$/gm;
      let itemMatch;
      while ((itemMatch = itemPattern.exec(section)) !== null) {
        items.push({
          checked: itemMatch[1] === 'x',
          text: itemMatch[2].trim(),
        });
      }

      findings.acs.push({
        ac: acPositions[i].ac,
        title: acPositions[i].title,
        verdict: acPositions[i].verdict,
        items,
      });
    }

    // Extract stub audit table
    const stubPattern = /\|\s*(.+?)\s*\|\s*(STUBBED|IMPLEMENTED)\s*\|\s*(YES|NO)\b/g;
    let stubMatch;
    while ((stubMatch = stubPattern.exec(content)) !== null) {
      findings.stubAudit.push({
        feature: stubMatch[1].trim(),
        status: stubMatch[2],
        acceptable: stubMatch[3] === 'YES',
      });
    }

    return findings;
  } catch {
    console.warn('Warning: Could not parse adversarial review file.');
    return null;
  }
}

/**
 * Generate HTML for adversarial review findings section.
 */
function generateReviewerHtml(findings) {
  if (!findings) return '';

  let html = '';

  // Summary badges
  html += `<div style="display:flex;gap:12px;margin-bottom:16px;">
    <span class="pass-badge" style="font-size:14px;padding:4px 12px;">PASS: ${findings.summary.pass}</span>
    <span class="fail-badge" style="font-size:14px;padding:4px 12px;">FAIL: ${findings.summary.fail}</span>
    <span class="skip-badge" style="font-size:14px;padding:4px 12px;">WARN: ${findings.summary.warn}</span>
  </div>\n`;

  // Per-AC findings
  for (const ac of findings.acs) {
    const badgeClass = ac.verdict === 'PASS' ? 'pass-badge' : ac.verdict === 'FAIL' ? 'fail-badge' : 'skip-badge';
    html += `<div class="ac-section" style="margin-bottom:12px;">
  <details${ac.verdict === 'FAIL' ? ' open' : ''}>
    <summary style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;gap:8px;background:#1a1d27;border:1px solid ${ac.verdict === 'FAIL' ? '#7f1d1d' : '#2d2d44'};border-radius:6px;">
      <span class="${badgeClass}">${ac.verdict}</span>
      <span style="font-weight:600;">${escapeHtml(ac.ac)}: ${escapeHtml(ac.title)}</span>
    </summary>
    <div style="padding:12px 16px;background:#12141c;border:1px solid #1f2233;border-top:0;border-radius:0 0 6px 6px;">\n`;

    for (const item of ac.items) {
      const icon = item.checked ? '&#x2705;' : '&#x274C;';
      const style = item.checked ? '' : 'color:#fca5a5;font-weight:600;';
      html += `      <div style="margin:4px 0;${style}">${icon} ${escapeHtml(item.text)}</div>\n`;
    }

    html += `    </div>\n  </details>\n</div>\n`;
  }

  // Stub audit
  if (findings.stubAudit.length > 0) {
    html += `<h4 style="margin:20px 0 8px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Stub Audit</h4>\n`;
    html += `<table><thead><tr><th>Feature</th><th>Status</th><th>Acceptable?</th></tr></thead><tbody>\n`;
    for (const stub of findings.stubAudit) {
      const badge = stub.acceptable
        ? '<span class="pass-badge">YES</span>'
        : '<span class="fail-badge">NO</span>';
      html += `<tr><td>${escapeHtml(stub.feature)}</td><td>${stub.status}</td><td>${badge}</td></tr>\n`;
    }
    html += `</tbody></table>\n`;
  }

  return html;
}

// --- Main ---

function main() {
  const RESULTS_PATH = findResultsFile();
  const TEMPLATE_PATH = findTemplatePath();
  const OUTPUT_PATH = findOutputPath();
  const EVIDENCE_DIR = findEvidenceDir();

  const rawContent = fs.readFileSync(RESULTS_PATH, 'utf8');
  const format = detectFormat(rawContent, RESULTS_PATH);
  const results = parseResults(rawContent, format);
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // Parse adversarial review findings if provided
  const reviewerPath = cliReviewer
    ? (path.isAbsolute(cliReviewer) ? cliReviewer : path.join(PROJECT_ROOT, cliReviewer))
    : path.join(PROJECT_ROOT, 'docs', 'adversarial-review.md');
  const reviewerFindings = parseReviewerFindings(
    cliReviewer ? reviewerPath : (fs.existsSync(reviewerPath) ? reviewerPath : null)
  );

  console.log(`  Format: ${format}`);

  // Load AC definitions
  const acData = loadACDefinitions(results);
  const AC_DEFINITIONS = acData.definitions;
  const AC_MINIMUMS = acData.minimums;
  const AC_STATUSES = acData.statuses || {};
  const projectName = acData.projectName || path.basename(PROJECT_ROOT);

  // Extract all test specs (handle nested suites)
  const allTests = [];
  function walkSuites(suites) {
    for (const suite of suites) {
      if (suite.specs) {
        for (const spec of suite.specs) {
          if (!spec.tests || spec.tests.length === 0) continue;
          const test = spec.tests[0];
          if (!test.results || test.results.length === 0) continue;
          const result = test.results[0];
          const stdout = (result.stdout || []).map(s => stripAnsi(s.text || '')).join('');
          allTests.push({
            title: spec.title,
            ac: extractAC(spec.title),
            file: suite.file || '',
            line: spec.line,
            status: result.status,
            duration: result.duration,
            stdout,
            errors: result.errors || [],
            project: test.projectName,
          });
        }
      }
      if (suite.suites) walkSuites(suite.suites);
    }
  }
  walkSuites(results.suites || []);

  // Discover additional ACs from test results that weren't in definitions
  for (const t of allTests) {
    if (t.ac && !AC_DEFINITIONS[t.ac]) {
      AC_DEFINITIONS[t.ac] = t.title.replace(/^AC-[\d.]+[:\s]+/, '').substring(0, 60);
      AC_MINIMUMS[t.ac] = 1;
    }
  }

  // Stats
  const totalTests = allTests.length;
  const passed = allTests.filter(t => t.status === 'passed').length;
  const failed = allTests.filter(t => t.status !== 'passed').length;
  const totalDuration = allTests.reduce((sum, t) => sum + t.duration, 0);

  // Group tests by AC
  const acGroups = {};
  for (const ac of Object.keys(AC_DEFINITIONS)) {
    acGroups[ac] = allTests.filter(t => t.ac === ac);
  }

  // Group screenshots by AC
  const evidenceFiles = EVIDENCE_DIR
    ? fs.readdirSync(EVIDENCE_DIR).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f)).sort()
    : [];
  const screenshotsByAC = {};
  for (const file of evidenceFiles) {
    const ac = getScreenshotAC(file);
    if (ac) {
      if (!screenshotsByAC[ac]) screenshotsByAC[ac] = [];
      screenshotsByAC[ac].push(file);
    }
  }

  // --- AC Traceability Matrix ---
  let acRows = '';
  for (const [ac, desc] of Object.entries(AC_DEFINITIONS)) {
    const tests = acGroups[ac] || [];
    const passCount = tests.filter(t => t.status === 'passed').length;
    const failCount = tests.filter(t => t.status !== 'passed').length;
    const total = tests.length;
    const min = AC_MINIMUMS[ac] || 1;
    const meetsMinimum = total >= min;
    const allPass = failCount === 0 && total > 0;
    const statusBadge = allPass && meetsMinimum
      ? '<span class="pass-badge">PASS</span>'
      : (failCount > 0 ? '<span class="fail-badge">FAIL</span>' : '<span class="skip-badge">BELOW MIN</span>');

    const workStatus = AC_STATUSES[ac] || 'OPEN';
    const workStatusBadge = workStatus === 'DONE'
      ? '<span class="done-badge">DONE</span>'
      : workStatus === 'ACTIVE'
        ? '<span class="active-badge">ACTIVE</span>'
        : '<span class="open-badge">OPEN</span>';

    acRows += `<tr class="ac-row" data-ac="${ac}">
      <td><strong>${ac}</strong></td>
      <td>${escapeHtml(desc)}</td>
      <td>${workStatusBadge}</td>
      <td>${total} (min: ${min})</td>
      <td>${passCount}</td>
      <td>${failCount}</td>
      <td>${statusBadge}</td>
    </tr>\n`;
  }

  // --- AC Detail Sections ---
  let acDetailSections = '';
  for (const [ac, desc] of Object.entries(AC_DEFINITIONS)) {
    const tests = acGroups[ac] || [];
    if (tests.length === 0) continue;

    const passCount = tests.filter(t => t.status === 'passed').length;
    const failCount = tests.filter(t => t.status !== 'passed').length;
    const acDuration = tests.reduce((sum, t) => sum + t.duration, 0);
    const allPass = failCount === 0;
    const statusBadge = allPass
      ? '<span class="pass-badge">PASS</span>'
      : '<span class="fail-badge">FAIL</span>';
    const apiCount = tests.filter(t => t.project === 'api').length;
    const e2eCount = tests.filter(t => t.project !== 'api').length;
    const screenshots = screenshotsByAC[ac] || [];

    acDetailSections += `<div class="ac-section" id="ac-${ac}" data-status="${allPass ? 'pass' : 'fail'}">
  <details>
    <summary>
      <span class="ac-title">${ac}: ${escapeHtml(desc)}</span>
      <span class="ac-stats">
        ${statusBadge}
        <span>${tests.length} tests</span>
        ${apiCount > 0 ? `<span class="api-badge">API ${apiCount}</span>` : ''}
        ${e2eCount > 0 ? `<span class="e2e-badge">E2E ${e2eCount}</span>` : ''}
        <span>${formatDuration(acDuration)}</span>
        ${screenshots.length > 0 ? `<span>${screenshots.length} screenshots</span>` : ''}
      </span>
    </summary>
    <div class="ac-content">\n`;

    // Tests within this AC
    for (const t of tests) {
      const badge = t.status === 'passed'
        ? '<span class="pass-badge">PASS</span>'
        : '<span class="fail-badge">FAIL</span>';
      const typeBadge = t.project === 'api'
        ? '<span class="api-badge">API</span>'
        : '<span class="e2e-badge">E2E</span>';

      acDetailSections += `      <div class="test-card">
        <div class="test-card-header">
          ${badge} ${typeBadge}
          <span class="test-name">${escapeHtml(t.title.replace(/^AC-\d+:\s*/, ''))}</span>
          <span class="test-meta">${formatDuration(t.duration)} · ${escapeHtml(t.file)}:${t.line}</span>
        </div>\n`;

      if (t.stdout.trim()) {
        const lines = t.stdout.trim().split('\n').map(l => escapeHtml(l)).join('\n');
        acDetailSections += `        <div class="log-block">${lines}</div>\n`;
      }

      if (t.errors.length > 0) {
        for (const err of t.errors) {
          const msg = err.message || JSON.stringify(err);
          acDetailSections += `        <div class="log-block error-block">${escapeHtml(stripAnsi(msg))}</div>\n`;
        }
      }

      acDetailSections += `      </div>\n`;
    }

    // Screenshots for this AC (grid)
    if (screenshots.length > 0) {
      acDetailSections += `      <h4 style="margin:16px 0 8px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Screenshot Evidence</h4>\n`;
      acDetailSections += `      <div class="screenshot-grid">\n`;
      for (const file of screenshots) {
        const filePath = path.join(EVIDENCE_DIR, file);
        const base64 = readImageAsBase64(filePath);
        const desc = getScreenshotDescription(file);
        if (base64) {
          acDetailSections += `        <div class="screenshot-item">
          <img src="${base64}" alt="${escapeHtml(desc)}" loading="lazy" onclick="openLightbox(this.src, '${escapeHtml(desc).replace(/'/g, "\\'")}')">
          <div class="caption">${escapeHtml(desc)}</div>
        </div>\n`;
        }
      }
      acDetailSections += `      </div>\n`;
    }

    acDetailSections += `    </div>\n  </details>\n</div>\n`;
  }

  // --- Coverage Gaps ---
  let gaps = '';
  let hasGaps = false;
  for (const [ac, desc] of Object.entries(AC_DEFINITIONS)) {
    const tests = acGroups[ac] || [];
    const min = AC_MINIMUMS[ac] || 1;
    if (tests.length < min) {
      hasGaps = true;
      gaps += `<div class="gap-warning">
        <strong>${ac}: ${escapeHtml(desc)}</strong> — ${tests.length} tests found, minimum required: ${min}
      </div>\n`;
    }
  }
  if (!hasGaps) {
    gaps = '<p class="gap-ok">All acceptance criteria meet or exceed minimum test coverage requirements.</p>';
  }

  // --- Review Summary (auto-generated) ---
  const acsCovered = Object.keys(acGroups).filter(ac => acGroups[ac].length > 0).length;
  const totalACs = Object.keys(AC_DEFINITIONS).length;
  const reviewSummary = `
    <table class="review-table">
      <thead>
        <tr><th>Criterion</th><th>Status</th><th>Notes</th></tr>
      </thead>
      <tbody>
        <tr><td>AC naming convention</td><td>${totalTests > 0 ? '<span class="pass-badge">PASS</span>' : '<span class="skip-badge">N/A</span>'}</td><td>${totalTests} tests scanned</td></tr>
        <tr><td>ACs covered</td><td>${acsCovered === totalACs ? '<span class="pass-badge">PASS</span>' : '<span class="fail-badge">GAPS</span>'}</td><td>${acsCovered}/${totalACs} acceptance criteria have tests</td></tr>
        <tr><td>Minimum coverage met</td><td>${!hasGaps ? '<span class="pass-badge">PASS</span>' : '<span class="fail-badge">GAPS</span>'}</td><td>${!hasGaps ? 'All ACs meet minimum test count' : 'Some ACs below minimum'}</td></tr>
      </tbody>
    </table>
    <p style="margin-top:16px;"><strong>Summary:</strong> ${passed}/${totalTests} tests passed across ${acsCovered} acceptance criteria.</p>
  `;

  // --- Populate Template ---
  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';
  const durationStr = formatDuration(totalDuration);

  let html = template;
  html = html.replace(/\{\{PROJECT_NAME\}\}/g, escapeHtml(projectName));
  html = html.replace(/\{\{TIMESTAMP\}\}/g, timestamp);
  html = html.replace(/\{\{DURATION\}\}/g, durationStr);
  html = html.replace(/\{\{TOTAL\}\}/g, String(totalTests));
  html = html.replace(/\{\{PASSED\}\}/g, String(passed));
  html = html.replace(/\{\{FAILED\}\}/g, String(failed));
  html = html.replace('<!-- {{AC_ROWS}} -->', acRows);
  html = html.replace('<!-- {{AC_DETAIL_SECTIONS}} -->', acDetailSections);
  html = html.replace('<!-- {{SECURITY_ROWS}} -->', '');
  html = html.replace('<!-- {{GAPS}} -->', gaps);
  html = html.replace('<!-- {{REVIEW_SUMMARY}} -->', reviewSummary);

  // Inject adversarial review findings
  const reviewerHtml = generateReviewerHtml(reviewerFindings);
  html = html.replace('<!-- {{REVIEWER_FINDINGS}} -->', reviewerHtml);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, html, 'utf8');

  console.log(`Evidence report generated: ${OUTPUT_PATH}`);
  console.log(`  Format: ${format}`);
  console.log(`  Total: ${totalTests} | Passed: ${passed} | Failed: ${failed} | Duration: ${durationStr}`);
  console.log(`  Screenshots embedded: ${evidenceFiles.length}`);
  console.log(`  ACs covered: ${acsCovered}/${totalACs}`);
  const doneCount = Object.values(AC_STATUSES).filter(s => s === 'DONE').length;
  const activeCount = Object.values(AC_STATUSES).filter(s => s === 'ACTIVE').length;
  const openCount = totalACs - doneCount - activeCount;
  if (doneCount > 0 || activeCount > 0) {
    console.log(`  Work status: ${openCount} open, ${activeCount} active, ${doneCount} done`);
  }
  if (reviewerFindings) {
    console.log(`  Adversarial Review: ${reviewerFindings.summary.pass} PASS, ${reviewerFindings.summary.fail} FAIL, ${reviewerFindings.summary.warn} WARN`);
  }
}

main();
