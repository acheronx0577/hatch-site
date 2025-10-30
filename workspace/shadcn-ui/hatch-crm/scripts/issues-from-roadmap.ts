import { Octokit } from '@octokit/rest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import YAML from 'yaml';

interface RoadmapIssue {
  title: string;
  labels?: string[];
  acceptance?: string[];
}

interface RoadmapMilestone {
  key: string;
  title: string;
  issues?: RoadmapIssue[];
}

interface RoadmapDocument {
  milestones?: RoadmapMilestone[];
}

async function ensureMilestone(gh: Octokit, owner: string, repo: string, title: string) {
  const existing = await gh.issues.listMilestones({
    owner,
    repo,
    state: 'open'
  });

  const match = existing.data.find((milestone) => milestone.title === title);
  if (match) {
    return match.number;
  }

  const created = await gh.issues.createMilestone({
    owner,
    repo,
    title
  });
  return created.data.number;
}

async function issueExists(
  gh: Octokit,
  owner: string,
  repo: string,
  marker: string
): Promise<boolean> {
  const search = await gh.search.issuesAndPullRequests({
    q: `repo:${owner}/${repo} "${marker}" in:body`
  });
  return search.data.total_count > 0;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY ?? '';

  if (!token) {
    throw new Error('GITHUB_TOKEN is required');
  }
  if (!repository.includes('/')) {
    throw new Error('GITHUB_REPOSITORY must be formatted as owner/name');
  }

  const [owner, repo] = repository.split('/');
  const gh = new Octokit({ auth: token });

  const roadmapPath = join(__dirname, '..', '.meta', 'roadmap.yaml');
  const document = YAML.parse(readFileSync(roadmapPath, 'utf8')) as RoadmapDocument;

  for (const milestone of document.milestones ?? []) {
    const milestoneNumber = await ensureMilestone(gh, owner, repo, milestone.title);
    for (const issue of milestone.issues ?? []) {
      const marker = `${milestone.key}::${issue.title}`;
      if (await issueExists(gh, owner, repo, marker)) {
        continue;
      }

      const bodyLines = [
        'Automated from `.meta/roadmap.yaml`',
        '',
        '**Acceptance**:',
        ...(issue.acceptance?.map((line) => `- [ ] ${line}`) ?? ['- [ ] TBD']),
        '',
        `ROADMAP-KEY: ${marker}`
      ];

      await gh.issues.create({
        owner,
        repo,
        title: issue.title,
        body: bodyLines.join('\n'),
        labels: issue.labels ?? [],
        milestone: milestoneNumber
      });

      // eslint-disable-next-line no-console
      console.log(`Created issue: ${issue.title}`);
    }
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
