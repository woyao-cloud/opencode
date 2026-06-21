const fs = require('fs');
const path = require('path');

const map = {
  "account.md": "packages/opencode/src/account/account.ts",
  "account-repo.md": "packages/opencode/src/account/repo.ts",
  "agent.md": "packages/opencode/src/agent/agent.ts",
  "aisdk.md": "packages/core/src/aisdk.ts",
  "app-filesystem.md": "packages/core/src/filesystem.ts",
  "app-process.md": "packages/core/src/process.ts",
  "auth.md": "packages/opencode/src/auth/index.ts",
  "auth-v2.md": "packages/core/src/auth.ts",
  "background-job.md": "packages/opencode/src/background/job.ts",
  "bus.md": "packages/opencode/src/bus/index.ts",
  "catalog.md": "packages/core/src/catalog.ts",
  "command.md": "packages/opencode/src/command/index.ts",
  "config.md": "packages/opencode/src/config/config.ts",
  "data-migration.md": "packages/opencode/src/data-migration.ts",
  "effect-flock.md": "packages/core/src/util/effect-flock.ts",
  "env.md": "packages/opencode/src/env/index.ts",
  "event.md": "packages/core/src/event.ts",
  "event-v2-bridge.md": "packages/opencode/src/event-v2-bridge.ts",
  "file.md": "packages/opencode/src/file/index.ts",
  "file-watcher.md": "packages/opencode/src/file/watcher.ts",
  "format.md": "packages/opencode/src/format/index.ts",
  "git.md": "packages/opencode/src/git/index.ts",
  "global.md": "packages/core/src/global.ts",
  "httpapi-websocket-tracker.md": "packages/opencode/src/server/routes/instance/httpapi/websocket-tracker.ts",
  "image.md": "packages/opencode/src/image/image.ts",
  "installation.md": "packages/opencode/src/installation/index.ts",
  "instance-bootstrap.md": "packages/opencode/src/project/bootstrap-service.ts",
  "instance-store.md": "packages/opencode/src/project/instance-store.ts",
  "instruction.md": "packages/opencode/src/session/instruction.ts",
  "llm.md": "packages/opencode/src/session/llm.ts",
  "location.md": "packages/core/src/location.ts",
  "lsp.md": "packages/opencode/src/lsp/lsp.ts",
  "mcp.md": "packages/opencode/src/mcp/index.ts",
  "mcp-auth.md": "packages/opencode/src/mcp/auth.ts",
  "models-dev.md": "packages/core/src/models.ts",
  "npm.md": "packages/core/src/npm.ts",
  "permission.md": "packages/opencode/src/permission/index.ts",
  "plugin.md": "packages/opencode/src/plugin/index.ts",
  "plugin-boot.md": "packages/core/src/plugin/boot.ts",
  "plugin-v2.md": "packages/core/src/plugin.ts",
  "project.md": "packages/opencode/src/project/project.ts",
  "provider.md": "packages/opencode/src/provider/provider.ts",
  "provider-auth.md": "packages/opencode/src/provider/auth.ts",
  "pty.md": "packages/opencode/src/pty/index.ts",
  "pty-ticket.md": "packages/opencode/src/pty/ticket.ts",
  "question.md": "packages/opencode/src/question/index.ts",
  "reference.md": "packages/opencode/src/reference/reference.ts",
  "ripgrep.md": "packages/opencode/src/file/ripgrep.ts",
  "session.md": "packages/opencode/src/session/session.ts",
  "session-compaction.md": "packages/opencode/src/session/compaction.ts",
  "session-processor.md": "packages/opencode/src/session/processor.ts",
  "session-prompt.md": "packages/opencode/src/session/prompt.ts",
  "session-revert.md": "packages/opencode/src/session/revert.ts",
  "session-run-state.md": "packages/opencode/src/session/run-state.ts",
  "session-share.md": "packages/opencode/src/share/session.ts",
  "session-status.md": "packages/opencode/src/session/status.ts",
  "session-summary.md": "packages/opencode/src/session/summary.ts",
  "session-todo.md": "packages/opencode/src/session/todo.ts",
  "session-v2.md": "packages/opencode/src/v2/session.ts",
  "share-next.md": "packages/opencode/src/share/share-next.ts",
  "skill.md": "packages/opencode/src/skill/index.ts",
  "skill-discovery.md": "packages/opencode/src/skill/discovery.ts",
  "snapshot.md": "packages/opencode/src/snapshot/index.ts",
  "storage.md": "packages/opencode/src/storage/storage.ts",
  "sync-event.md": "packages/opencode/src/sync/index.ts",
  "system-prompt.md": "packages/opencode/src/session/system.ts",
  "tool-registry.md": "packages/opencode/src/tool/registry.ts",
  "truncate.md": "packages/opencode/src/tool/truncate.ts",
  "tui-config.md": "packages/opencode/src/cli/cmd/tui/config/tui.ts",
  "vcs.md": "packages/opencode/src/project/vcs.ts",
  "workspace.md": "packages/opencode/src/control-plane/workspace.ts",
  "worktree.md": "packages/opencode/src/worktree/index.ts",
};

const base = "D:/claude-code-project/opencode.ai/opencode/docs/book-services";
let count = 0;

for (const [file, srcPath] of Object.entries(map)) {
  const filePath = path.join(base, file);
  if (!fs.existsSync(filePath)) {
    console.log("MISSING:", filePath);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  const pathLine = `\n> 源文件: \`opencode/${srcPath}\``;

  // Find first newline after title
  const firstNewline = content.indexOf('\n');
  const title = firstNewline >= 0 ? content.substring(0, firstNewline) : content;
  const rest = firstNewline >= 0 ? content.substring(firstNewline) : '';

  // Check if line 2 already has a path line and replace it
  const restLines = rest.split('\n');
  if (restLines.length > 1 && /^> .*:/.test(restLines[1])) {
    restLines[1] = pathLine.trim();
    const newContent = title + '\n' + restLines.join('\n');
    fs.writeFileSync(filePath, newContent, 'utf-8');
  } else {
    const newContent = title + pathLine + rest;
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }
  count++;
}

console.log("Updated", count, "files");
