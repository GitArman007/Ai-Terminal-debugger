// ============================================================
//  AI Terminal Debugger — MCP Server
//  Exposes read-only log inspection tools to Claude Desktop.
//  Transport: stdio (stdout = JSON-RPC, stderr = diagnostics)
// ============================================================

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const path = require("path");

const { getTerminalLogs, getLatestLogs, getErrors } = require("./log-reader.js");

// ── Security ─────────────────────────────────────────────────
// Allowed characters: letters, digits, hyphens, underscores, dots.
// Blocks path traversal sequences like "..", "/", "\".
const SAFE_PROJECT_NAME = /^[a-zA-Z0-9_.\-]+$/;

/**
 * Validates a projectName supplied by the MCP client.
 * Returns the sanitised name on success, throws on violation.
 *
 * @param {unknown} name - raw input value
 * @returns {string}
 */
function validateProjectName(name) {
    if (typeof name !== "string" || name.trim() === "") {
        throw new Error("projectName must be a non-empty string.");
    }

    const trimmed = name.trim();

    // Block path traversal
    if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
        throw new Error(`Invalid projectName: "${trimmed}". Path traversal is not allowed.`);
    }

    // Allow only safe characters
    if (!SAFE_PROJECT_NAME.test(trimmed)) {
        throw new Error(
            `Invalid projectName: "${trimmed}". Only letters, digits, hyphens, underscores, and dots are allowed.`
        );
    }

    return trimmed;
}

// ── MCP server instance ───────────────────────────────────────
const server = new McpServer({
    name: "ai-terminal-debugger",
    version: "1.0.0",
});

// ── Tool 1: get_terminal_logs ─────────────────────────────────
server.tool(
    "get_terminal_logs",
    "Returns the complete terminal log for a given project. " +
    "Reads logs/<projectName>.log from the centralized logs/ directory.",
    {
        projectName: z
            .string()
            .min(1)
            .describe(
                "Name of the project whose logs to retrieve (e.g. 'my-app'). " +
                "Must match the log filename without the .log extension."
            ),
    },
    async ({ projectName }) => {
        try {
            const safe = validateProjectName(projectName);

            console.error(`[get_terminal_logs] project="${safe}"`);

            const logs = getTerminalLogs(safe);

            return {
                content: [{ type: "text", text: logs }],
            };
        } catch (err) {
            console.error(`[get_terminal_logs] Error: ${err.message}`);
            return {
                content: [{ type: "text", text: `Error: ${err.message}` }],
                isError: true,
            };
        }
    }
);

// ── Tool 2: get_latest_logs ───────────────────────────────────
server.tool(
    "get_latest_logs",
    "Returns the most recent N lines of the terminal log for a given project. " +
    "Useful for checking the current state of a running process.",
    {
        projectName: z
            .string()
            .min(1)
            .describe(
                "Name of the project whose logs to retrieve (e.g. 'my-app')."
            ),
        numberOfLines: z
            .number()
            .int()
            .min(1)
            .max(1000)
            .default(50)
            .describe(
                "Number of trailing lines to return. Defaults to 50. Maximum is 1000."
            ),
    },
    async ({ projectName, numberOfLines }) => {
        try {
            const safe = validateProjectName(projectName);

            console.error(`[get_latest_logs] project="${safe}" lines=${numberOfLines}`);

            const logs = getLatestLogs(safe, numberOfLines);

            return {
                content: [{ type: "text", text: logs }],
            };
        } catch (err) {
            console.error(`[get_latest_logs] Error: ${err.message}`);
            return {
                content: [{ type: "text", text: `Error: ${err.message}` }],
                isError: true,
            };
        }
    }
);

// ── Tool 3: get_errors ────────────────────────────────────────
server.tool(
    "get_errors",
    "Scans the terminal log for a given project and returns only lines that " +
    "match common error patterns: error, exception, failed, failure, fatal, " +
    "ENOENT, EADDRINUSE.",
    {
        projectName: z
            .string()
            .min(1)
            .describe(
                "Name of the project to scan for errors (e.g. 'my-app')."
            ),
    },
    async ({ projectName }) => {
        try {
            const safe = validateProjectName(projectName);

            console.error(`[get_errors] project="${safe}"`);

            const errors = getErrors(safe);

            return {
                content: [{ type: "text", text: errors }],
            };
        } catch (err) {
            console.error(`[get_errors] Error: ${err.message}`);
            return {
                content: [{ type: "text", text: `Error: ${err.message}` }],
                isError: true,
            };
        }
    }
);

// ── Entry point ───────────────────────────────────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // All diagnostics go to stderr — stdout is owned by MCP/JSON-RPC.
    console.error("[ai-terminal-debugger] MCP server started. Listening on stdio.");
}

main().catch((err) => {
    console.error("[ai-terminal-debugger] Fatal startup error:", err);
    process.exit(1);
});
