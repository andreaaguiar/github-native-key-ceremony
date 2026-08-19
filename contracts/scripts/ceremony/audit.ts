// Audit report for one ceremony run, pulled from GitHub's API with the
// caller's own token so it doesn't depend on what the deploy job logged.
//
// Usage: TAG=v1.2.3 GITHUB_REPOSITORY=owner/repo GITHUB_TOKEN=... npm run ceremony:audit
import { githubJson, API } from "./github-api.js";

interface Commit {
  sha: string;
}

interface WorkflowRun {
  id: number;
  html_url: string;
  status: string;
  conclusion: string | null;
}

interface WorkflowRunsResponse {
  workflow_runs: WorkflowRun[];
}

interface Approval {
  state: "approved" | "rejected" | "pending";
  user: { login: string };
  comment: string;
  environments: { name: string }[];
}

const WORKFLOW_FILE = "contracts-deploy.yml";

async function main() {
  const tag = process.env.TAG;
  const token = process.env.GITHUB_TOKEN;
  const repoSlug = process.env.GITHUB_REPOSITORY;
  if (!tag || !token || !repoSlug) {
    throw new Error("Set TAG, GITHUB_TOKEN, and GITHUB_REPOSITORY (owner/repo) before running this.");
  }
  const [owner, repo] = repoSlug.split("/");

  const commit = await githubJson<Commit>(`${API}/repos/${owner}/${repo}/commits/${tag}`, token);

  const runs = await githubJson<WorkflowRunsResponse>(
    `${API}/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?head_sha=${commit.sha}`,
    token,
  );
  const run = runs.workflow_runs[0];
  if (!run) {
    throw new Error(`No ${WORKFLOW_FILE} run found for tag ${tag} (commit ${commit.sha}).`);
  }

  const approvals = await githubJson<Approval[]>(
    `${API}/repos/${owner}/${repo}/actions/runs/${run.id}/approvals`,
    token,
  );

  console.log(`Ceremony audit — ${tag}`);
  console.log(`Commit:     ${commit.sha}`);
  console.log(`Run:        ${run.html_url}`);
  console.log(`Conclusion: ${run.conclusion ?? run.status}`);
  console.log("");

  if (approvals.length === 0) {
    console.log("No recorded environment approvals for this run.");
    console.log("Required Reviewers stops a run before it reaches the deploy job.");
    console.log("If it is configured, investigate how this run reached that job.");
    return;
  }

  for (const approval of approvals) {
    const envNames = approval.environments.map((environment) => environment.name).join(", ");
    const comment = approval.comment ? ` — "${approval.comment}"` : "";
    console.log(`${envNames}: ${approval.state} by ${approval.user.login}${comment}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
