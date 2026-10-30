#!/usr/bin/env node
/**
 * Build, host and publish a new Flux release in one step.
 *
 *   npm run release -- --notes "Fixed SMS reading for JazzCash"
 *
 * 1. Bumps the version name in app.json (patch by default). The build number
 *    (Android versionCode) is incremented by EAS itself (eas.json autoIncrement).
 * 2. Runs the EAS production build and waits for it.
 * 3. Downloads the APK and attaches it to a GitHub Release, which — unlike an
 *    EAS artifact link — never expires.
 * 4. Inserts the version into Supabase `app_versions`. Every installed copy of
 *    Flux checks that table on launch and offers the update.
 *
 * Options:
 *   --notes "<text>"     What's new (shown in the update popup). Use \n for new lines.
 *   --notes-file <path>  Read the notes from a file instead.
 *   --mandatory          Users can't dismiss the popup.
 *   --bump <kind>        patch (default) | minor | major | none
 *   --build-id <id>      Publish an already finished EAS build instead of building.
 *   --host <where>       github (default) | eas (EAS link — expires after 30 days)
 *   --check              Only verify the setup (env, table, GitHub access) and exit.
 *
 * Needs in .env: EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * (Supabase → Project Settings → API → service_role). Never ship that key in
 * the app — it only lives in your local .env, which is git-ignored.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appJsonPath = join(root, 'app.json');

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const step = (msg) => console.log(`\n${c.bold('▸')} ${c.bold(msg)}`);
const info = (msg) => console.log(`  ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow('!')} ${msg}`);

function fail(msg) {
  console.error(`\n${c.red('✗')} ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { bump: 'patch', host: 'github', mandatory: false, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      return v;
    };
    if (a === '--notes') args.notes = value().replace(/\\n/g, '\n');
    else if (a === '--notes-file') args.notesFile = value();
    else if (a === '--mandatory') args.mandatory = true;
    else if (a === '--bump') args.bump = value();
    else if (a === '--build-id') args.buildId = value();
    else if (a === '--host') args.host = value();
    else if (a === '--check') args.check = true;
    else if (a === '--help' || a === '-h') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
      process.exit(0);
    } else fail(`Unknown option: ${a}`);
  }
  if (!['patch', 'minor', 'major', 'none'].includes(args.bump)) fail('--bump must be patch, minor, major or none');
  if (!['github', 'eas'].includes(args.host)) fail('--host must be github or eas');
  return args;
}

/** Run a command; resolves with its stdout. stderr streams to the terminal. */
function run(cmd, cmdArgs, { shell = false, capture = true, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: root,
      shell,
      stdio: [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'],
    });
    let out = '';
    if (capture) child.stdout.on('data', (d) => (out += d));
    if (input !== undefined) child.stdin.end(input);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} ${cmdArgs.join(' ')} exited with code ${code}`))
    );
  });
}

/** Run a command quietly; resolves with { ok, out }. */
function probe(cmd, cmdArgs, { shell = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, { cwd: root, shell, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', () => resolve({ ok: false, out }));
    child.on('close', (code) => resolve({ ok: code === 0, out }));
  });
}

function bumpVersion(version, kind) {
  const [major, minor, patch] = version.split('.').map((n) => parseInt(n, 10) || 0);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// ---------------------------------------------------------------------------
// Supabase (PostgREST over plain fetch — no SDK needed)
// ---------------------------------------------------------------------------

function supabaseConfig() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail('EXPO_PUBLIC_SUPABASE_URL is missing from .env');
  if (!key) {
    fail(
      'SUPABASE_SERVICE_ROLE_KEY is missing from .env.\n' +
        '  Add it from Supabase → Project Settings → API → service_role (keep it secret;\n' +
        '  .env is git-ignored and the key is never bundled into the app).'
    );
  }
  return { url: url.replace(/\/$/, ''), key };
}

async function supabase(path, { method = 'GET', body, prefer } = {}) {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = data?.message || text || res.statusText;
    throw new Error(`Supabase ${method} ${path}: ${res.status} ${detail}`);
  }
  return data;
}

async function latestPublished() {
  try {
    const rows = await supabase(
      'app_versions?select=version_name,version_code,created_at&platform=eq.android&order=version_code.desc&limit=1'
    );
    return rows?.[0] ?? null;
  } catch (err) {
    if (/app_versions|42P01|PGRST205|does not exist/i.test(String(err.message))) {
      fail(
        'The app_versions table does not exist yet.\n' +
          '  Run supabase-app-versions.sql once in the Supabase SQL Editor, then try again.'
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

async function githubRepo() {
  const { ok, out } = await probe('git', ['remote', 'get-url', 'origin']);
  if (!ok) fail('No git remote "origin" — needed to know where to publish the APK. Use --host eas instead.');
  const m = out.trim().match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) fail(`origin (${out.trim()}) is not a GitHub repository. Use --host eas instead.`);
  return { owner: m[1], repo: m[2] };
}

async function checkGithub() {
  const gh = await probe('gh', ['auth', 'status']);
  if (!gh.ok) fail('GitHub CLI is not installed or not signed in. Run "gh auth login", or use --host eas.');
  return githubRepo();
}

// ---------------------------------------------------------------------------
// Release notes
// ---------------------------------------------------------------------------

async function defaultNotes() {
  const lastTag = await probe('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*']);
  const range = lastTag.ok ? [`${lastTag.out.trim()}..HEAD`] : ['-n', '8'];
  const log = await probe('git', ['log', '--no-merges', '--pretty=%s', ...range]);
  const lines = log.out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^(feat|fix|refactor|chore|perf|docs|style|test|build|ci)(\(.+?\))?!?:\s*/i, ''))
    .map((l) => `• ${l.charAt(0).toUpperCase()}${l.slice(1)}`);
  return lines.length > 0 ? lines.join('\n') : 'Bug fixes and improvements.';
}

async function resolveNotes(args) {
  if (args.notesFile) return readFileSync(args.notesFile, 'utf8').trim();
  if (args.notes) return args.notes.trim();
  const fallback = await defaultNotes();
  if (!process.stdin.isTTY) return fallback;
  console.log(c.dim('\n  Suggested notes (from recent commits):\n') + fallback.replace(/^/gm, '    '));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `\n  What's new in this release? ${c.dim('(Enter = use the suggestion; "|" starts a new line)')}\n  > `
  );
  rl.close();
  return answer.trim() ? answer.split('|').map((s) => s.trim()).filter(Boolean).join('\n') : fallback;
}

// ---------------------------------------------------------------------------
// EAS
// ---------------------------------------------------------------------------

const isWindows = process.platform === 'win32';

async function buildWithEas() {
  info(c.dim('This takes a while. The EAS log streams below.'));
  const out = await run(
    'eas',
    ['build', '--platform', 'android', '--profile', 'production', '--non-interactive', '--wait', '--json'],
    { shell: isWindows }
  );
  const builds = JSON.parse(out.slice(out.indexOf('[')));
  return builds[0];
}

async function viewEasBuild(id) {
  const out = await run('eas', ['build:view', id, '--json'], { shell: isWindows });
  return JSON.parse(out.slice(out.indexOf('{')));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    process.loadEnvFile(join(root, '.env'));
  } catch {
    // Values may come from the real environment instead.
  }

  step('Checking setup');
  const previous = await latestPublished();
  info(
    previous
      ? `Latest published: ${previous.version_name} (build ${previous.version_code})`
      : 'No version published yet — this will be the first.'
  );
  const repo = args.host === 'github' ? await checkGithub() : null;
  if (repo) info(`APK host: GitHub Releases on ${repo.owner}/${repo.repo}`);
  else warn('APK host: EAS artifact link. It stops working after about 30 days.');
  if (args.check) {
    console.log(`\n${c.green('✓')} Ready to release.\n`);
    return;
  }

  const notes = await resolveNotes(args);

  // Version name ------------------------------------------------------------
  const appJsonOriginal = readFileSync(appJsonPath, 'utf8');
  let build;
  if (args.buildId) {
    step(`Fetching EAS build ${args.buildId}`);
    build = await viewEasBuild(args.buildId);
  } else {
    if (args.bump !== 'none') {
      const appJson = JSON.parse(appJsonOriginal);
      const from = appJson.expo.version;
      appJson.expo.version = bumpVersion(from, args.bump);
      writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
      step(`Version ${from} → ${appJson.expo.version}`);
    }

    step('Building with EAS (production)');
    try {
      build = await buildWithEas();
    } catch (err) {
      writeFileSync(appJsonPath, appJsonOriginal);
      fail(`EAS build failed: ${err.message}\n  app.json was restored.`);
    }
  }

  if (build?.status !== 'FINISHED') fail(`EAS build is ${build?.status ?? 'missing'}, not FINISHED.`);
  const easUrl = build.artifacts?.buildUrl || build.artifacts?.applicationArchiveUrl;
  const versionName = build.appVersion;
  const versionCode = parseInt(build.appBuildVersion, 10);
  if (!easUrl || !versionName || !versionCode) fail('EAS build has no APK link or version information.');
  info(`Built ${versionName} (build ${versionCode}) — ${easUrl}`);

  if (previous && versionCode <= previous.version_code) {
    fail(
      `Build ${versionCode} is not newer than the published build ${previous.version_code}.\n` +
        '  Devices would never be offered it. Check that eas.json has "autoIncrement": true\n' +
        '  for the production profile, then build again.'
    );
  }

  // Download + host ---------------------------------------------------------
  step('Downloading APK');
  const res = await fetch(easUrl);
  if (!res.ok) fail(`Could not download the APK: ${res.status} ${res.statusText}`);
  const tmp = mkdtempSync(join(tmpdir(), 'flux-release-'));
  const assetName = `flux-${versionName}-build${versionCode}.apk`;
  const apkPath = join(tmp, assetName);
  writeFileSync(apkPath, Buffer.from(await res.arrayBuffer()));
  const apkSize = statSync(apkPath).size;
  info(`${(apkSize / 1024 / 1024).toFixed(1)} MB`);

  let apkUrl = easUrl;
  try {
    if (repo) {
      step('Publishing APK to GitHub Releases');
      const tag = `v${versionName}-build${versionCode}`;
      const notesPath = join(tmp, 'notes.md');
      writeFileSync(notesPath, notes);
      const repoArg = `${repo.owner}/${repo.repo}`;
      const exists = await probe('gh', ['release', 'view', tag, '--repo', repoArg]);
      if (exists.ok) {
        await run('gh', ['release', 'upload', tag, apkPath, '--clobber', '--repo', repoArg], { capture: false });
      } else {
        await run(
          'gh',
          ['release', 'create', tag, apkPath, '--repo', repoArg, '--title', `Flux ${versionName} (build ${versionCode})`, '--notes-file', notesPath, '--latest'],
          { capture: false }
        );
      }
      apkUrl = `https://github.com/${repoArg}/releases/download/${tag}/${assetName}`;
      const head = await fetch(apkUrl, { method: 'HEAD', redirect: 'follow' });
      if (!head.ok) fail(`Uploaded, but ${apkUrl} answered ${head.status}. Is the repository public?`);
      info(apkUrl);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // Register ------------------------------------------------------------------
  step('Publishing to Flux users');
  await supabase('app_versions?on_conflict=platform,version_code', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      platform: 'android',
      version_code: versionCode,
      version_name: versionName,
      release_notes: notes,
      apk_url: apkUrl,
      apk_size_bytes: apkSize,
      mandatory: args.mandatory,
      is_active: true,
      eas_build_id: build.id,
    },
  });

  console.log(`
${c.green('✓')} ${c.bold(`Flux ${versionName} (build ${versionCode}) is live.`)}
  Everyone with Flux installed will see the update popup the next time they open it${args.mandatory ? c.yellow(' (required)') : ''}.

  Direct link (for anyone who doesn't have Flux yet):
  ${apkUrl}
${existsSync(appJsonPath) && readFileSync(appJsonPath, 'utf8') !== appJsonOriginal ? `\n  ${c.dim('app.json version was bumped — commit it:')} git commit -am "release: ${versionName}"\n` : ''}`);
}

main().catch((err) => fail(err?.stack || String(err)));
