# Local Installation & Fork Maintenance Guide

This document describes how the enhanced Pi (with Jev System-1 architecture) is permanently installed on your system, how it is decoupled from upstream package updates, and how to safely maintain and sync your fork against official Pi repository releases.

---

## 1. Permanent Local Installation Architecture

### Previous System State
Previously, `pi` was installed via Bun's global package installer:
```text
which pi -> /Users/ravi/.bun/bin/pi -> ../install/global/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js
```
This had two drawbacks:
1. Running `bun update -g` would fetch the latest upstream npm bundle and silently overwrite local modifications.
2. Code edits required building and recompiling the distribution bundle before testing.

### Current Implementation
The environment now links directly to the local source tree via a canonical launcher:

```text
User Command: "pi"
       │
       ▼
Shell Configuration (~/.zshrc alias) OR PATH (/Users/ravi/.bun/bin/pi)
       │
       ▼ (Symlink)
/Users/ravi/Desktop/PI-JEV/pi/bin/pi
       │
       ▼ (Canonical symlink resolution)
/Users/ravi/Desktop/PI-JEV/pi/node_modules/.bin/tsx
       │
       ▼ (Direct TypeScript execution)
/Users/ravi/Desktop/PI-JEV/pi/packages/coding-agent/src/cli.ts
```

### Key Components

1. **Canonical Launcher Script**: [`bin/pi`](file:///Users/ravi/Desktop/PI-JEV/pi/bin/pi)
   - Resolves all symlinks recursively using `readlink` to identify the repository root directory regardless of current working directory.
   - Executes `packages/coding-agent/src/cli.ts` via local `tsx` using `exec` (preserving process signals and terminal resize events).
   - Any source modification inside `packages/` is immediately active without build steps.

2. **Global Symlink Replacement**:
   - `/Users/ravi/.bun/bin/pi` is a direct symlink to `/Users/ravi/Desktop/PI-JEV/pi/bin/pi`.
   - Any tool, subprocess, or script calling `pi` through `PATH` invokes the enhanced agent.

3. **Interactive Shell Aliases**:
   Configured in `~/.zshrc`:
   ```bash
   alias pi="/Users/ravi/Desktop/PI-JEV/pi/bin/pi"
   alias pi-jev="/Users/ravi/Desktop/PI-JEV/pi/bin/pi"
   ```

---

## 2. Decoupling from Upstream Auto-Updates

Pi does not contain a background self-updating daemon. Updates only occur when a package manager explicitly downloads and replaces the global package.

### Protection Mechanism
1. **Removed from Bun Global Registry**:
   Executed `bun remove -g @earendil-works/pi-coding-agent`.
   Because `@earendil-works/pi-coding-agent` is no longer in `~/.bun/install/global/package.json`:
   - `bun update -g` skips Pi entirely.
   - `npm update -g` will not touch Pi.
2. **Local Symlink Ownership**:
   `/Users/ravi/.bun/bin/pi` points to your local git checkout. Package managers will not overwrite existing symlinks not tracked in their lockfiles.

---

## 3. Git Remotes & Fork Structure

The repository is configured with two remotes:

| Remote | URL | Purpose |
|:-------|:----|:--------|
| **`origin`** | `https://github.com/ravibaba/pi.git` | Your personal fork where enhancements and Jev features reside. |
| **`upstream`** | `https://github.com/earendil-works/pi.git` | Official repository where official updates and bug fixes originate. |

Verify remote configuration:
```bash
git remote -v
```
Expected output:
```text
origin    https://github.com/ravibaba/pi.git (fetch)
origin    https://github.com/ravibaba/pi.git (push)
upstream  https://github.com/earendil-works/pi.git (fetch)
upstream  https://github.com/earendil-works/pi.git (push)
```

---

## 4. Fork Maintenance: Syncing Upstream Changes

When upstream releases bug fixes, new providers, or utility improvements, use the following workflows to incorporate them without breaking Jev enhancements.

### Workflow A: Full Branch Rebase (Recommended for Regular Sync)

Use this workflow to keep your `jev-control-plane` branch current with upstream releases.

```bash
# Step 1: Fetch all upstream changes without altering your working tree
git fetch upstream

# Step 2: Keep your local main branch cleanly aligned with upstream main
git checkout main
git merge --ff-only upstream/main
git push origin main

# Step 3: Switch back to your enhanced feature branch
git checkout jev-control-plane

# Step 4: Rebase your changes on top of updated main
git rebase main

# Step 5: If conflicts arise, resolve them, verify with git status, then:
# git rebase --continue

# Step 6: Run verification quality gates
npm run check
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/decision/

# Step 7: Push the rebased branch to your fork
git push origin jev-control-plane --force-with-lease
```

### Workflow B: Selective Cherry-Picking (For Specific Features or Fixes)

If upstream has introduced breaking architectural refactors that you want to avoid, but you need a specific bug fix (e.g., an API provider update or a TUI bug fix):

```bash
# Step 1: Fetch upstream commits
git fetch upstream

# Step 2: Find the commit hash on upstream/main
git log --oneline upstream/main -n 20

# Step 3: Ensure you are on jev-control-plane
git checkout jev-control-plane

# Step 4: Cherry-pick only the desired commit
git cherry-pick <commit-hash>

# Step 5: Verify correctness
npm run check
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/decision/

# Step 6: Push to your fork
git push origin jev-control-plane
```

---

## 5. Verification Commands Reference

After any sync, upstream pull, or dependency update, run these checks to ensure complete system health:

```bash
# 1. Monorepo linting, type checks, and dependency verification (0 errors expected)
npm run check

# 2. Decision subsystem integration & unit tests (all 10 suites / 53 tests must pass)
node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/decision/

# 3. Verify CLI execution from arbitrary directory
pi --version
```
