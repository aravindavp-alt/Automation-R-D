# Automation-R-D

NLP browser tests. Cursor Cloud is a **no-repo** agent: it does not clone this repository, so it cannot copy `wolken.ts` or other helpers. It is called **once** (`composer-2.5`) with the NLP steps and returns Playwright. Pass/fail is judged **locally** (case id, subject, Site ID, severity, product). If the script fails, the browser is reset and Cloud heals **once** from NLP plus the error — still with an empty workspace.

## Create Broadcom Standard case

Test: [`tests/nlp/create-broadcom-standard-case.nlp`](tests/nlp/create-broadcom-standard-case.nlp)

Add or change English steps in that file. The next run asks Cursor Cloud to interpret them.

## GitHub Actions (CI)

1. **Settings → Secrets and variables → Actions**
2. Add:
   - `WOLKEN_USER`
   - `WOLKEN_PASSWORD`
   - `CURSOR_API_KEY` — from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations)
3. **Actions → Wolken NLP browser → Run workflow**

Use a user or unrestricted service-account `CURSOR_API_KEY` (repository-scoped keys cannot start no-repo Cloud agents).

Pull requests only split/parse the NLP file. The headed Chromium run is `workflow_dispatch` or push to `main`.

CI uses Node 24 via `actions/checkout@v7`, `actions/setup-node@v7`, and `actions/upload-artifact@v7`. npm cache is off so GitHub does not pull the deprecated Node 20 cache action.

## Local

```bash
cp .env.example .env
# set WOLKEN_PASSWORD and CURSOR_API_KEY

npm install
npx playwright install chromium
npm run test:e2e:headed
```
