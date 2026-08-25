# Automation-R-D

NLP browser tests. The `.nlp` file is the source of truth. Cursor Cloud is called **once** to turn the whole case into Playwright, then that script runs in the browser. A failed run gets **at most one heal** (`CURSOR_HEAL_ATTEMPTS`, default 1) with a short page digest. No per-step Cloud calls.

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

## Local

```bash
cp .env.example .env
# set WOLKEN_PASSWORD and CURSOR_API_KEY

npm install
npx playwright install chromium
npm run test:e2e:headed
```
