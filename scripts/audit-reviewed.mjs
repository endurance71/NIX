import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const policy = JSON.parse(readFileSync(new URL('../security/dependency-exceptions.json', import.meta.url)));
const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url))).expo;
let output;
try {
  output = execFileSync('npm', ['audit', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
} catch (error) {
  if (error.status !== 1 || !error.stdout) throw error;
  output = error.stdout;
}
const report = JSON.parse(output);
if (report.error || !report.vulnerabilities) throw new Error('npm audit could not return a complete report');
const reviewDeadline = Date.parse(policy.reviewBy);
if (!Number.isFinite(reviewDeadline) || Date.now() >= reviewDeadline) throw new Error('Dependency exceptions require a new review');
if (app.updates?.codeSigningCertificate || app.updates?.codeSigningMetadata) {
  throw new Error('node-forge exception requires a new review before enabling update code signing');
}
const failures = [];
function causes(name, visited = new Set()) {
  if (visited.has(name)) return [];
  visited.add(name);
  const vulnerability = report.vulnerabilities[name];
  if (!vulnerability) return [{ dependency: name, url: 'unresolved' }];
  return vulnerability.via.flatMap((cause) =>
    typeof cause === 'string' ? causes(cause, visited) : [cause]);
}
for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
  if (!['high', 'critical'].includes(vulnerability.severity)) continue;
  const advisories = causes(name);
  if (!advisories.length) failures.push(`${name}: unresolved advisory chain`);
  for (const advisory of advisories) {
    const exception = policy.exceptions.find((item) => item.package === advisory.dependency && item.advisory === advisory.url);
    if (!exception) failures.push(`${name}: unreviewed ${advisory.url}`);
    else {
      const nodes = report.vulnerabilities[exception.package]?.nodes;
      if (!nodes?.length) failures.push(`${exception.package}: installed locations missing; review required`);
      for (const location of nodes ?? []) {
        if (!location.startsWith('node_modules/') || location.split('/').includes('..')) {
          failures.push(`${exception.package}: unexpected installed location`);
          continue;
        }
        const installed = JSON.parse(readFileSync(new URL(`../${location}/package.json`, import.meta.url)));
        if (installed.version !== exception.version) failures.push(`${exception.package}: version changed; review required`);
      }
    }
  }
}
if (failures.length) throw new Error([...new Set(failures)].join('\n'));
console.log(`Reviewed dependency gate passed: ${report.metadata.vulnerabilities.total} reported findings; known exceptions remain visible in npm audit.`);
