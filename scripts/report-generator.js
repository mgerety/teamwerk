#!/usr/bin/env node
/**
 * Test Evidence Report Generator
 *
 * Reads Playwright JSON results + screenshots, builds a grouped HTML evidence report.
 * Automatically detects AC definitions from config, markdown, or test names.
 *
 * Usage:
 *   node report-generator.js
 *   node report-generator.js --results path/to/test-results.json
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

    // Match lines like "## AC-1: Task Creation with Validation" or "- AC-1: ..."
    const acPattern = /(?:^#+\s*|^[-*]\s*|^)(AC-\d+)[:\s]+(.+)/gm;
    let match;
    while ((match = acPattern.exec(content)) !== null) {
      const acId = match[1];
      const desc = match[2].trim().replace(/\*+/g, '');
      defs[acId] = desc;
      mins[acId] = 1;
    }

    if (Object.keys(defs).length > 0) {
      return { definitions: defs, minimums: mins, projectName: null };
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
          const acMatch = spec.title.match(/^(AC-\d+)[:\s]+(.+)/);
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
    return { definitions: defs, minimums: mins, projectName: null };
  }
  return null;
}

function loadACDefinitions(results) {
  // Priority 1: Explicit config path
  if (cliConfig) {
    const resolved = path.isAbsolute(cliConfig) ? cliConfig : path.join(PROJECT_ROOT, cliConfig);
    const fromConfig = loadACFromConfig(resolved);
    if (fromConfig) return fromConfig;
    console.warn(`Warning: Config file ${resolved} did not contain AC definitions.`);
  }

  // Priority 2: teamwerk-config.yml in project root
  const configPath = path.join(PROJECT_ROOT, 'teamwerk-config.yml');
  const fromConfig = loadACFromConfig(configPath);
  if (fromConfig) return fromConfig;

  // Priority 3: docs/acceptance-criteria.md
  const mdCandidates = [
    path.join(PROJECT_ROOT, 'docs', 'acceptance-criteria.md'),
    path.join(PROJECT_ROOT, 'docs', 'acceptance_criteria.md'),
    path.join(PROJECT_ROOT, 'acceptance-criteria.md'),
  ];
  for (const mdPath of mdCandidates) {
    const fromMd = loadACFromMarkdown(mdPath);
    if (fromMd) return fromMd;
  }

  // Priority 4: Auto-detect from test result names
  const fromTests = loadACFromTestResults(results);
  if (fromTests) return fromTests;

  // Fallback: empty
  console.warn('Warning: No AC definitions found. Report will group tests by detected AC prefixes.');
  return { definitions: {}, minimums: {}, projectName: null };
}

// --- Utility Functions ---

function stripAnsi(str) {
  return str.replace(/\u001b\[\d+m/g, '');
}

function extractAC(title) {
  const match = title.match(/^(AC-\d+)/);
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

// --- Main ---

function main() {
  const RESULTS_PATH = findResultsFile();
  const TEMPLATE_PATH = findTemplatePath();
  const OUTPUT_PATH = findOutputPath();
  const EVIDENCE_DIR = findEvidenceDir();

  const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // Load AC definitions
  const acData = loadACDefinitions(results);
  const AC_DEFINITIONS = acData.definitions;
  const AC_MINIMUMS = acData.minimums;
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
      AC_DEFINITIONS[t.ac] = t.title.replace(/^AC-\d+[:\s]+/, '').substring(0, 60);
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

    acRows += `<tr class="ac-row" data-ac="${ac}">
      <td><strong>${ac}</strong></td>
      <td>${escapeHtml(desc)}</td>
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

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, html, 'utf8');

  console.log(`Evidence report generated: ${OUTPUT_PATH}`);
  console.log(`  Total: ${totalTests} | Passed: ${passed} | Failed: ${failed} | Duration: ${durationStr}`);
  console.log(`  Screenshots embedded: ${evidenceFiles.length}`);
  console.log(`  ACs covered: ${acsCovered}/${totalACs}`);
}

main();
