# Automation-R-D

NLP browser tests. Drop one `.nlp` file per scenario in [`tests/nlp/`](tests/nlp/). The cheap path is **local Playwright** (no LLM tokens). **LLMs run only on failure.** Jenkins heals with a local Cursor agent + Playwright MCP. GitHub Actions heals with a no-repo Cursor Cloud rewrite.

## NLP scenarios

Each file in `tests/nlp/*.nlp` is one scenario. Playwright and Jenkins discover them automatically.

```text
Test Case Title:
Create Broadcom Standard case in Wolken sandbox
Subject: optional override
Description: optional override

Steps:
1. Navigate to https://...
2. ...

Expected Result:
...
```

`Subject` / `Description` are optional. If omitted, the runner uses the title plus a timestamp.

Run a subset:

```bash
NLP_FILE=tests/nlp/create-broadcom-standard-case.nlp npm run jenkins:nlp
NLP_FILE='tests/nlp/*.nlp' npm run jenkins:nlp
NLP_FILE='tests/nlp/foo.nlp,tests/nlp/bar.nlp' npm run jenkins:nlp
```

## GitHub Actions (CI)

1. **Settings → Secrets and variables → Actions**
2. Add:
   - `WOLKEN_USER`
   - `WOLKEN_PASSWORD`
   - `CURSOR_API_KEY` — from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations) (used only if local Playwright fails)
3. **Actions → Wolken NLP browser → Run workflow** (optional `nlp_file` input)

Use a user or unrestricted service-account `CURSOR_API_KEY` (repository-scoped keys cannot start no-repo Cloud agents).

Pull requests only split/parse every `.nlp` file. The headed Chromium run is `workflow_dispatch` or push to `main`.

CI uses Node 24 via `actions/checkout@v7`, `actions/setup-node@v7`, and `actions/upload-artifact@v7`. npm cache is off so GitHub does not pull the deprecated Node 20 cache action.

## Jenkins

Pipeline: [`Jenkinsfile`](Jenkinsfile). Parameter `NLP_FILE` defaults to `tests/nlp/*.nlp`.

1. **Local headed Chrome + Playwright** runs each matching NLP (no LLM).
2. **On failure only**, a local Cursor agent starts **Playwright MCP** + **Chrome DevTools MCP**.

Jenkins credentials:

- `nlp-git` — Git username/password or SSH to clone the NLP repository
- `cursor-api-key` — used only if local Playwright fails
- `wolken-login` — Wolken username/password

`HEADED=true` (default) shows Chrome. `CURSOR_HEAL_WITH=mcp` (default) is the failure path.

## Local

```bash
cp .env.example .env
# set WOLKEN_PASSWORD and CURSOR_API_KEY

npm install
npx playwright install chromium
npm run test:e2e:headed
```
