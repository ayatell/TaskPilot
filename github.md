# TaskPilot — Git & GitHub Collaboration Guide

This guide is designed for you and your teammate working on **TaskPilot** (`https://github.com/ayatell/TaskPilot`). Follow these workflows to collaborate smoothly, avoid overwriting each other's code, and prevent accidental secret leaks.

---

## 1. Golden Rules of Git (Read First!)

1. **NEVER commit secrets or virtual environments:**
   - `.env`, `.venv/`, `__pycache__/`, and `node_modules/` must NEVER be committed.
   - Always verify what you are adding with `git status` before committing.
   - We already set up `.gitignore` to protect you.
2. **Never push directly to `main`:**
   - `main` is the shared, stable source of truth.
   - You work on `backend` (or `feat/backend-...`).
   - Your partner works on `ml` (or `feat/ml-...`).
   - You merge into `main` using **GitHub Pull Requests (PRs)** after testing.
3. **Pull often, commit in small logical chunks:**
   - Small commits with clear messages make debugging and reviewing simple.

---

## 2. Repository Structure & Branches

```
           (Partner merges PR)
              ┌─────────◄───────── [ml]
              ▼
[main] ──────────────────────────────────────────►
              ▲
              └─────────◄───────── [backend]
            (You merge PR)
```

- **`main`**: The official shared code. Always works.
- **`backend`**: Your dedicated branch for backend APIs, database models, planning, and tests.
- **`ml`** (or `feat/ml-...`): Your partner's branch for prompts, datasets, training scripts, and ML notebooks.

---

## 3. Daily Workflow: Step-by-Step

### Step 1: Check your current status
Before touching code or after returning to your desk:
```powershell
git status
```
This tells you:
- Which branch you are on.
- Which files you changed.
- Which files are untracked or staged.

---

### Step 2: Sync with `main` before starting new work
Whenever your partner merges something into `main`, update your local `main` and rebase your branch:
```powershell
# 1. Fetch all updates from GitHub
git fetch origin

# 2. Rebase your current branch on top of origin/main
git pull --rebase origin main
```
> **Why `--rebase`?** It prevents cluttering your history with unnecessary "Merge branch..." commits and keeps your git graph linear and clean.

---

### Step 3: Stage only the files you want to commit
Avoid blind `git add .` if you aren't 100% sure what changed!

```powershell
# Check what changed
git status

# Stage specific files (recommended!)
git add backend/app/models.py
git add backend/app/schemas.py

# OR stage entire backend directory (respects .gitignore)
git add backend/
```

> [!TIP]
> Run `git diff --staged` to preview the exact lines you are about to commit!

---

### Step 4: Commit with a meaningful message
Follow conventional commit prefixes:
- `feat:` A new feature (e.g. `feat(auth): add JWT login and password hashing`)
- `fix:` A bug fix (e.g. `fix(tasks): correct priority validation range`)
- `test:` Adding tests (e.g. `test(planner): add unit tests for deadline overflow`)
- `docs:` Documentation updates (e.g. `docs: update contract in CONTEXT.md`)

```powershell
git commit -m "feat(backend): implement User and Task SQLAlchemy models"
```

---

### Step 5: Push your branch to GitHub
Push your commits to your branch on GitHub:

```powershell
# The first time you push your branch:
git push -u origin backend

# All subsequent pushes on the same branch:
git push
```

---

## 4. Opening and Merging a Pull Request (PR)

When you finish a phase (e.g., Phase 4 Auth & Tasks) and your tests pass:

1. **Go to GitHub:** Open [https://github.com/ayatell/TaskPilot](https://github.com/ayatell/TaskPilot).
2. **Click "Compare & pull request":** GitHub will show a banner for your recently pushed branch.
3. **Configure the PR:**
   - **Base:** `main`
   - **Compare:** `backend`
   - **Title:** e.g., `feat: Add database models, auth routes, and task CRUD`
   - **Description:** List what you built, how to run it, and confirmation that tests pass.
4. **Assign Reviewer:** Select your partner to review your PR.
5. **Partner Reviews & Merges:**
   - Your partner reviews the code on GitHub, tests it if needed, and clicks **Merge pull request** (choose **Squash and merge** or **Create a merge commit**).

---

## 5. Resolving Merge Conflicts (Don't Panic!)

A merge conflict happens when both you and your partner edited the exact same line in the same file.

If git tells you:
```
CONFLICT (content): Merge conflict in backend/app/main.py
Automatic merge failed; fix conflicts and then commit the result.
```

### How to resolve it in 3 steps:

1. **Open the conflicting file** in your IDE (VS Code / Antigravity). You will see conflict markers:
   ```python
   <<<<<<< HEAD
   # Code already in main
   app.include_router(chat.router)
   =======
   # Your new code
   app.include_router(tasks.router)
   >>>>>>> backend
   ```
2. **Edit the file:** Keep what you need, delete the markers (`<<<<<<<`, `=======`, `>>>>>>>`), and save:
   ```python
   app.include_router(chat.router)
   app.include_router(tasks.router)
   ```
3. **Mark resolved and finish:**
   ```powershell
   git add backend/app/main.py
   git rebase --continue
   # (Or if merging: git commit -m "fix: resolve merge conflict in main.py")
   ```

---

## 6. How to Undo Common Mistakes

### Case 1: You accidentally staged a file you didn't want to commit
```powershell
# Unstage a single file:
git restore --staged backend/.env

# Or unstage everything:
git restore --staged .
```

### Case 2: You made changes to a file and want to throw them away
```powershell
# Discard local edits in a specific file:
git restore backend/app/models.py
```

### Case 3: You need to switch branches quickly without committing incomplete work
Use `git stash` to temporarily shelf your changes:
```powershell
# Save temporary work:
git stash

# Switch branches or pull:
git checkout main
git pull

# Switch back and restore your work:
git checkout backend
git stash pop
```

### Case 4: You committed with a typo in the message (and haven't pushed yet)
```powershell
git commit --amend -m "feat(backend): correct commit message"
```

---

## 7. Quick Copy-Paste Cheat Sheet (PowerShell)

| Action | Command |
| :--- | :--- |
| **Check current state** | `git status` |
| **View branch list** | `git branch -a` |
| **Switch to backend branch** | `git checkout backend` |
| **Create and switch to new branch** | `git checkout -b feat/my-feature` |
| **Stage changes** | `git add <filepath>` |
| **Commit staged changes** | `git commit -m "your message"` |
| **Push to GitHub** | `git push -u origin backend` |
| **Fetch all updates from GitHub** | `git fetch origin` |
| **Pull latest main with rebase** | `git pull --rebase origin main` |
| **View recent commits** | `git log --oneline -n 10` |
| **View unstaged diffs** | `git diff` |
