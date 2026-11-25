// ============================================================
//  AI Terminal Debugger — MCP Server Test Suite
//  Tests log-reader.js functions and server.js security layer.
//  Run: node src/test-server.js
// ============================================================

const path = require("path");
const fs   = require("fs");

// ── Helpers ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(description, condition) {
    if (condition) {
        console.log(`  ✅ PASS  ${description}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL  ${description}`);
        failed++;
    }
}

function assertThrows(description, fn) {
    try {
        fn();
        console.error(`  ❌ FAIL  ${description}  (expected an error but none was thrown)`);
        failed++;
    } catch (err) {
        console.log(`  ✅ PASS  ${description}  → "${err.message}"`);
        passed++;
    }
}

function note(text) {
    console.log(`  ⚠️  NOTE  ${text}`);
}

function section(title) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${"─".repeat(60)}`);
}

// ── Re-use validateProjectName from server.js ─────────────────
// Duplicated here so we can test it in isolation without
// triggering server.js's main() startup on require().
const SAFE_PROJECT_NAME = /^[a-zA-Z0-9_.\-]+$/;

function validateProjectName(name) {
    if (typeof name !== "string" || name.trim() === "") {
        throw new Error("projectName must be a non-empty string.");
    }
    const trimmed = name.trim();
    if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
        throw new Error(`Invalid projectName: "${trimmed}". Path traversal is not allowed.`);
    }
    if (!SAFE_PROJECT_NAME.test(trimmed)) {
        throw new Error(`Invalid projectName: "${trimmed}". Only letters, digits, hyphens, underscores, and dots are allowed.`);
    }
    return trimmed;
}

// ── Import log-reader functions ────────────────────────────────
const { getTerminalLogs, getLatestLogs, getErrors } = require("./log-reader.js");

// ── Fixtures ───────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, "..", "logs");
const FIXTURE_PROJECT = "__test_fixture__";
const FIXTURE_LOG = path.join(LOG_DIR, `${FIXTURE_PROJECT}.log`);

const FIXTURE_CONTENT = [
    "Starting server on port 3000",
    "Error: Cannot read property 'id'",
    "Failed to connect to Redis",
    "Exception in thread main",
    "Server running normally",
    "Fatal: out of memory",
    "GET /api/health 200 OK",
    "ENOENT: no such file or directory",
    "Database connection established",
    "EADDRINUSE: port 3000 already in use",
].join("\n");

function setupFixture() {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(FIXTURE_LOG, FIXTURE_CONTENT, "utf8");
}

function teardownFixture() {
    if (fs.existsSync(FIXTURE_LOG)) fs.unlinkSync(FIXTURE_LOG);
}

// ─────────────────────────────────────────────────────────────

section("Suite 1: validateProjectName — Valid inputs");
assert("accepts simple name",
    validateProjectName("my-app") === "my-app");
assert("accepts name with underscores",
    validateProjectName("my_app") === "my_app");
assert("accepts name with dots",
    validateProjectName("my.app") === "my.app");
assert("accepts alphanumeric",
    validateProjectName("App123") === "App123");
assert("trims surrounding whitespace",
    validateProjectName("  my-app  ") === "my-app");
assert("accepts hyphens",
    validateProjectName("remix-hype-hut") === "remix-hype-hut");

section("Suite 2: validateProjectName — Security / invalid inputs");
assertThrows("rejects empty string",        () => validateProjectName(""));
assertThrows("rejects whitespace-only",     () => validateProjectName("   "));
assertThrows("rejects null",                () => validateProjectName(null));
assertThrows("rejects undefined",           () => validateProjectName(undefined));
assertThrows("rejects path traversal ..",   () => validateProjectName("../etc/passwd"));
assertThrows("rejects forward slash",       () => validateProjectName("logs/secret"));
assertThrows("rejects backslash",           () => validateProjectName("logs\\secret"));
assertThrows("rejects special chars $",     () => validateProjectName("app$name"));
assertThrows("rejects semicolons",          () => validateProjectName("app;rm -rf /"));
assertThrows("rejects spaces",              () => validateProjectName("my app"));

section("Suite 3: getTerminalLogs — Log file reading");
setupFixture();
assert("returns log content for existing project",
    getTerminalLogs(FIXTURE_PROJECT).includes("Starting server on port 3000"));
assert("returns all 10 lines",
    getTerminalLogs(FIXTURE_PROJECT).split("\n").length === 10);
assert("returns 'No logs found' for missing project",
    getTerminalLogs("nonexistent_project_xyz").startsWith("No logs found"));

section("Suite 4: getLatestLogs — Tail functionality");
assert("returns last 3 lines when numberOfLines=3",
    getLatestLogs(FIXTURE_PROJECT, 3).split("\n").length === 3);
assert("last line is 'EADDRINUSE: port 3000 already in use'",
    getLatestLogs(FIXTURE_PROJECT, 1).trim() === "EADDRINUSE: port 3000 already in use");
assert("returns all lines when numberOfLines exceeds total",
    getLatestLogs(FIXTURE_PROJECT, 1000).split("\n").length === 10);
assert("defaults to 50 lines (or all if fewer available)",
    getLatestLogs(FIXTURE_PROJECT).split("\n").length === 10);
assert("returns 'No logs found' for missing project",
    getLatestLogs("nonexistent_project_xyz").startsWith("No logs found"));

section("Suite 5: getErrors — Error pattern filtering (regex bug fixed: /i not /gi)");
const errors = getErrors(FIXTURE_PROJECT);
assert("detects 'Error:' line",
    errors.includes("Error: Cannot read property"));
assert("detects 'Failed' line",
    errors.includes("Failed to connect to Redis"));
assert("detects 'Exception' line",
    errors.includes("Exception in thread main"));
assert("detects 'Fatal' line",
    errors.includes("Fatal: out of memory"));
assert("detects 'ENOENT' line",
    errors.includes("ENOENT"));
assert("detects 'EADDRINUSE' line",
    errors.includes("EADDRINUSE"));
assert("does NOT include healthy lines",
    !errors.includes("GET /api/health 200 OK"));
assert("does NOT include startup line",
    !errors.includes("Starting server on port 3000"));
assert("returns 'No logs found' for missing project",
    getErrors("nonexistent_project_xyz").startsWith("No logs found"));

section("Suite 6: getErrors — No errors case");
const cleanLog = path.join(LOG_DIR, "__clean_fixture__.log");
fs.writeFileSync(cleanLog, "Server is running fine\nAll systems nominal\n", "utf8");
assert("returns 'No matching error lines found.' for clean log",
    getErrors("__clean_fixture__") === "No matching error lines found.");
fs.unlinkSync(cleanLog);

section("Suite 7: Real log files sanity check");
const realLogs = fs
    .readdirSync(LOG_DIR)
    .filter(f => f.endsWith(".log") && !f.startsWith("__"));
console.log(`  Found ${realLogs.length} real log file(s): ${realLogs.join(", ")}`);
for (const logFile of realLogs) {
    const proj = path.basename(logFile, ".log");
    const content = getTerminalLogs(proj);
    const size    = fs.statSync(path.join(LOG_DIR, logFile)).size;
    if (size === 0) {
        note(`${proj} is empty (0 bytes) — skipping content assertion`);
        assert(`reads real log: ${proj} (empty file returns string)`,
            typeof content === "string");
    } else {
        assert(`reads real log: ${proj}`,
            typeof content === "string" && content.length > 0);
    }
}

// ── Regression suite for the /gi → /i fix ────────────────────
section("Suite 8 (REGRESSION): getErrors — consecutive error lines");
note("Verifies the /gi → /i regex fix: all consecutive error lines must be detected.");

// All 7 patterns back-to-back with zero non-matching lines between them.
// Before the fix, every second matching line was silently dropped.
const REG_PROJECT = "__regression_fixture__";
const REG_LOG     = path.join(LOG_DIR, `${REG_PROJECT}.log`);
fs.writeFileSync(REG_LOG, [
    "Error: connection refused",
    "Failed: build step timed out",
    "exception: unhandled promise rejection",
    "failure: health check did not pass",
    "FATAL: disk quota exceeded",
    "ENOENT: /var/run/app.pid not found",
    "EADDRINUSE: :::8080",
    "Server started OK",         // ← only non-error line; must be excluded
].join("\n"), "utf8");

const regErrors = getErrors(REG_PROJECT);
const regLines  = regErrors.split("\n").filter(l => l.trim() !== "");

assert("regression: 7 consecutive error lines → 7 returned (not 4)",
    regLines.length === 7);
assert("regression: 'Error:' detected",
    regErrors.includes("Error: connection refused"));
assert("regression: 'Failed:' detected",
    regErrors.includes("Failed: build step timed out"));
assert("regression: 'exception:' detected",
    regErrors.includes("exception: unhandled promise rejection"));
assert("regression: 'failure:' detected",
    regErrors.includes("failure: health check did not pass"));
assert("regression: 'FATAL:' detected",
    regErrors.includes("FATAL: disk quota exceeded"));
assert("regression: 'ENOENT:' detected",
    regErrors.includes("ENOENT: /var/run/app.pid not found"));
assert("regression: 'EADDRINUSE:' detected",
    regErrors.includes("EADDRINUSE: :::8080"));
assert("regression: clean line excluded",
    !regErrors.includes("Server started OK"));

fs.unlinkSync(REG_LOG);

section("Suite 9: MCP SDK can be required");
assert("@modelcontextprotocol/sdk McpServer loads", (() => {
    try { require("@modelcontextprotocol/sdk/server/mcp.js"); return true; }
    catch { return false; }
})());
assert("@modelcontextprotocol/sdk StdioServerTransport loads", (() => {
    try { require("@modelcontextprotocol/sdk/server/stdio.js"); return true; }
    catch { return false; }
})());
assert("zod loads", (() => {
    try { require("zod"); return true; }
    catch { return false; }
})());
assert("server.js dependencies all resolve cleanly", (() => {
    try {
        require("@modelcontextprotocol/sdk/server/mcp.js");
        require("@modelcontextprotocol/sdk/server/stdio.js");
        require("zod");
        require("./log-reader.js");
        return true;
    } catch { return false; }
})());

// ── Teardown & Summary ────────────────────────────────────────
teardownFixture();

console.log(`\n${"═".repeat(60)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(60)}\n`);

if (failed > 0) {
    process.exit(1);
}
