# Default Branch Change Guide

## Objective
Change the default branch from `main` to `local-backup` for the repository `acheronx0577/hatch-site`.

## Current Status
✅ **Completed Tasks:**
- Updated CI workflow to trigger on `local-backup` branch instead of `main`
- Verified `local-backup` branch is up-to-date and ready to be the default

## Required Action (Repository Administrator Only)

To complete the default branch change, a repository administrator must perform the following steps:

### Option 1: Using GitHub Web Interface (Recommended)

1. Go to the repository: https://github.com/acheronx0577/hatch-site
2. Click on **Settings** (requires admin access)
3. Click on **Branches** in the left sidebar
4. In the **Default branch** section, click the switch/pencil icon
5. Select `local-backup` from the dropdown
6. Click **Update** and confirm the change

### Option 2: Using GitHub CLI

If you have the GitHub CLI (`gh`) installed and authenticated:

```bash
gh repo edit acheronx0577/hatch-site --default-branch local-backup
```

### Option 3: Using GitHub API

If you have a personal access token with `repo` scope:

```bash
curl -X PATCH \
  -H "Authorization: token YOUR_PERSONAL_ACCESS_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/acheronx0577/hatch-site \
  -d '{"default_branch":"local-backup"}'
```

## Post-Change Verification

After changing the default branch, verify:

1. New clones use `local-backup` as the default:
   ```bash
   git clone https://github.com/acheronx0577/hatch-site.git
   cd hatch-site
   git branch
   # Should show * local-backup
   ```

2. Pull requests default to `local-backup` as the base branch

3. CI/CD workflows trigger correctly on pushes to `local-backup`

## What Changed in This PR

- **CI Workflow**: Updated `.github/workflows/ci.yml` to trigger on `local-backup` branch instead of `main`

## Important Notes

⚠️ **Limitations:**
- Git commands cannot change the GitHub repository default branch setting
- This requires GitHub repository administrator access
- The change must be made through GitHub's interface, API, or CLI

📝 **Why local-backup?**
The `local-backup` branch contains the latest working version of the code with all recent features and updates.

## Questions?

If you need help with this change or don't have admin access to the repository, contact the repository owner or an administrator.
