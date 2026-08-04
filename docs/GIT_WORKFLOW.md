# Git Workflow

Development workflow and branch management for AmarktAI Marketing.

## Branch Strategy

```
master (production)
  ↑
  └── development (integration)
        ↑
        └── feature/* (feature branches)
        └── fix/* (bug fixes)
        └── release/* (release preparation)
```

### Branches

| Branch | Purpose | Protection |
|--------|---------|------------|
| `master` | Production releases only | PR required, all checks must pass |
| `development` | Integration branch | PR required, builds must pass |
| `feature/*` | New features | No direct commits to development |
| `fix/*` | Bug fixes | No direct commits to development |
| `release/*` | Release preparation | Created from development |

## How New Features Begin

1. Ensure you are on `development`:
   ```bash
   git checkout development
   git pull origin development
   ```

2. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. Implement the feature with atomic commits

4. Push and create a Pull Request into `development`

## How Commits Are Created

### Commit Message Format

```
<type>(<scope>): <description>

<body>

<footer>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `refactor` | Code refactoring |
| `test` | Adding tests |
| `chore` | Maintenance |
| `perf` | Performance improvement |
| `style` | Code style (no logic change) |

### Examples

```
feat(knowledge): add PDF upload support

- Add multer middleware for file uploads
- Parse PDF content using crawler service
- Chunk text into knowledge items
- Store embeddings via vector service

Closes #42
```

```
fix(competitor): resolve snapshot date parsing

The snapshot_date field was being stored as string instead of DATE.
Fixed the mapping function to return proper date format.
```

## How Pull Requests Work

### Creating a PR

1. Push your branch:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Create PR on GitHub targeting `development`

3. Fill in the PR template:
   - Summary of changes
   - Files changed
   - Testing performed
   - Related issues

### PR Requirements

For merging into `development`:
- [ ] TypeScript compilation passes
- [ ] Build succeeds
- [ ] No merge conflicts

For merging into `master`:
- [ ] All development requirements
- [ ] All verification scripts pass
- [ ] Documentation updated
- [ ] CHANGELOG updated
- [ ] Version bumped
- [ ] At least 1 review approval

## How Releases Are Tagged

### Semantic Versioning

```
v<major>.<minor>.<patch>-<identifier>
```

| Component | When to Bump |
|-----------|--------------|
| Major | Breaking changes, major milestones |
| Minor | New features, new milestones |
| Patch | Bug fixes, documentation |
| Identifier | `foundation`, `ai-core`, `research`, etc. |

### Tagging Process

```bash
# Tag the release
git tag -a v0.3.0-research -m "Milestone 2: Research & Knowledge Complete"

# Push tags
git push origin --tags
```

### Tag History

| Tag | Milestone |
|-----|-----------|
| `v0.1.0-foundation` | Phase 1: Foundation |
| `v0.2.0-ai-core` | Milestone 1: AI Core |
| `v0.3.0-research` | Milestone 2: Research & Knowledge |

## How Milestones Are Completed

1. All milestone tasks are verified complete
2. All verification scripts pass
3. Documentation is updated
4. CHANGELOG is updated with milestone entry
5. ROADMAP is updated to reflect completion
6. Version is bumped in `version.json`
7. Release tag is created
8. PR is created from `development` into `master`
9. PR is merged after all checks pass
10. `development` is synchronized with `master`

## Daily Workflow

```bash
# Start work
git checkout development
git pull origin development

# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit
git add -A
git commit -m "feat(scope): description"

# Push and create PR
git push origin feature/my-feature
# Create PR on GitHub: feature/my-feature → development

# After PR is merged, clean up
git checkout development
git pull origin development
git branch -d feature/my-feature
```

## Verification Scripts

Before any PR is merged, run:

```bash
npm run verify        # Run all verification checks
npm run verify:types  # TypeScript compilation
npm run verify:build  # Production build
```
