
const fs = require("fs");
const path = require("path");

// Centralized logs directory
const LOG_DIRECTORY = path.join(__dirname, "..", "logs");

// 1. Read complete logs of a project
function getTerminalLogs(projectName) {
    const logFile = path.join(
        LOG_DIRECTORY,
        `${projectName}.log`
    );

    if (!fs.existsSync(logFile)) {
        return `No logs found for project: ${projectName}`;
    }

    return fs.readFileSync(logFile, "utf8");
}

// 2. Retrieve the latest lines
function getLatestLogs(projectName, numberOfLines = 50) {
    const logs = getTerminalLogs(projectName);

    if (logs.startsWith("No logs found")) {
        return logs;
    }

    return logs
        .split(/\r?\n/)
        .slice(-numberOfLines)
        .join("\n");
}

// 3. Search for errors
function getErrors(projectName) {
    const logs = getTerminalLogs(projectName);

    if (logs.startsWith("No logs found")) {
        return logs;
    }

    const errorPatterns =
        /error|exception|failed|failure|fatal|ENOENT|EADDRINUSE/i;

    return logs
        .split(/\r?\n/)
        .filter(line => errorPatterns.test(line))
        .join("\n") || "No matching error lines found.";
}

// 4. Export functions for MCP integration
module.exports = {
    getTerminalLogs,
    getLatestLogs,
    getErrors
};
