#!/usr/bin/env node

/**
 * Teamwerk E2E Evidence Report Generator v3
 *
 * Multi-format test result parser and evidence report generator.
 * Supports: JUnit XML (Maestro, pytest, Java), Playwright JSON, TRX (.NET)
 *
 * Produces a single self-contained HTML evidence report from:
 *   1. Test result files (JUnit XML, Playwright JSON, or TRX)
 *   2. Screenshot PNG files (evidence images)
 *   3. Maestro commands JSON (step-level execution detail)
 *   4. YAML test files (comment headers: Test, AC, Purpose, Expected, Preconditions)
 *   5. Adversarial review findings (optional)
 *
 * Report includes:
 *   - Clickable AC traceability matrix
 *   - Screen-grouped or AC-grouped test sections
 *   - Per-test metadata (purpose, expected, preconditions)
 *   - Execution steps with inline screenshots
 *   - Lightbox for full-size screenshot viewing
 *   - Adversarial review findings (if provided)
 *
 * Modes:
 *   --mode ac          Group by acceptance criteria (development/PR review)
 *   --mode regression  Group by screen (full regression suite)
 *
 * Usage:
 *   node report-generator.js \
 *     --input <results-dir> \
 *     --output <report.html> \
 *     [--mode ac|regression] \
 *     [--format auto|junit-xml|playwright-json|trx] \
 *     [--tests <yaml-dir>] \
 *     [--screenshots <screenshots-dir>] \
 *     [--reviewer <adversarial-review.md>] \
 *     [--config <teamwerk-config.yml>] \
 *     [--logo <png-path>] \
 *     [--company-name <name>] \
 *     [--title <title>]
 *
 * Defaults:
 *   --input        test-reports/e2e-results
 *   --output       test-reports/e2e-report.html
 *   --mode         ac
 *   --format       auto (detect from file content)
 *   --tests        __tests__/e2e/screens
 *   --screenshots  (auto: input/screenshots, then test-reports/screenshots)
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    input: "test-reports/e2e-results",
    output: "test-reports/e2e-report.html",
    tests: "__tests__/e2e/screens",
    screenshots: "",
    mode: "ac",
    format: "auto",
    reviewer: "",
    config: "",
    logo: "",
    companyName: "",
    title: "E2E Evidence Report",
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) opts.input = args[++i];
    else if (args[i] === "--output" && args[i + 1]) opts.output = args[++i];
    else if (args[i] === "--mode" && args[i + 1]) opts.mode = args[++i];
    else if (args[i] === "--format" && args[i + 1]) opts.format = args[++i];
    else if (args[i] === "--tests" && args[i + 1]) opts.tests = args[++i];
    else if (args[i] === "--screenshots" && args[i + 1]) opts.screenshots = args[++i];
    else if (args[i] === "--reviewer" && args[i + 1]) opts.reviewer = args[++i];
    else if (args[i] === "--config" && args[i + 1]) opts.config = args[++i];
    else if (args[i] === "--logo" && args[i + 1]) opts.logo = args[++i];
    else if (args[i] === "--company-name" && args[i + 1]) opts.companyName = args[++i];
    else if (args[i] === "--title" && args[i + 1]) opts.title = args[++i];
    else if (args[i] === "--help") {
      console.log("Usage: report-generator.js [--input <dir>] [--output <file>] [--mode ac|regression] [--format auto|junit-xml|playwright-json|trx] [--tests <yaml-dir>] [--screenshots <dir>] [--reviewer <adversarial-review.md>] [--config <teamwerk-config.yml>] [--logo <file>] [--company-name <name>] [--title <title>]");
      process.exit(0);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Playwright JSON parser — converts Playwright format to JUnit-compatible structure
// ---------------------------------------------------------------------------

function parsePlaywrightJSON(jsonContent) {
  const results = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
  const suites = [];

  function walkSuites(pwSuites) {
    for (const suite of pwSuites) {
      if (suite.specs) {
        for (const spec of suite.specs) {
          if (!spec.tests || spec.tests.length === 0) continue;
          const test = spec.tests[0];
          if (!test.results || test.results.length === 0) continue;
          const result = test.results[0];
          const stdout = (result.stdout || []).map(s => typeof s === 'string' ? s : (s.text || '')).join('');
          suites.push({
            name: spec.title,
            file: suite.file || '',
            time: (result.duration || 0) / 1000,
            status: result.status === 'passed' ? 'passed' : 'failed',
            error: result.errors && result.errors.length > 0
              ? result.errors.map(e => e.message || JSON.stringify(e)).join('\n')
              : '',
            stdout,
          });
        }
      }
      if (suite.suites) walkSuites(suite.suites);
    }
  }
  walkSuites(results.suites || []);
  return suites;
}

// ---------------------------------------------------------------------------
// TRX (.NET) parser — converts Visual Studio Test Results to flat test list
// ---------------------------------------------------------------------------

function parseTRXContent(xml) {
  const suites = [];
  const resultRe = /<UnitTestResult\b([^>]*)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/g;
  let match;
  while ((match = resultRe.exec(xml))) {
    const attrs = {};
    const attrRe = /(\w[\w.-]*)="([^"]*)"/g;
    let am;
    while ((am = attrRe.exec(match[1]))) attrs[am[1]] = am[2];

    const name = attrs.testName || 'Unknown Test';
    const outcome = (attrs.outcome || '').toLowerCase();
    const duration = attrs.duration || '00:00:00';

    // Parse "HH:MM:SS.mmm" to seconds
    const durationParts = duration.split(':');
    let timeSec = 0;
    if (durationParts.length === 3) {
      const [h, m, s] = durationParts;
      timeSec = parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
    }

    let status = 'passed';
    let errorMsg = '';
    if (outcome === 'failed') {
      status = 'failed';
      const msgMatch = (match[2] || '').match(/<Message>([\s\S]*?)<\/Message>/);
      errorMsg = msgMatch ? msgMatch[1].trim() : 'Test failed';
    } else if (outcome === 'notexecuted' || outcome === 'inconclusive') {
      status = 'skipped';
    }

    suites.push({ name, file: '', time: timeSec, status, error: errorMsg, stdout: '' });
  }
  return suites;
}

// ---------------------------------------------------------------------------
// Format auto-detection
// ---------------------------------------------------------------------------

function detectResultFormat(content, filePath, cliFormat) {
  if (cliFormat && cliFormat !== 'auto') return cliFormat;
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.trx') return 'trx';
  const trimmed = (content || '').trim();
  if (trimmed.startsWith('{')) return 'playwright-json';
  if (trimmed.startsWith('<')) {
    if (trimmed.includes('<TestRun') || trimmed.includes('<testrun')) return 'trx';
    if (trimmed.includes('<testsuites') || trimmed.includes('<testsuite')) return 'junit-xml';
  }
  return 'junit-xml';
}

// ---------------------------------------------------------------------------
// Adversarial review parser
// ---------------------------------------------------------------------------

function parseAdversarialReview(reviewPath) {
  if (!reviewPath || !fs.existsSync(reviewPath)) return null;
  try {
    const content = fs.readFileSync(reviewPath, 'utf8');
    const findings = { summary: {}, acs: [], stubAudit: [] };

    const passMatch = content.match(/PASS:\s*(\d+)/);
    const failMatch = content.match(/FAIL:\s*(\d+)/);
    const warnMatch = content.match(/WARN:\s*(\d+)/);
    findings.summary.pass = passMatch ? parseInt(passMatch[1]) : 0;
    findings.summary.fail = failMatch ? parseInt(failMatch[1]) : 0;
    findings.summary.warn = warnMatch ? parseInt(warnMatch[1]) : 0;

    const acPattern = /^## (AC-[\d.]+):\s*(.+?)\s*[—-]+\s*(PASS|FAIL|WARN)\s*$/gm;
    let acMatch;
    const acPositions = [];
    while ((acMatch = acPattern.exec(content)) !== null) {
      acPositions.push({ ac: acMatch[1], title: acMatch[2].trim(), verdict: acMatch[3], startIdx: acMatch.index });
    }

    for (let i = 0; i < acPositions.length; i++) {
      const start = acPositions[i].startIdx;
      const end = i + 1 < acPositions.length ? acPositions[i + 1].startIdx : content.length;
      const section = content.slice(start, end);
      const items = [];
      const itemPattern = /^- \[([ x])\] (.+)$/gm;
      let itemMatch;
      while ((itemMatch = itemPattern.exec(section)) !== null) {
        items.push({ checked: itemMatch[1] === 'x', text: itemMatch[2].trim() });
      }
      findings.acs.push({ ac: acPositions[i].ac, title: acPositions[i].title, verdict: acPositions[i].verdict, items });
    }

    const stubPattern = /\|\s*(.+?)\s*\|\s*(STUBBED|IMPLEMENTED)\s*\|\s*(YES|NO)\b/g;
    let stubMatch;
    while ((stubMatch = stubPattern.exec(content)) !== null) {
      findings.stubAudit.push({ feature: stubMatch[1].trim(), status: stubMatch[2], acceptable: stubMatch[3] === 'YES' });
    }

    return findings;
  } catch { return null; }
}

function generateAdversarialReviewHtml(findings) {
  if (!findings) return '';
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let html = '<div style="margin:24px 0;">';
  html += '<h3 style="color:#e5e7eb;margin-bottom:12px;">Adversarial Review Findings</h3>';
  html += `<div style="display:flex;gap:12px;margin-bottom:16px;">
    <span style="background:#166534;color:#fff;padding:4px 12px;border-radius:4px;">PASS: ${findings.summary.pass}</span>
    <span style="background:#991b1b;color:#fff;padding:4px 12px;border-radius:4px;">FAIL: ${findings.summary.fail}</span>
    <span style="background:#92400e;color:#fff;padding:4px 12px;border-radius:4px;">WARN: ${findings.summary.warn}</span>
  </div>`;

  for (const ac of findings.acs) {
    const color = ac.verdict === 'PASS' ? '#166534' : ac.verdict === 'FAIL' ? '#991b1b' : '#92400e';
    html += `<details${ac.verdict === 'FAIL' ? ' open' : ''} style="margin:8px 0;">
      <summary style="padding:10px 14px;cursor:pointer;background:#1a1d27;border:1px solid ${ac.verdict === 'FAIL' ? '#7f1d1d' : '#2d2d44'};border-radius:6px;">
        <span style="background:${color};color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;">${ac.verdict}</span>
        <span style="margin-left:8px;font-weight:600;color:#e5e7eb;">${esc(ac.ac)}: ${esc(ac.title)}</span>
      </summary>
      <div style="padding:10px 14px;background:#12141c;border:1px solid #1f2233;border-top:0;border-radius:0 0 6px 6px;">`;
    for (const item of ac.items) {
      const icon = item.checked ? '&#x2705;' : '&#x274C;';
      html += `<div style="margin:3px 0;${item.checked ? '' : 'color:#fca5a5;font-weight:600;'}">${icon} ${esc(item.text)}</div>`;
    }
    html += '</div></details>';
  }

  if (findings.stubAudit.length > 0) {
    html += '<h4 style="margin:20px 0 8px;font-size:13px;color:#9ca3af;text-transform:uppercase;">Stub Audit</h4>';
    html += '<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;padding:6px;border-bottom:1px solid #333;">Feature</th><th style="padding:6px;border-bottom:1px solid #333;">Status</th><th style="padding:6px;border-bottom:1px solid #333;">Acceptable?</th></tr></thead><tbody>';
    for (const stub of findings.stubAudit) {
      const badge = stub.acceptable
        ? '<span style="background:#166534;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;">YES</span>'
        : '<span style="background:#991b1b;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;">NO</span>';
      html += `<tr><td style="padding:6px;border-bottom:1px solid #222;">${esc(stub.feature)}</td><td style="padding:6px;border-bottom:1px solid #222;text-align:center;">${stub.status}</td><td style="padding:6px;border-bottom:1px solid #222;text-align:center;">${badge}</td></tr>`;
    }
    html += '</tbody></table>';
  }

  html += '</div>';
  return html;
}

// ---------------------------------------------------------------------------
// Teamwerk config-based AC loading
// ---------------------------------------------------------------------------

function loadACsFromTeamwerkConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) return null;
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    // Simple YAML parser for work-items.active path
    const activeMatch = content.match(/active:\s*"?([^"\n]+)"?/);
    if (!activeMatch) return null;
    const activePath = activeMatch[1].trim();
    const resolved = path.isAbsolute(activePath) ? activePath : path.join(path.dirname(configPath), activePath);
    if (!fs.existsSync(resolved)) return null;

    const isDir = fs.statSync(resolved).isDirectory();
    const files = isDir
      ? fs.readdirSync(resolved).filter(f => f.endsWith('.md')).map(f => path.join(resolved, f))
      : [resolved];

    const acs = {};
    for (const file of files) {
      const md = fs.readFileSync(file, 'utf8');
      const acPattern = /(?:^#+\s*|^[-*]\s*|^)(AC-[\d.]+)[:\s]+(.+)/gm;
      let m;
      while ((m = acPattern.exec(md)) !== null) {
        let desc = m[2].trim().replace(/\*+/g, '');
        desc = desc.replace(/\s*[—–-]{1,2}\s*(DONE|ACTIVE|OPEN)\s*$/i, '').trim();
        acs[m[1]] = desc;
      }
    }
    return Object.keys(acs).length > 0 ? acs : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Minimal XML parser (no dependencies)
// ---------------------------------------------------------------------------

function parseXMLAttr(tag) {
  const attrs = {};
  const re = /(\w[\w.-]*)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) attrs[m[1]] = m[2];
  return attrs;
}

function parseJUnitXML(xml) {
  const suites = [];
  const suiteRe = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g;
  let suiteMatch;
  while ((suiteMatch = suiteRe.exec(xml))) {
    const suiteAttrs = parseXMLAttr(suiteMatch[1]);
    const body = suiteMatch[2];
    const tests = [];

    const tcRe = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
    let tcMatch;
    while ((tcMatch = tcRe.exec(body))) {
      const tcAttrs = parseXMLAttr(tcMatch[1]);
      const tcBody = tcMatch[2] || "";

      let status = "passed";
      let errorMessage = "";

      if (/<failure\b/.test(tcBody)) {
        status = "failed";
        const failMsgMatch = tcBody.match(/<failure[^>]*(?:message="([^"]*)")?[^>]*>([\s\S]*?)<\/failure>/);
        if (failMsgMatch) errorMessage = failMsgMatch[1] || failMsgMatch[2] || "";
      } else if (/<error\b/.test(tcBody)) {
        status = "error";
        const errMsgMatch = tcBody.match(/<error[^>]*(?:message="([^"]*)")?[^>]*>([\s\S]*?)<\/error>/);
        if (errMsgMatch) errorMessage = errMsgMatch[1] || errMsgMatch[2] || "";
      } else if (/<skipped/.test(tcBody)) {
        status = "skipped";
      }

      tests.push({
        name: tcAttrs.name || "unknown",
        classname: tcAttrs.classname || "",
        time: parseFloat(tcAttrs.time) || 0,
        status,
        errorMessage: decodeXMLEntities(errorMessage.trim()),
      });
    }

    suites.push({
      name: suiteAttrs.name || "unknown",
      tests: parseInt(suiteAttrs.tests, 10) || tests.length,
      failures: parseInt(suiteAttrs.failures, 10) || 0,
      errors: parseInt(suiteAttrs.errors, 10) || 0,
      time: parseFloat(suiteAttrs.time) || 0,
      device: suiteAttrs.device || "",
      testCases: tests,
    });
  }

  return suites;
}

function decodeXMLEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ---------------------------------------------------------------------------
// YAML comment parser — extracts test metadata from comment headers
// ---------------------------------------------------------------------------

function parseYAMLFile(yamlContent) {
  const result = {
    name: "",
    acs: [],  // supports multiple: "# AC: AC-22.3, AC-22.6"
    purpose: "",
    expected: "",
    preconditions: "",
    screenshots: [],
    steps: [],
    tags: [],
  };
  const lines = yamlContent.split("\n");
  let inSteps = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Comment headers
    const testMatch = trimmed.match(/^#\s*(?:--?\s*)?Test:\s*(.+?)\s*-*\s*$/);
    if (testMatch) { result.name = testMatch[1]; continue; }

    const acMatch = trimmed.match(/^#\s*AC:\s*(.+)$/);
    if (acMatch) {
      result.acs = acMatch[1].split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
      continue;
    }

    const purposeMatch = trimmed.match(/^#\s*Purpose:\s*(.+)$/);
    if (purposeMatch) { result.purpose = purposeMatch[1].trim(); continue; }

    const expectedMatch = trimmed.match(/^#\s*Expected:\s*(.+)$/);
    if (expectedMatch) { result.expected = expectedMatch[1].trim(); continue; }

    const precondMatch = trimmed.match(/^#\s*Preconditions?:\s*(.+)$/);
    if (precondMatch) { result.preconditions = precondMatch[1].trim(); continue; }

    // After the --- separator, we're in the steps section
    if (trimmed === "---") { inSteps = true; continue; }

    if (inSteps) {
      // Parse YAML steps into human-readable descriptions
      const screenshotMatch = trimmed.match(/^-\s*takeScreenshot:\s*(.+)$/);
      if (screenshotMatch) {
        const ssName = screenshotMatch[1].trim();
        result.screenshots.push(ssName);
        result.steps.push({ type: "screenshot", detail: ssName });
        continue;
      }

      const runFlowMatch = trimmed.match(/^-\s*runFlow:\s*(.+)$/);
      if (runFlowMatch) {
        result.steps.push({ type: "runFlow", detail: runFlowMatch[1].trim() });
        continue;
      }

      const assertVisMatch = trimmed.match(/^-\s*assertVisible:\s*$/);
      if (assertVisMatch) {
        result.steps.push({ type: "assertVisible", detail: "" });
        continue;
      }

      const assertNotVisMatch = trimmed.match(/^-\s*assertNotVisible:\s*$/);
      if (assertNotVisMatch) {
        result.steps.push({ type: "assertNotVisible", detail: "" });
        continue;
      }

      const tapOnMatch = trimmed.match(/^-\s*tapOn:\s*$/);
      if (tapOnMatch) {
        result.steps.push({ type: "tap", detail: "" });
        continue;
      }

      const swipeMatch = trimmed.match(/^-\s*swipe:\s*$/);
      if (swipeMatch) {
        result.steps.push({ type: "swipe", detail: "" });
        continue;
      }

      const waitAnimMatch = trimmed.match(/^-\s*waitForAnimationToEnd\s*$/);
      if (waitAnimMatch) {
        result.steps.push({ type: "waitAnimation", detail: "" });
        continue;
      }

      const waitUntilMatch = trimmed.match(/^-\s*extendedWaitUntil:\s*$/);
      if (waitUntilMatch) {
        result.steps.push({ type: "waitUntil", detail: "" });
        continue;
      }

      const pressKeyMatch = trimmed.match(/^-\s*pressKey:\s*(.+)$/);
      if (pressKeyMatch) {
        result.steps.push({ type: "pressKey", detail: pressKeyMatch[1].trim() });
        continue;
      }

      // Inline text/id properties — attach to the last step
      const textMatch = trimmed.match(/^text:\s*"?(.+?)"?\s*$/);
      if (textMatch && result.steps.length > 0) {
        const last = result.steps[result.steps.length - 1];
        last.detail = (last.detail ? last.detail + " " : "") + `text: "${textMatch[1]}"`;
        continue;
      }

      const idMatch = trimmed.match(/^id:\s*"?(.+?)"?\s*$/);
      if (idMatch && result.steps.length > 0) {
        const last = result.steps[result.steps.length - 1];
        last.detail = (last.detail ? last.detail + " " : "") + `id: "${idMatch[1]}"`;
        continue;
      }

      const dirMatch = trimmed.match(/^direction:\s*(.+)$/);
      if (dirMatch && result.steps.length > 0) {
        const last = result.steps[result.steps.length - 1];
        last.detail = (last.detail ? last.detail + " " : "") + dirMatch[1].trim();
        continue;
      }

      const startMatch = trimmed.match(/^start:\s*"?(.+?)"?\s*$/);
      if (startMatch && result.steps.length > 0) {
        const last = result.steps[result.steps.length - 1];
        last.detail = (last.detail ? last.detail + " " : "") + `from ${startMatch[1]}`;
        continue;
      }

      const endMatch = trimmed.match(/^end:\s*"?(.+?)"?\s*$/);
      if (endMatch && result.steps.length > 0) {
        const last = result.steps[result.steps.length - 1];
        last.detail = (last.detail ? last.detail + " " : "") + `to ${endMatch[1]}`;
        continue;
      }

      const timeoutMatch = trimmed.match(/^timeout:\s*(\d+)$/);
      if (timeoutMatch && result.steps.length > 0) {
        const last = result.steps[result.steps.length - 1];
        last.detail = (last.detail ? last.detail + " " : "") + `(timeout: ${timeoutMatch[1]}ms)`;
        continue;
      }

      // Inline comment — add as context to last step
      const commentMatch = trimmed.match(/^#\s*(.+)$/);
      if (commentMatch && result.steps.length > 0) {
        const last = result.steps[result.steps.length - 1];
        if (!last.comment) last.comment = commentMatch[1];
      } else if (commentMatch) {
        // Standalone comment before first step — add as a note step
        result.steps.push({ type: "note", detail: commentMatch[1] });
      }

      // Visible block helpers
      const visibleMatch = trimmed.match(/^visible:\s*$/);
      if (visibleMatch && result.steps.length > 0) {
        // next line will have the text
        continue;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Screenshot discovery — searches multiple directories
// ---------------------------------------------------------------------------

function findScreenshots(...dirs) {
  const screenshots = {};

  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue;

    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(png|jpg|jpeg)$/i.test(entry.name)) {
          const key = path.basename(entry.name, path.extname(entry.name)).toLowerCase();
          if (!screenshots[key]) screenshots[key] = [];
          screenshots[key].push(full);
        }
      }
    };
    walk(dir);
  }
  return screenshots;
}

function toBase64DataURI(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const mime = ext === "png" ? "image/png" : "image/jpeg";
    const data = fs.readFileSync(filePath).toString("base64");
    return `data:${mime};base64,${data}`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Auto-detect Maestro commands from ~/.maestro/tests/
// ---------------------------------------------------------------------------

function findMaestroCommands(inputDir) {
  const commandsByTest = {};

  // First check input dir for copied commands
  if (inputDir && fs.existsSync(inputDir)) {
    try {
      for (const f of fs.readdirSync(inputDir)) {
        const match = f.match(/^commands-\(?(.+?)\)?.json$/);
        if (match) {
          const key = match[1].replace(/\.yaml$/, "").toLowerCase();
          commandsByTest[key] = path.join(inputDir, f);
        }
      }
    } catch { /* skip */ }
  }

  // Then check ~/.maestro/tests/ for most recent runs
  const maestroTestsDir = path.join(process.env.HOME || "~", ".maestro", "tests");
  if (!fs.existsSync(maestroTestsDir)) return commandsByTest;

  const dirs = fs.readdirSync(maestroTestsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();

  for (const dir of dirs) {
    const fullDir = path.join(maestroTestsDir, dir);
    try {
      for (const f of fs.readdirSync(fullDir)) {
        const match = f.match(/^commands-\(?(.+?)\)?.json$/);
        if (match) {
          const key = match[1].replace(/\.yaml$/, "").toLowerCase();
          if (!commandsByTest[key]) {
            commandsByTest[key] = path.join(fullDir, f);
          }
        }
      }
    } catch { /* skip */ }
  }

  return commandsByTest;
}

// ---------------------------------------------------------------------------
// Parse Maestro commands JSON into steps
// ---------------------------------------------------------------------------

function parseCommandsJSON(jsonContent) {
  try {
    const commands = JSON.parse(jsonContent);
    if (!Array.isArray(commands)) return [];
    return commands.map((entry) => {
      const cmd = entry.command || {};
      const meta = entry.metadata || {};
      let type = "unknown";
      let detail = "";
      let screenshotName = "";

      if (cmd.assertConditionCommand) {
        type = "assertVisible";
        const cond = cmd.assertConditionCommand.condition || {};
        if (cond.visible) {
          detail = `text: "${cond.visible.textRegex || cond.visible.text || ""}"`;
        } else if (cond.notVisible) {
          type = "assertNotVisible";
          detail = `text: "${cond.notVisible.textRegex || cond.notVisible.text || ""}"`;
        }
      } else if (cmd.tapOnElement) {
        type = "tap";
        const sel = cmd.tapOnElement.selector || {};
        detail = sel.textRegex || sel.text || sel.id || "";
      } else if (cmd.inputTextCommand || cmd.inputRandomTextCommand) {
        type = "input";
        const inputCmd = cmd.inputTextCommand || cmd.inputRandomTextCommand || {};
        detail = inputCmd.text ? `"${inputCmd.text}"` : "(random)";
      } else if (cmd.eraseTextCommand) {
        type = "erase";
        detail = `${cmd.eraseTextCommand.charactersToErase || "all"} chars`;
      } else if (cmd.takeScreenshotCommand) {
        type = "screenshot";
        screenshotName = cmd.takeScreenshotCommand.path || "";
        detail = screenshotName;
      } else if (cmd.launchAppCommand) {
        type = "launch";
        detail = cmd.launchAppCommand.appId || "";
      } else if (cmd.runFlowCommand) {
        type = "runFlow";
        detail = cmd.runFlowCommand.path || "";
      } else if (cmd.waitForAnimationToEndCommand) {
        type = "waitAnimation";
      } else if (cmd.extendedWaitUntilCommand) {
        type = "waitUntil";
        const cond = cmd.extendedWaitUntilCommand.condition || {};
        if (cond.visible) {
          detail = `visible: "${cond.visible.textRegex || ""}"`;
        }
      } else if (cmd.swipeCommand) {
        type = "swipe";
        detail = cmd.swipeCommand.direction || "";
      } else if (cmd.pressKeyCommand) {
        type = "pressKey";
        detail = cmd.pressKeyCommand.code || "";
      } else {
        const keys = Object.keys(cmd);
        if (keys.length > 0) type = keys[0].replace(/Command$/, "");
      }

      return {
        type,
        detail,
        screenshotName,
        status: (meta.status || "UNKNOWN").toUpperCase(),
        duration: meta.duration || 0,
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Load YAML test metadata, grouped by screen
// ---------------------------------------------------------------------------

function loadTestMetadata(testsDir) {
  const metadata = {};
  if (!testsDir || !fs.existsSync(testsDir)) return metadata;

  function loadYAMLsFromDir(dir, screenName) {
    const yamlFiles = fs.readdirSync(dir)
      .filter((f) => /\.yaml$/i.test(f))
      .sort();

    const scenarios = [];
    for (const yamlFile of yamlFiles) {
      try {
        const content = fs.readFileSync(path.join(dir, yamlFile), "utf-8");
        const parsed = parseYAMLFile(content);
        parsed.fileName = yamlFile.replace(/\.yaml$/i, "");
        if (!parsed.name) {
          parsed.name = yamlFile
            .replace(/\.yaml$/i, "")
            .replace(/^\d+-/, "")
            .replace(/-/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
        }
        scenarios.push(parsed);
      } catch { /* skip */ }
    }
    return scenarios;
  }

  for (const entry of fs.readdirSync(testsDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const screenName = entry.name.toLowerCase();
      const scenarios = loadYAMLsFromDir(path.join(testsDir, entry.name), screenName);
      if (scenarios.length > 0) {
        metadata[screenName] = scenarios;
      }
    }
  }

  // Also load top-level YAML files (not in subdirectories) under "default" screen
  const topLevel = loadYAMLsFromDir(testsDir, "default");
  if (topLevel.length > 0) {
    if (!metadata["default"]) metadata["default"] = [];
    metadata["default"].push(...topLevel);
  }

  return metadata;
}

// ---------------------------------------------------------------------------
// Derive screen name from XML filename
// e.g. "home-01-date-format.xml" → screen "home", test "01-date-format"
// e.g. "login-01-screen-renders.xml" → screen "login", test "01-screen-renders"
// ---------------------------------------------------------------------------

function parseXMLFileName(xmlFile) {
  const base = path.basename(xmlFile, ".xml").toLowerCase();
  // Pattern: {screen}-{NN}-{test-name} or {screen}-{test-name}
  const match = base.match(/^([a-z]+)-(.+)$/);
  if (match) {
    return { screen: match[1], testKey: match[2] };
  }
  // Filename doesn't start with letters (e.g. "26-theming-sweep") —
  // screen unknown, will be resolved by searching all screens during matching
  return { screen: null, testKey: base };
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(0);
  return `${mins}m ${secs}s`;
}

function formatScreenName(name) {
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") + " Screen";
}

function statusIcon(status) {
  if (status === "passed") return '<span class="icon-pass">&#10003;</span>';
  if (status === "skipped") return '<span class="icon-skip">&#9679;</span>';
  return '<span class="icon-fail">&#10007;</span>';
}

function stepTypeLabel(type) {
  const labels = {
    assertVisible: "Assert Visible",
    assertNotVisible: "Assert Not Visible",
    tap: "Tap",
    input: "Input",
    erase: "Erase",
    screenshot: "Screenshot",
    launch: "Launch App",
    runFlow: "Run Flow",
    waitAnimation: "Wait Animation",
    waitUntil: "Wait Until",
    swipe: "Swipe",
    pressKey: "Press Key",
    note: "Note",
  };
  return labels[type] || type;
}

function stepTypeClass(type) {
  if (type === "screenshot") return "step-type step-type-screenshot";
  if (type === "assertVisible" || type === "assertNotVisible") return "step-type step-type-assert";
  if (type === "tap" || type === "input") return "step-type step-type-action";
  return "step-type";
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

function getCSS() {
  return `
:root {
  --bg: #fafafa;
  --surface: #ffffff;
  --surface-alt: #f5f5f5;
  --border: #e5e7eb;
  --border-light: #f0f0f0;
  --text: #1f2937;
  --text-muted: #6b7280;
  --text-light: #9ca3af;
  --pass: #22c55e;
  --pass-bg: #f0fdf4;
  --fail: #ef4444;
  --fail-bg: #fef2f2;
  --skip: #f59e0b;
  --skip-bg: #fffbeb;
  --accent: #3b82f6;
  --header-bg: #ffffff;
  --shadow: 0 1px 3px rgba(0,0,0,0.08);
  --radius: 6px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  font-size: 14px;
}

/* Header */
.report-header {
  background: var(--header-bg);
  border-bottom: 1px solid var(--border);
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.report-header .title-area { display: flex; align-items: center; gap: 12px; }
.report-header .logo { height: 28px; width: auto; }
.report-header h1 { font-size: 18px; font-weight: 600; color: var(--text); }
.report-header .company { font-size: 12px; color: var(--text-muted); font-weight: 400; }
.summary-bar { display: flex; align-items: center; gap: 16px; font-size: 13px; }
.summary-bar .stat { display: flex; align-items: center; gap: 4px; }
.summary-bar .stat-value { font-weight: 600; font-size: 15px; }
.badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;
}
.badge-pass { background: var(--pass-bg); color: var(--pass); }
.badge-fail { background: var(--fail-bg); color: var(--fail); }
.badge-skip { background: var(--skip-bg); color: var(--skip); }
.meta-bar {
  background: var(--surface-alt); border-bottom: 1px solid var(--border-light);
  padding: 6px 24px; font-size: 12px; color: var(--text-muted);
  display: flex; gap: 20px; flex-wrap: wrap;
}

/* Content */
.content { max-width: 1200px; margin: 0 auto; padding: 20px 24px; }

/* Traceability matrix */
.trace-section { margin-bottom: 20px; }
.trace-heading {
  font-size: 13px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 8px;
  padding-bottom: 4px; border-bottom: 1px solid var(--border);
}
.trace-table {
  width: 100%; border-collapse: collapse; font-size: 13px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
}
.trace-table th {
  text-align: left; padding: 8px 12px; background: var(--surface-alt);
  color: var(--text-muted); font-weight: 600; font-size: 12px;
  border-bottom: 1px solid var(--border);
}
.trace-table td { padding: 8px 12px; border-bottom: 1px solid var(--border-light); }
.trace-table tr:hover td { background: var(--surface-alt); }
.trace-table a { color: var(--accent); text-decoration: none; }
.trace-table a:hover { text-decoration: underline; }

/* Screen sections */
.screen-section {
  margin-bottom: 12px; border: 1px solid var(--border);
  border-radius: var(--radius); background: var(--surface);
  box-shadow: var(--shadow);
}
.screen-section > summary {
  padding: 12px 16px; cursor: pointer; display: flex;
  align-items: center; gap: 8px; font-size: 15px; font-weight: 500;
  user-select: none; list-style: none;
}
.screen-section > summary::-webkit-details-marker { display: none; }
.screen-section > summary::before {
  content: '\\25B6'; font-size: 10px; color: var(--text-muted);
  transition: transform 0.15s;
}
.screen-section[open] > summary::before { transform: rotate(90deg); }
.screen-section > summary:hover { background: var(--surface-alt); }
.screen-count { font-size: 12px; color: var(--text-muted); font-weight: 400; margin-left: auto; }

/* Scenario cards */
.scenario-list { padding: 0 16px 12px; }
.scenario {
  border: 1px solid var(--border-light); border-radius: var(--radius);
  margin-bottom: 8px; overflow: hidden;
}
.scenario > summary {
  padding: 10px 12px; cursor: pointer; display: flex;
  align-items: center; gap: 8px; font-size: 13px;
  user-select: none; list-style: none; flex-wrap: wrap;
}
.scenario > summary::-webkit-details-marker { display: none; }
.scenario > summary::before {
  content: '\\25B6'; font-size: 9px; color: var(--text-light);
  transition: transform 0.15s;
}
.scenario[open] > summary::before { transform: rotate(90deg); }
.scenario > summary:hover { background: var(--surface-alt); }
.scenario-name { font-weight: 500; }
.scenario-ac {
  font-size: 11px; font-weight: 600; padding: 1px 6px;
  border-radius: 3px; background: #e0e7ff; color: #3730a3;
}
.scenario-duration { color: var(--text-muted); font-size: 12px; margin-left: auto; }
.scenario-body {
  padding: 16px; border-top: 1px solid var(--border-light);
  background: var(--surface-alt);
}

/* Scenario metadata */
.scenario-meta {
  display: grid; grid-template-columns: auto 1fr; gap: 4px 12px;
  margin-bottom: 12px; padding: 10px 12px;
  background: var(--surface); border: 1px solid var(--border-light);
  border-radius: var(--radius);
}
.scenario-meta dt {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted);
  padding-top: 1px;
}
.scenario-meta dd { font-size: 13px; color: var(--text); }

/* Error display */
.error-block {
  background: var(--fail-bg); border: 1px solid #fecaca;
  border-radius: var(--radius); padding: 10px 12px; margin: 10px 0;
  font-size: 12px; color: var(--fail); white-space: pre-wrap;
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace; overflow-x: auto;
}

/* Steps table */
.steps-heading {
  font-size: 12px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 6px;
}
.steps-table {
  width: 100%; border-collapse: collapse; font-size: 12px;
  background: var(--surface); border: 1px solid var(--border-light);
  border-radius: var(--radius); overflow: hidden;
}
.steps-table th {
  text-align: left; padding: 6px 10px; background: var(--border-light);
  color: var(--text-muted); font-weight: 600; font-size: 11px;
  text-transform: uppercase; letter-spacing: 0.3px;
}
.steps-table td {
  padding: 6px 10px; border-bottom: 1px solid var(--border-light);
  vertical-align: top;
}
.steps-table tr:nth-child(even) td { background: rgba(0,0,0,0.015); }
.step-num { color: var(--text-light); font-size: 11px; text-align: center; width: 30px; }
.step-type {
  font-family: 'SF Mono', 'Consolas', monospace; font-size: 11px;
  padding: 1px 6px; border-radius: 3px;
  background: var(--surface-alt); border: 1px solid var(--border);
  white-space: nowrap;
}
.step-type-screenshot { background: #fef3c7; border-color: #fbbf24; color: #92400e; }
.step-type-assert { background: #dbeafe; border-color: #93c5fd; color: #1e40af; }
.step-type-action { background: #e0e7ff; border-color: #a5b4fc; color: #3730a3; }
.step-detail { color: var(--text-muted); max-width: 400px; word-break: break-word; }
.step-comment { font-size: 11px; color: var(--text-light); font-style: italic; }
.step-status-pass { color: var(--pass); }
.step-status-fail { color: var(--fail); }
.step-status-unknown { color: var(--text-light); }

/* Inline screenshot in steps */
.step-screenshot {
  margin: 6px 0 2px; display: inline-block;
}
.step-screenshot img {
  width: 180px; border: 1px solid var(--border);
  border-radius: var(--radius); cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.step-screenshot img:hover { transform: scale(1.03); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }

/* Status indicators */
.icon-pass, .icon-fail, .icon-skip { font-size: 14px; line-height: 1; }
.icon-pass { color: var(--pass); }
.icon-fail { color: var(--fail); }
.icon-skip { color: var(--skip); }

/* Bug regression section */
.section-heading {
  font-size: 13px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted); margin: 24px 0 8px;
  padding-bottom: 4px; border-bottom: 1px solid var(--border);
}
.bug-table {
  width: 100%; border-collapse: collapse; font-size: 13px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
}
.bug-table th {
  text-align: left; padding: 8px 12px; background: var(--surface-alt);
  color: var(--text-muted); font-weight: 600; font-size: 12px;
  border-bottom: 1px solid var(--border);
}
.bug-table td { padding: 8px 12px; border-bottom: 1px solid var(--border-light); }

/* Lightbox */
.lightbox-overlay {
  display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.85); z-index: 1000;
  justify-content: center; align-items: center; cursor: pointer;
}
.lightbox-overlay.active { display: flex; }
.lightbox-overlay img {
  max-width: 90vw; max-height: 90vh;
  border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

/* Mode label */
.mode-label {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 1px; color: var(--text-light); margin-bottom: 12px;
}

/* Scenario screen badge (shown in AC mode) */
.scenario-screen {
  font-size: 10px; font-weight: 500; padding: 1px 5px;
  border-radius: 3px; background: var(--surface-alt); border: 1px solid var(--border);
  color: var(--text-muted);
}

/* See-above reference for multi-AC tests */
.scenario-ref {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; font-size: 13px;
  border: 1px dashed var(--border); border-radius: var(--radius);
  margin-bottom: 6px; background: var(--surface);
}
.scenario-ref .scenario-name { font-weight: 500; }
.see-above {
  font-size: 12px; color: var(--accent); text-decoration: none;
  margin-left: auto; font-style: italic;
}
.see-above:hover { text-decoration: underline; }

/* Empty state */
.empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty-state h2 { font-size: 18px; margin-bottom: 8px; color: var(--text); }
.empty-state code {
  display: inline-block; margin-top: 12px; padding: 8px 16px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); font-size: 12px;
}
`;
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

function renderScenarioCard(scenario, screenshots, commandFiles, anchorId) {
  // AC badges (supports multiple)
  const acBadges = (scenario.acs || [])
    .map((ac) => `<span class="scenario-ac">${escapeHTML(ac)}</span>`)
    .join(" ");

  // Screen badge (shown in AC mode so you know which screen)
  const screenBadge = scenario.screen
    ? `<span class="scenario-screen">${escapeHTML(formatScreenName(scenario.screen))}</span>` : "";

  // Metadata
  let metaHTML = "";
  if (scenario.purpose || scenario.expected || scenario.preconditions) {
    metaHTML = '<dl class="scenario-meta">';
    if (scenario.purpose) metaHTML += `<dt>Purpose</dt><dd>${escapeHTML(scenario.purpose)}</dd>`;
    if (scenario.expected) metaHTML += `<dt>Expected</dt><dd>${escapeHTML(scenario.expected)}</dd>`;
    if (scenario.preconditions) metaHTML += `<dt>Preconditions</dt><dd>${escapeHTML(scenario.preconditions)}</dd>`;
    metaHTML += "</dl>";
  }

  // Error block
  const errorHTML = (scenario.status === "failed" || scenario.status === "error") && scenario.errorMessage
    ? `<div class="error-block">${escapeHTML(scenario.errorMessage)}</div>` : "";

  // Build steps — prefer Maestro commands JSON, fall back to YAML-parsed steps
  const testKey = (scenario.testFileName || "").toLowerCase();
  const cmdFile = commandFiles[testKey] || "";
  let steps = [];
  if (cmdFile && fs.existsSync(cmdFile)) {
    try {
      steps = parseCommandsJSON(fs.readFileSync(cmdFile, "utf-8"));
    } catch { /* skip */ }
  }

  if (steps.length === 0 && scenario.yamlSteps && scenario.yamlSteps.length > 0) {
    steps = scenario.yamlSteps.map((s) => ({
      type: s.type,
      detail: s.detail || "",
      screenshotName: s.type === "screenshot" ? s.detail : "",
      status: "COMPLETED",
      duration: 0,
      comment: s.comment || "",
    }));
  }

  // Build steps table
  let stepsHTML = "";
  if (steps.length > 0) {
    let stepNum = 0;
    const stepsRows = steps.map((step) => {
      stepNum++;
      const statusClass = step.status === "COMPLETED" ? "step-status-pass"
        : step.status === "UNKNOWN" ? "step-status-unknown" : "step-status-fail";
      const statusLabel = step.status === "COMPLETED" ? "&#10003;"
        : step.status === "UNKNOWN" ? "&#8212;" : "&#10007;";
      const durationStr = step.duration > 0 ? `${(step.duration / 1000).toFixed(1)}s` : "";

      let inlineScreenshot = "";
      const ssKey = (step.screenshotName || "").toLowerCase().replace(/\.(png|jpg|jpeg)$/i, "");
      if (step.type === "screenshot" && ssKey) {
        const ssFiles = screenshots[ssKey] || [];
        if (ssFiles.length > 0) {
          const dataURI = toBase64DataURI(ssFiles[0]);
          if (dataURI) {
            inlineScreenshot = `<div class="step-screenshot"><img src="${dataURI}" alt="${escapeHTML(ssKey)}" onclick="openLightbox(this)" /></div>`;
          }
        }
      }

      const commentHTML = step.comment
        ? `<div class="step-comment">${escapeHTML(step.comment)}</div>` : "";

      return `<tr>
        <td class="step-num">${stepNum}</td>
        <td><span class="${statusClass}">${statusLabel}</span></td>
        <td><span class="${stepTypeClass(step.type)}">${escapeHTML(stepTypeLabel(step.type))}</span></td>
        <td class="step-detail">
          ${escapeHTML(step.detail)}
          ${commentHTML}
          ${inlineScreenshot}
        </td>
        <td>${durationStr}</td>
      </tr>`;
    }).join("\n");

    stepsHTML = `
      <div class="steps-heading">Execution Steps (${steps.length})</div>
      <table class="steps-table">
        <thead><tr><th>#</th><th></th><th>Action</th><th>Detail</th><th>Time</th></tr></thead>
        <tbody>${stepsRows}</tbody>
      </table>`;
  }

  return `
    <details class="scenario" id="${anchorId}">
      <summary>
        ${statusIcon(scenario.status)}
        <span class="scenario-name">${escapeHTML(scenario.name)}</span>
        ${acBadges}
        ${screenBadge}
        <span class="scenario-duration">${scenario.time ? formatDuration(scenario.time) : ""}</span>
      </summary>
      <div class="scenario-body">
        ${metaHTML}
        ${errorHTML}
        ${stepsHTML}
      </div>
    </details>`;
}

function generateHTML(screenData, screenshots, commandFiles, opts) {
  const isACMode = opts.mode === "ac";

  // Flatten all scenarios
  const allScenarios = [];
  for (const [screenName, scenarios] of Object.entries(screenData)) {
    for (const s of scenarios) allScenarios.push(s);
  }

  // In AC mode, filter to only tests with AC tags
  const activeScenarios = isACMode
    ? allScenarios.filter((s) => s.acs && s.acs.length > 0)
    : allScenarios;

  // Compute totals
  let totalTests = 0, totalPass = 0, totalFail = 0, totalSkip = 0, totalTime = 0;
  const devices = new Set();
  // Use a Set to avoid double-counting tests that map to multiple ACs
  const countedTests = new Set();
  for (const s of activeScenarios) {
    const key = `${s.screen}-${s.testFileName}`;
    if (!countedTests.has(key)) {
      countedTests.add(key);
      totalTests++;
      totalTime += s.time;
      if (s.device) devices.add(s.device);
      if (s.status === "passed") totalPass++;
      else if (s.status === "failed" || s.status === "error") totalFail++;
      else totalSkip++;
    }
  }

  // Logo
  let logoHTML = "";
  if (opts.logo && fs.existsSync(opts.logo)) {
    logoHTML = `<img class="logo" src="${toBase64DataURI(opts.logo)}" alt="Logo" />`;
  }
  const companyHTML = opts.companyName
    ? `<span class="company">${escapeHTML(opts.companyName)}</span>` : "";

  // Build main content based on mode
  let mainContent = "";
  const modeLabel = isACMode ? "Acceptance Criteria" : "Regression — By Screen";

  if (isACMode) {
    // Group by AC — each AC is a section
    const acMap = {}; // { acId: [scenario] }
    const renderedAnchors = new Set(); // track which tests already rendered full card

    for (const s of activeScenarios) {
      for (const ac of s.acs) {
        if (!acMap[ac]) acMap[ac] = [];
        acMap[ac].push(s);
      }
    }

    // Sort ACs
    const sortedACs = Object.keys(acMap).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );

    mainContent = sortedACs.map((acId) => {
      const scenarios = acMap[acId];
      const pass = scenarios.filter((s) => s.status === "passed").length;
      const fail = scenarios.filter((s) => s.status === "failed" || s.status === "error").length;
      const sectionIcon = fail > 0
        ? '<span class="icon-fail">&#10007;</span>'
        : '<span class="icon-pass">&#10003;</span>';

      const cards = scenarios.map((scenario) => {
        const anchorId = `scenario-${scenario.screen}-${scenario.testFileName || scenario.name}`.replace(/[^a-z0-9-]/gi, "-");

        // If this test was already rendered under a previous AC, show a "see above" link
        if (renderedAnchors.has(anchorId)) {
          return `
            <div class="scenario-ref">
              ${statusIcon(scenario.status)}
              <span class="scenario-name">${escapeHTML(scenario.name)}</span>
              <a href="#${anchorId}" class="see-above">See test above under ${escapeHTML(scenario.acs.find((a) => a !== acId) || scenario.acs[0])}</a>
            </div>`;
        }

        renderedAnchors.add(anchorId);
        return renderScenarioCard(scenario, screenshots, commandFiles, anchorId);
      }).join("\n");

      return `
        <details class="screen-section" open>
          <summary>
            ${sectionIcon}
            <strong>${escapeHTML(acId)}</strong>
            <span class="screen-count">${pass}/${scenarios.length} passed</span>
          </summary>
          <div class="scenario-list">
            ${cards}
          </div>
        </details>`;
    }).join("\n");

  } else {
    // Regression mode — group by screen
    mainContent = Object.entries(screenData).map(([screenName, scenarios]) => {
      const pass = scenarios.filter((s) => s.status === "passed").length;
      const fail = scenarios.filter((s) => s.status === "failed" || s.status === "error").length;
      const screenIcon = fail > 0
        ? '<span class="icon-fail">&#10007;</span>'
        : '<span class="icon-pass">&#10003;</span>';

      const cards = scenarios.map((scenario) => {
        const anchorId = `scenario-${screenName}-${scenario.testFileName || scenario.name}`.replace(/[^a-z0-9-]/gi, "-");
        return renderScenarioCard(scenario, screenshots, commandFiles, anchorId);
      }).join("\n");

      return `
        <details class="screen-section" open>
          <summary>
            ${screenIcon}
            <strong>${escapeHTML(formatScreenName(screenName))}</strong>
            <span class="screen-count">${pass}/${scenarios.length} passed</span>
          </summary>
          <div class="scenario-list">
            ${cards}
          </div>
        </details>`;
    }).join("\n");
  }

  // Bug regressions
  let bugSection = "";
  const bugTests = activeScenarios.filter(
    (s) => /BUG-\d+/i.test(s.name) || s.acs.some((ac) => /BUG-\d+/i.test(ac))
  );
  if (bugTests.length > 0) {
    const bugRows = bugTests.map((bt) => {
      const bugMatch = bt.name.match(/BUG-\d+/i) || bt.acs.join(",").match(/BUG-\d+/i);
      const bugId = bugMatch ? bugMatch[0] : "unknown";
      return `<tr>
        <td><strong>${escapeHTML(bugId)}</strong></td>
        <td>${escapeHTML(bt.name)}</td>
        <td>${escapeHTML(bt.screen || "")}</td>
        <td>${statusIcon(bt.status)} ${bt.status.toUpperCase()}</td>
      </tr>`;
    }).join("\n");

    bugSection = `
      <div class="section-heading">Bug Regressions</div>
      <table class="bug-table">
        <thead><tr><th>Bug ID</th><th>Test</th><th>Screen</th><th>Status</th></tr></thead>
        <tbody>${bugRows}</tbody>
      </table>`;
  }

  const deviceStr = devices.size > 0 ? Array.from(devices).join(", ") : "default";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(opts.title)}</title>
<style>${getCSS()}</style>
</head>
<body>

<div class="report-header">
  <div class="title-area">
    ${logoHTML}
    <div>
      <h1>${escapeHTML(opts.title)}</h1>
      ${companyHTML}
    </div>
  </div>
  <div class="summary-bar">
    <div class="stat"><span class="stat-value">${totalTests}</span> tests</div>
    <span class="badge badge-pass">&#10003; ${totalPass} passed</span>
    ${totalFail > 0 ? `<span class="badge badge-fail">&#10007; ${totalFail} failed</span>` : ""}
    ${totalSkip > 0 ? `<span class="badge badge-skip">&#9679; ${totalSkip} skipped</span>` : ""}
    <div class="stat">${formatDuration(totalTime)}</div>
  </div>
</div>

<div class="meta-bar">
  <span>Generated: ${new Date().toLocaleString()}</span>
  <span>Device: ${escapeHTML(deviceStr)}</span>
  <span>Tests: ${totalTests}</span>
</div>

<div class="content">
  <div class="mode-label">${escapeHTML(modeLabel)}</div>
  ${mainContent}
  ${bugSection}
</div>

<div class="lightbox-overlay" id="lightbox" onclick="closeLightbox()">
  <img id="lightbox-img" src="" alt="Screenshot" />
</div>

<script>
function openLightbox(el) {
  var lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = el.src;
  lb.classList.add('active');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
}
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeLightbox();
});
</script>

</body>
</html>`;
}

function generateEmptyHTML(opts) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(opts.title)}</title>
<style>${getCSS()}</style>
</head>
<body>
<div class="report-header">
  <div class="title-area"><h1>${escapeHTML(opts.title)}</h1></div>
  <div class="summary-bar"><span class="badge badge-skip">No results</span></div>
</div>
<div class="content">
  <div class="empty-state">
    <h2>No test results found</h2>
    <p>Run E2E tests first, then re-generate this report.</p>
    <code>maestro test __tests__/e2e/screens/ --format junit --output test-reports/e2e-results/</code>
  </div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main — assembles all data into unified screen → scenario structure
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs();
  const inputDir = path.resolve(opts.input);
  const outputFile = path.resolve(opts.output);
  const testsDir = path.resolve(opts.tests);

  // Find result files (XML, JSON, TRX)
  const xmlFiles = [];
  const jsonFiles = [];
  const trxFiles = [];
  if (fs.existsSync(inputDir)) {
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.xml$/i.test(entry.name)) xmlFiles.push(full);
        else if (/\.json$/i.test(entry.name) && !entry.name.startsWith('commands-')) jsonFiles.push(full);
        else if (/\.trx$/i.test(entry.name)) trxFiles.push(full);
      }
    };
    walk(inputDir);
  }

  // Also check for single result files at common paths
  const singleResultCandidates = [
    path.join(process.cwd(), 'test-results.json'),
    path.join(process.cwd(), 'tests', 'report', 'test-results.json'),
  ];
  for (const candidate of singleResultCandidates) {
    if (fs.existsSync(candidate) && !jsonFiles.includes(candidate)) {
      const content = fs.readFileSync(candidate, 'utf-8').trim();
      if (content.startsWith('{') && content.includes('"suites"')) {
        jsonFiles.push(candidate);
      }
    }
  }

  const hasResults = xmlFiles.length > 0 || jsonFiles.length > 0 || trxFiles.length > 0;

  if (!hasResults) {
    console.log("No result files found in", inputDir);
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, generateEmptyHTML(opts));
    console.log("Empty report written to", outputFile);
    return;
  }

  // Load YAML metadata early so XML filename resolution can use it
  const testMeta = loadTestMetadata(testsDir);

  // Parse result files and group by screen
  const xmlByScreen = {}; // { screen: [{ testKey, tc, device }] }

  // Parse JUnit XML files (Maestro, pytest, Java)
  for (const xmlFile of xmlFiles) {
    const xml = fs.readFileSync(xmlFile, "utf-8");
    const format = detectResultFormat(xml, xmlFile, opts.format);
    if (format === 'trx') {
      // TRX file with .xml extension
      const trxTests = parseTRXContent(xml);
      for (const tc of trxTests) {
        const screen = 'default';
        if (!xmlByScreen[screen]) xmlByScreen[screen] = [];
        xmlByScreen[screen].push({ testKey: tc.name, name: tc.name, classname: '', time: tc.time, status: tc.status, errorMessage: tc.error, device: '' });
      }
      continue;
    }
    const suites = parseJUnitXML(xml);
    let { screen, testKey } = parseXMLFileName(xmlFile);

    // If screen couldn't be parsed from filename (e.g. digit-prefixed),
    // search all screens in testMeta for a matching YAML fileName
    if (screen === null) {
      for (const [screenName, scenarios] of Object.entries(testMeta)) {
        if (scenarios.find((s) => s.fileName === testKey)) {
          screen = screenName;
          break;
        }
      }
    }
    // If still unresolved, use the full base as screen (orphan bucket)
    if (screen === null) screen = testKey;

    if (!xmlByScreen[screen]) xmlByScreen[screen] = [];

    for (const suite of suites) {
      for (const tc of suite.testCases) {
        xmlByScreen[screen].push({
          testKey,
          name: tc.name,
          classname: tc.classname,
          time: tc.time,
          status: tc.status,
          errorMessage: tc.errorMessage,
          device: suite.device,
        });
      }
    }
  }

  // Parse Playwright JSON files
  for (const jsonFile of jsonFiles) {
    const content = fs.readFileSync(jsonFile, 'utf-8');
    const format = detectResultFormat(content, jsonFile, opts.format);
    if (format === 'playwright-json') {
      const pwTests = parsePlaywrightJSON(content);
      for (const tc of pwTests) {
        const screen = tc.file ? path.basename(tc.file, path.extname(tc.file)).replace(/\.spec|\.test/g, '') : 'default';
        if (!xmlByScreen[screen]) xmlByScreen[screen] = [];
        xmlByScreen[screen].push({ testKey: tc.name, name: tc.name, classname: tc.file, time: tc.time, status: tc.status, errorMessage: tc.error, device: '' });
      }
    }
  }

  // Parse TRX files (.NET)
  for (const trxFile of trxFiles) {
    const content = fs.readFileSync(trxFile, 'utf-8');
    const trxTests = parseTRXContent(content);
    for (const tc of trxTests) {
      const screen = 'default';
      if (!xmlByScreen[screen]) xmlByScreen[screen] = [];
      xmlByScreen[screen].push({ testKey: tc.name, name: tc.name, classname: '', time: tc.time, status: tc.status, errorMessage: tc.error, device: '' });
    }
  }

  // Find screenshots from multiple locations
  const screenshotDirs = [];
  if (opts.screenshots) {
    screenshotDirs.push(path.resolve(opts.screenshots));
  }
  screenshotDirs.push(path.join(inputDir, "screenshots"));
  screenshotDirs.push(path.join(path.dirname(inputDir), "screenshots"));
  screenshotDirs.push(inputDir); // PNGs directly in results dir
  const allScreenshots = findScreenshots(...screenshotDirs);

  // Find Maestro commands
  const commandFiles = findMaestroCommands(inputDir);

  // Assemble unified screen data: merge YAML metadata with JUnit results
  const screenData = {}; // { screen: [scenario] }

  // First, populate from YAML metadata (primary source)
  for (const [screenName, scenarios] of Object.entries(testMeta)) {
    screenData[screenName] = scenarios.map((scenario) => {
      // Find matching JUnit result
      const xmlTests = xmlByScreen[screenName] || [];
      const matched = xmlTests.find(
        (t) => t.testKey === scenario.fileName || t.name === scenario.fileName
      );

      return {
        name: scenario.name,
        acs: scenario.acs || [],
        screen: screenName,
        purpose: scenario.purpose,
        expected: scenario.expected,
        preconditions: scenario.preconditions,
        testFileName: scenario.fileName,
        yamlSteps: scenario.steps,
        yamlScreenshots: scenario.screenshots,
        status: matched ? matched.status : "skipped",
        time: matched ? matched.time : 0,
        errorMessage: matched ? matched.errorMessage : "",
        device: matched ? matched.device : "",
      };
    });
  }

  // Second, add any XML results that don't have YAML metadata (orphans)
  for (const [screenName, xmlTests] of Object.entries(xmlByScreen)) {
    if (!screenData[screenName]) screenData[screenName] = [];

    for (const xt of xmlTests) {
      const alreadyMatched = screenData[screenName].some(
        (s) => s.testFileName === xt.testKey
      );
      if (!alreadyMatched) {
        screenData[screenName].push({
          name: xt.testKey.replace(/^\d+-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          acs: [],
          screen: screenName,
          purpose: "",
          expected: "",
          preconditions: "",
          testFileName: xt.testKey,
          yamlSteps: [],
          yamlScreenshots: [],
          status: xt.status,
          time: xt.time,
          errorMessage: xt.errorMessage,
          device: xt.device,
        });
      }
    }
  }

  // Sort screens alphabetically, scenarios by filename
  const sortedScreenData = {};
  for (const key of Object.keys(screenData).sort()) {
    sortedScreenData[key] = screenData[key].sort((a, b) =>
      (a.testFileName || "").localeCompare(b.testFileName || "", undefined, { numeric: true })
    );
  }

  // Load adversarial review findings
  const reviewerPath = opts.reviewer
    ? path.resolve(opts.reviewer)
    : path.join(process.cwd(), 'docs', 'adversarial-review.md');
  const reviewerFindings = parseAdversarialReview(
    opts.reviewer ? reviewerPath : (fs.existsSync(reviewerPath) ? reviewerPath : null)
  );

  // Generate HTML
  let html = generateHTML(sortedScreenData, allScreenshots, commandFiles, opts);

  // Inject adversarial review findings before closing </body>
  if (reviewerFindings) {
    const reviewHtml = generateAdversarialReviewHtml(reviewerFindings);
    html = html.replace('</div>\n</body>', reviewHtml + '</div>\n</body>');
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, html);

  // Summary
  console.log(`Report generated: ${outputFile}`);
  console.log(`  ${totalCount(sortedScreenData)} tests across ${Object.keys(sortedScreenData).length} screens`);
  console.log(`  Screenshots found: ${Object.keys(allScreenshots).length}`);
  console.log(`  Command files found: ${Object.keys(commandFiles).length}`);
  if (reviewerFindings) {
    console.log(`  Adversarial Review: ${reviewerFindings.summary.pass} PASS, ${reviewerFindings.summary.fail} FAIL, ${reviewerFindings.summary.warn} WARN`);
  }

  const failCount = Object.values(sortedScreenData).flat().filter((s) => s.status === "failed" || s.status === "error").length;
  if (failCount > 0) {
    console.log(`  FAILURES: ${failCount}`);
    process.exit(1);
  }
}

function totalCount(screenData) {
  return Object.values(screenData).reduce((sum, arr) => sum + arr.length, 0);
}

main();
