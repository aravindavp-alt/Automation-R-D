# Automation-R-D

NLP browser tests. Cursor Cloud is called **once** (cheap model `composer-2.5`) to write Playwright. Pass/fail is judged **locally** in Playwright — case id, subject, Site ID, severity, product — with **no extra Cloud tokens**. If the script fails, cookies/storage are cleared, the start URL is reopened, and Cloud heals **once** with a complete `page.goto` script (not a mid-flow snippet).

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
