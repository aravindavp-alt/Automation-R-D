# Automation-R-D

NLP browser tests for the Wolken sandbox. The numbered English case is the source of truth; GitHub Actions launches a real Chromium (headed on Xvfb) and drives those steps with Playwright.

## Create Broadcom Standard case

Test: [`tests/nlp/create-broadcom-standard-case.nlp`](tests/nlp/create-broadcom-standard-case.nlp)

That file is the same kind of test used interactively:

1. Open the sandbox login page
2. Login, or refresh if already signed in
3. Create Case → Case Type → Broadcom Standard
4. Fill Site ID, Contact, Product, Release, Severity, Component, Responsible ORG
5. Enter Subject / Description, paste a screenshot, Submit

## GitHub Actions (CI)

1. In the GitHub repo: **Settings → Secrets and variables → Actions**
2. Add:
   - `WOLKEN_USER` — sandbox username
   - `WOLKEN_PASSWORD` — sandbox password
3. Run **Actions → Wolken NLP browser → Run workflow**

The job:

- installs Chromium
- starts a virtual display (`xvfb-run`)
- executes the NLP case **headed** (a real browser, not a stub)
- uploads `playwright-report` and `test-results` (screenshots / video / trace on failure)

## Local

```bash
cp .env.example .env
# set WOLKEN_PASSWORD in .env

npm install
npx playwright install chromium
npm run test:e2e:headed
```

Open `playwright-report/index.html` after a run.
