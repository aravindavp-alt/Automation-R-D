pipeline {
  agent any

  options {
    timestamps()
    timeout(time: 90, unit: 'MINUTES')
    disableConcurrentBuilds()
  }

  parameters {
    string(name: 'RUNNER_DIR', defaultValue: '/Users/wspl-0318/Desktop/Wolken_QC_Automation/CURSOR-RD/Automation-R-D', description: 'Local runner project (used when this job is an inline Pipeline script)')
    string(name: 'NLP_REPO', defaultValue: 'https://github.com/aravindavp-alt/Automation-R-D.git', description: 'Git repository that contains the .nlp files')
    string(name: 'NLP_REF', defaultValue: 'feat/wolken-nlp-ci', description: 'Branch, tag, or commit of the NLP repository')
    string(name: 'NLP_FILE', defaultValue: 'tests/nlp/*.nlp', description: 'One path, comma-separated paths, glob, or all')
    string(name: 'NLP_GIT_CREDENTIALS', defaultValue: '', description: 'Optional Jenkins credentials id for a private NLP repo')
    choice(name: 'HEADED', choices: ['true', 'false'], description: 'true = visible Chrome on this Mac. false = headless (Linux Xvfb if present)')
    choice(name: 'CURSOR_HEAL_WITH', choices: ['mcp', 'cloud'], description: 'LLM heal only if local Playwright fails. mcp = local Cursor + Playwright MCP. cloud = Cursor Cloud script rewrite')
    string(name: 'CURSOR_CLOUD_MODEL', defaultValue: 'composer-2.5', description: 'Cursor model id used only on failure')
  }

  environment {
    PATH = "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:${env.PATH}"
    RUNNER_DIR = "${params.RUNNER_DIR}"
    NLP_REPO = "${params.NLP_REPO}"
    NLP_REF = "${params.NLP_REF}"
    NLP_FILE = "${params.NLP_FILE}"
    HEADED = "${params.HEADED}"
    CURSOR_HEAL_WITH = "${params.CURSOR_HEAL_WITH}"
    CURSOR_CLOUD_MODEL = "${params.CURSOR_CLOUD_MODEL}"
    CI = 'true'
  }

  stages {
    stage('Checkout runner') {
      steps {
        sh '''
          set -e
          if [ ! -d "${RUNNER_DIR:-}" ]; then
            echo "Set RUNNER_DIR to the local Automation-R-D checkout."
            exit 1
          fi
          # Always refresh. A leftover workspace copy still had CURSOR_RUNTIME=cloud.
          rsync -a --exclude node_modules --exclude nlp-src --exclude .git "${RUNNER_DIR}/" "${WORKSPACE}/"
          test -f scripts/jenkins-run.ts
          test -f package.json
          echo "[jenkins] runner from ${RUNNER_DIR} heal=${CURSOR_HEAL_WITH:-} headed=${HEADED:-} nlp=${NLP_FILE:-}"
        '''
      }
    }

    stage('Pull NLP') {
      steps {
        dir('nlp-src') {
          script {
            def remote = [url: params.NLP_REPO]
            if (params.NLP_GIT_CREDENTIALS?.trim()) {
              remote.credentialsId = params.NLP_GIT_CREDENTIALS.trim()
            }
            checkout([
              $class: 'GitSCM',
              branches: [[name: params.NLP_REF]],
              userRemoteConfigs: [remote]
            ])
          }
        }
        script {
          env.NLP_ROOT = "${env.WORKSPACE}/nlp-src"
          env.NLP_FILE = params.NLP_FILE
        }
        sh 'test -d "$NLP_ROOT/tests/nlp"'
      }
    }

    stage('Local Playwright (LLM only on failure)') {
      steps {
        sh '''
          node -v
          npm ci
          npx playwright install chromium
        '''
        withCredentials([
          string(credentialsId: 'cursor-api-key', variable: 'CURSOR_API_KEY'),
          usernamePassword(credentialsId: 'wolken-login', usernameVariable: 'WOLKEN_USER', passwordVariable: 'WOLKEN_PASSWORD')
        ]) {
          sh '''
            if [ "$HEADED" != "true" ] && command -v xvfb-run >/dev/null 2>&1; then
              xvfb-run --auto-servernum --server-args="-screen 0 1400x900x24" npx tsx scripts/jenkins-run.ts
            else
              npx tsx scripts/jenkins-run.ts
            fi
          '''
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'nlp-src/**/*.nlp', allowEmptyArchive: true
    }
  }
}
