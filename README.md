# AI Terminal Debugger

An AI-powered Terminal Debugging Assistant built as a **Model Context Protocol (MCP)** server. It exposes read-only log inspection tools over `stdio` so MCP-compatible AI clients (such as Claude Desktop) can read, tail, and scan centralized terminal logs for errors.

---

## Features

- **MCP Server (`stdio` transport)**: Communicates with MCP clients using JSON-RPC over `stdout` while keeping diagnostic output on `stderr`.
- **Three Read-Only Inspection Tools**:
  - `get_terminal_logs` — Retrieve the complete log file for a project.
  - `get_latest_logs` — Tail the most recent *N* lines (default `50`, max `1000`).
  - `get_errors` — Filter log lines matching common error patterns (`error`, `exception`, `failed`, `failure`, `fatal`, `ENOENT`, `EADDRINUSE`, case-insensitive).
- **Path Traversal & Input Validation**: Strictly validates `projectName` inputs before resolving log file paths.
- **Built-in Test Suite**: Covers input validation, log reading, tailing, error filtering, regression checks, and MCP SDK module loading.

---

## Project Structure

```text
AI-Terminal-Debugger/
├── logs/                  # Centralized directory for <projectName>.log files
├── node_modules/          # Installed npm dependencies
├── src/
│   ├── log-reader.js      # Core log reading, tailing, and error-filtering utilities
│   ├── server.js          # MCP server definition, tool registration, and input validation
│   └── test-server.js     # Standalone test suite
├── package.json
└── package-lock.json
```

---

## Prerequisites

- **Node.js** (v18+ recommended)
- **npm**

---

## Installation

1. Clone or open the repository:
   ```bash
   cd AI-Terminal-Debugger
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

---

## How It Works

The server reads UTF-8 `.log` files stored in the `logs/` directory at the project root, using the naming convention:

```text
logs/<projectName>.log
```

For example, querying `projectName: "my-app"` reads `logs/my-app.log`. If `logs/` does not exist yet, create the `logs/` directory at the repository root before supplying log files. If the file does not exist, the tools return:

```text
No logs found for project: <projectName>
```

> **Note:** Automatic log capture is not included in this repository. Any external process or user-supplied workflow that writes `<projectName>.log` files into `logs/` can be inspected by the MCP server.

---

## MCP Tools Reference

### 1. `get_terminal_logs`
Returns the complete terminal log for a given project.

- **Parameters**:
  - `projectName` (`string`, required, min length `1`): Name of the project whose logs to retrieve (e.g., `my-app`).

### 2. `get_latest_logs`
Returns the most recent *N* lines of a project's terminal log. Useful for checking the latest state of a running process.

- **Parameters**:
  - `projectName` (`string`, required, min length `1`): Name of the project whose logs to retrieve.
  - `numberOfLines` (`integer`, optional, default `50`, min `1`, max `1000`): Number of trailing lines to return.

### 3. `get_errors`
Scans a project's terminal log and returns only lines matching common error patterns (case-insensitive):
`error`, `exception`, `failed`, `failure`, `fatal`, `ENOENT`, `EADDRINUSE`.

- **Parameters**:
  - `projectName` (`string`, required, min length `1`): Name of the project to scan for errors.
- **Behavior**: Returns matching lines joined by newlines, or `"No matching error lines found."` when no lines match.

---

## Usage

### Running the MCP Server Directly

```bash
npm start
```

Or:

```bash
node src/server.js
```

When started, the server listens on `stdio` and logs startup diagnostics to `stderr`:

```text
[ai-terminal-debugger] MCP server started. Listening on stdio.
```

### Configuring with Claude Desktop

Add an entry to your Claude Desktop MCP configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ai-terminal-debugger": {
      "command": "node",
      "args": ["<PATH_TO_AI_TERMINAL_DEBUGGER>/src/server.js"]
    }
  }
}
```

Update the path in `args` to match your local installation directory.

---

## Security & Input Validation

All tool handlers in `src/server.js` pass `projectName` through `validateProjectName(name)` before accessing the filesystem:

- Must be a non-empty string (surrounding whitespace is trimmed).
- Rejects path traversal sequences and separators (`..`, `/`, `\`).
- Restricts characters to `/^[a-zA-Z0-9_.\-]+$/` (letters, digits, underscores, dots, and hyphens).
- Invalid inputs return an MCP error response (`isError: true`) with a descriptive message.

---

## Testing

Run the test suite with:

```bash
npm test
```

Or:

```bash
node src/test-server.js
```

The test suite verifies:
1. Valid `projectName` inputs and whitespace trimming.
2. Rejection of empty, non-string, special-character, and path-traversal inputs.
3. Full log reading and missing-project handling (`getTerminalLogs`).
4. Tailing behavior, default line count, and bounds (`getLatestLogs`).
5. Error pattern matching, clean-log handling, and consecutive error-line regression checks (`getErrors`).
6. Sanity checks against any existing `.log` files in `logs/`.
7. Clean module resolution for `@modelcontextprotocol/sdk`, `zod`, and `src/log-reader.js`.

---

## Dependencies

- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (`^1.32.2`) — Official MCP server and `stdio` transport implementation.
- [`zod`](https://www.npmjs.com/package/zod) (`^4.6.7`) — Schema validation for MCP tool parameters.

---

## License

ISC
