/**
 * Writes `src/legal/licenses.json` — the third-party components the shipped app
 * contains, with each one's license and notice text, for Settings → Open-source
 * licenses. Every row comes from what the build actually uses; nothing is typed
 * in by hand:
 *
 *   JavaScript  packages in the Metro bundle (source-map `node_modules` paths of
 *               an `expo export`) + the Pear worklet bundle + every autolinked
 *               native package; text = the package's LICENSE / NOTICE files.
 *   iOS         pods in `ios/Podfile.lock` that no npm package provides; text =
 *               CocoaPods' acknowledgements, else the pod's own LICENSE file.
 *   Android     the release runtime classpath (`gradlew :app:dependencies`);
 *               license name from each artifact's POM, text = the canonical
 *               Apache-2.0 / LGPL-2.1 / MPL-2.0 text in `scripts/license-texts/`
 *               (also the fallback for any row whose package ships no file).
 *   Rust        crates linked into libsemaphore_bindings (`cargo metadata`,
 *               normal dependencies only); text = each crate's LICENSE files.
 *   Fonts       Inter and DM Sans (SIL OFL 1.1, `scripts/license-texts/`).
 *
 * Usage (from apps/expo; the export and the two dependency dumps are slow, so
 * they are inputs rather than run here):
 *
 *   bunx expo export --platform ios --platform android --source-maps --output-dir /tmp/creds-export
 *   (cd android && ./gradlew :app:dependencies --configuration releaseRuntimeClasspath -q) > /tmp/android-deps.txt
 *   for t in aarch64-apple-ios aarch64-linux-android; do (cd ../../nitro-modules/attest/semaphore/rust &&
 *     cargo metadata --format-version 1 --locked --filter-platform $t) > /tmp/cargo-$t.json; done
 *   bun scripts/export-licenses.ts /tmp/creds-export /tmp/android-deps.txt /tmp/cargo-aarch64-apple-ios.json,/tmp/cargo-aarch64-linux-android.json
 *
 * Re-run after adding, removing or upgrading a dependency.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

interface Item {
  name: string;
  /** Empty when the component has no version of its own (the fonts). */
  version: string;
  license: string;
  url?: string;
  /** Index into `texts`; absent when the component ships no license text. */
  text?: number;
}

const [exportDir, androidDepsFile, cargoMetadataFile] = process.argv.slice(2);
if (exportDir === undefined || androidDepsFile === undefined || cargoMetadataFile === undefined) {
  console.error('usage: bun scripts/export-licenses.ts <expo export dir> <gradle deps txt> <cargo metadata json>');
  process.exit(1);
}

const APP = resolve(import.meta.dir, '..');
const ROOT = resolve(APP, '../..');
const TEXTS_DIR = join(APP, 'scripts/license-texts');

// Identical texts are stored once.
const texts: string[] = [];
const textIndex = new Map<string, number>();
function addText(text: string | undefined): number | undefined {
  const t = text?.trim();
  if (!t) return undefined;
  let i = textIndex.get(t);
  if (i === undefined) {
    i = texts.length;
    texts.push(t);
    textIndex.set(t, i);
  }
  return i;
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;
function licenseFilesText(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f) && statSync(join(dir, f)).isFile())
    .sort((a, b) => Number(/^notice/i.test(a)) - Number(/^notice/i.test(b)) || a.localeCompare(b));
  if (files.length === 0) return undefined;
  return files.map((f) => readFileSync(join(dir, f), 'utf8').trim()).join('\n\n');
}

function repoUrl(pkg: { repository?: string | { url?: string }; homepage?: string }): string | undefined {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (raw) {
    const gh = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(raw);
    if (gh) return `https://github.com/${gh[1]}`;
    return raw.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https://').replace(/\.git$/, '');
  }
  return pkg.homepage;
}

// Full texts for licenses whose text is the same for every component.
const canonical = (file: string): string => readFileSync(join(TEXTS_DIR, file), 'utf8');
function canonicalText(licenseName: string): string | undefined {
  if (/apache/i.test(licenseName)) return canonical('Apache-2.0.txt');
  if (/lesser general public|\blgpl\b/i.test(licenseName)) return canonical('LGPL-2.1.txt');
  if (/\bmpl-2\.0\b|mozilla public license/i.test(licenseName)) return canonical('MPL-2.0.txt');
  return undefined;
}

// ── JavaScript ──────────────────────────────────────────────────────────────

function packageNamesInSourceMaps(dir: string): Set<string> {
  const names = new Set<string>();
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.map')) {
        const map = JSON.parse(readFileSync(p, 'utf8')) as { sources: string[] };
        for (const s of map.sources) addNodeModulesName(s, names);
      }
    }
  };
  walk(dir);
  return names;
}

function addNodeModulesName(path: string, into: Set<string>): void {
  const m = /.*node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(path);
  if (m) into.add(m[1]);
}

/** Node-style lookup from `fromDir` upwards, stopping at the repo root. */
function findPackageDir(name: string, fromDir: string): string | undefined {
  for (let d = fromDir; d.startsWith(ROOT); d = dirname(d)) {
    const p = join(d, 'node_modules', name);
    if (existsSync(join(p, 'package.json'))) return p;
    if (d === ROOT) break;
  }
  return undefined;
}

const jsNames = packageNamesInSourceMaps(exportDir);
const workletBundle = readFileSync(join(APP, 'pear/worklet/dist/index.bundle.js'), 'utf8');
for (const m of workletBundle.matchAll(/"\/node_modules\/((?:@[^/"]+\/)?[^/"]+)\//g)) jsNames.add(m[1]);
const appPkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
const nativeDirs: string[] = [];
for (const name of Object.keys(appPkg.dependencies)) {
  const dir = findPackageDir(name, APP);
  if (dir === undefined) continue;
  if (['ios', 'android'].some((p) => existsSync(join(dir, p))) || readdirSync(dir).some((f) => f.endsWith('.podspec'))) {
    jsNames.add(name);
    nativeDirs.push(dir);
  }
}

const jsItems: Item[] = [];
const jsSeen = new Set<string>();
for (const name of [...jsNames].sort()) {
  if (name.startsWith('@solidarity/')) continue; // this repo
  const dir = findPackageDir(name, APP) ?? findPackageDir(name, join(APP, 'pear/worklet'));
  if (dir === undefined) {
    console.warn(`js: ${name} is bundled but not installed — skipped`);
    continue;
  }
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    name: string; version: string; license?: string | { type: string }; licenses?: { type: string }[];
    repository?: string | { url?: string }; homepage?: string;
  };
  const key = `${pkg.name}@${pkg.version}`;
  if (jsSeen.has(key)) continue;
  jsSeen.add(key);
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? pkg.licenses?.map((l) => l.type).join(' OR ') ?? 'UNKNOWN';
  jsItems.push({ name: pkg.name, version: pkg.version, license, url: repoUrl(pkg), text: addText(licenseFilesText(dir) ?? canonicalText(license)) });
}

// ── iOS ─────────────────────────────────────────────────────────────────────

const podfileLock = readFileSync(join(APP, 'ios/Podfile.lock'), 'utf8');
const podVersions = new Map<string, string>();
for (const m of podfileLock.split('\nDEPENDENCIES:')[0].matchAll(/^ {2}- "?([^ /"(]+)[^ ]* \(([^)]+)\)/gm)) {
  if (!podVersions.has(m[1])) podVersions.set(m[1], m[2]);
}
// Pods an npm package provides are covered by that package's row.
const npmPods = new Set<string>();
const podspecNames = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith('.podspec')).map((f) => f.replace(/\.podspec$/, ''));
for (const dir of nativeDirs) {
  for (const sub of [dir, join(dir, 'ios'), join(dir, 'apple')]) if (existsSync(sub)) podspecNames(sub).forEach((n) => npmPods.add(n));
}
const reactNative = findPackageDir('react-native', APP);
if (reactNative === undefined) throw new Error('react-native is not installed');
const rnPodspecs: string[] = [];
const findPodspecs = (d: string): void => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (f === 'node_modules') continue;
    if (statSync(p).isDirectory()) findPodspecs(p);
    else if (f.endsWith('.podspec')) rnPodspecs.push(p);
  }
};
findPodspecs(reactNative);
const rnThirdParty = new Map<string, string>(); // vendored C++ libraries React Native builds
for (const file of rnPodspecs) {
  const name = file.split('/').pop()!.replace(/\.podspec$/, '');
  if (file.includes('third-party-podspecs')) {
    const lic = /\.license\s*=\s*\{?[^'"]*['"]([^'"]+)['"]/.exec(readFileSync(file, 'utf8'))?.[1];
    rnThirdParty.set(name, lic ?? 'UNKNOWN');
  } else npmPods.add(name);
}
for (const local of ['Attest', 'Keystone', 'SemaphoreBindings']) npmPods.add(local); // this repo (Rust crates below)

const ackPlist = join(APP, 'ios/Pods/Target Support Files/Pods-Solidarity/Pods-Solidarity-acknowledgements.plist');
const acks = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', ackPlist], { encoding: 'utf8' })) as {
  PreferenceSpecifiers: { Title?: string; License?: string; FooterText?: string }[];
};
const ackByPod = new Map(acks.PreferenceSpecifiers.filter((a) => a.License).map((a) => [a.Title!, a]));

// The pod's own spec: a local path (EXTERNAL SOURCES) or the CocoaPods trunk.
const externalPaths = new Map<string, string>();
for (const m of (podfileLock.split('\nEXTERNAL SOURCES:')[1] ?? '').matchAll(/^ {2}([^\s:]+):\n {4}:path: "?([^"\n]+)"?/gm)) {
  externalPaths.set(m[1], resolve(APP, 'ios', m[2]));
}
const TRUNK = join(homedir(), '.cocoapods/repos/trunk/Specs');
function specLicense(pod: string, version: string): string | undefined {
  const local = externalPaths.get(pod);
  const candidates = local
    ? readdirSync(local).filter((f) => f.startsWith(`${pod}.podspec`)).map((f) => join(local, f))
    : execFileSync('find', [TRUNK, '-path', `*/${pod}/${version}/${pod}.podspec.json`], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  for (const file of candidates) {
    const spec = readFileSync(file, 'utf8');
    if (file.endsWith('.json')) {
      const lic = (JSON.parse(spec) as { license?: string | { type?: string } }).license;
      const type = typeof lic === 'string' ? lic : lic?.type;
      if (type) return type;
    }
    const m = /\.license\s*=\s*(?:\{\s*:type\s*=>\s*)?['"]([^'"]+)['"]/.exec(spec);
    if (m) return m[1];
  }
  return undefined;
}

const iosItems: Item[] = [];
for (const [pod, version] of [...podVersions].sort(([a], [b]) => a.localeCompare(b))) {
  if (npmPods.has(pod) || pod.startsWith('Expo') || pod.startsWith('EX') || pod.startsWith('React')) continue;
  const ack = ackByPod.get(pod);
  const license = ack?.License ?? specLicense(pod, version) ?? rnThirdParty.get(pod) ?? 'UNKNOWN';
  const text = ack?.FooterText ?? licenseFilesText(join(APP, 'ios/Pods', pod)) ?? canonicalText(license);
  iosItems.push({ name: pod, version, license, text: addText(text) });
}

// ── Android ─────────────────────────────────────────────────────────────────

const GRADLE_CACHE = join(homedir(), '.gradle/caches/modules-2/files-2.1');
// Gradle keeps only the artifact for many cached versions, not the POM; fetch
// those from the repositories the app resolves from (android/build.gradle).
const MAVEN_REPOS = ['https://dl.google.com/dl/android/maven2', 'https://repo1.maven.org/maven2', 'https://www.jitpack.io'];
const fetchedPoms = new Map<string, string | undefined>();
async function fetchPom(group: string, artifact: string, version: string): Promise<void> {
  const key = `${group}:${artifact}:${version}`;
  if (fetchedPoms.has(key) || readCachedPom(group, artifact, version) !== undefined) return;
  fetchedPoms.set(key, undefined);
  for (const repo of MAVEN_REPOS) {
    const res = await fetch(`${repo}/${group.replaceAll('.', '/')}/${artifact}/${version}/${artifact}-${version}.pom`);
    if (res.ok) {
      const pom = await res.text();
      fetchedPoms.set(key, pom);
      const parent = /<parent>([\s\S]*?)<\/parent>/.exec(pom)?.[1];
      if (parent && !/<licenses>/.test(pom)) {
        const tag = (t: string): string => new RegExp(`<${t}>\\s*([^<]*?)\\s*</${t}>`).exec(parent)?.[1] ?? '';
        await fetchPom(tag('groupId'), tag('artifactId'), tag('version'));
      }
      return;
    }
  }
}
function readPom(group: string, artifact: string, version: string): string | undefined {
  return readCachedPom(group, artifact, version) ?? fetchedPoms.get(`${group}:${artifact}:${version}`);
}
function readCachedPom(group: string, artifact: string, version: string): string | undefined {
  // A Kotlin-multiplatform artifact resolves to its `-jvm` / `-android` variant,
  // which is the one whose POM is in the cache.
  for (const name of [artifact, `${artifact}-jvm`, `${artifact}-android`]) {
    const dir = join(GRADLE_CACHE, group, name, version);
    if (!existsSync(dir)) continue;
    for (const hash of readdirSync(dir)) {
      const pom = join(dir, hash, `${name}-${version}.pom`);
      if (existsSync(pom)) return readFileSync(pom, 'utf8');
    }
  }
  return undefined;
}
function pomLicenses(group: string, artifact: string, version: string, depth = 0): { name: string; url?: string }[] {
  const pom = readPom(group, artifact, version);
  if (pom === undefined || depth > 5) return [];
  const block = /<licenses>([\s\S]*?)<\/licenses>/.exec(pom)?.[1];
  if (block) {
    return [...block.matchAll(/<license>([\s\S]*?)<\/license>/g)].map((m) => ({
      name: /<name>\s*([\s\S]*?)\s*<\/name>/.exec(m[1])?.[1] ?? 'UNKNOWN',
      url: /<url>\s*([\s\S]*?)\s*<\/url>/.exec(m[1])?.[1],
    }));
  }
  const parent = /<parent>([\s\S]*?)<\/parent>/.exec(pom)?.[1];
  if (!parent) return [];
  const tag = (t: string): string => new RegExp(`<${t}>\\s*([^<]*?)\\s*</${t}>`).exec(parent)?.[1] ?? '';
  return pomLicenses(tag('groupId'), tag('artifactId'), tag('version'), depth + 1);
}

const androidDeps = new Map<string, { group: string; artifact: string; version: string }>();
for (const m of readFileSync(androidDepsFile, 'utf8').matchAll(/[+\\]--- ([\w.-]+):([\w.-]+):([^\s]+)(?: -> ([^\s]+))?/g)) {
  const [, group, artifact, requested, resolved] = m;
  const key = `${group}:${artifact}`;
  // React Native and Expo modules are built from their npm packages (JS rows).
  if (androidDeps.has(key) || group === 'com.facebook.react' || group === 'host.exp.exponent' || group.startsWith('expo.modules')) continue;
  androidDeps.set(key, { group, artifact, version: resolved ?? requested });
}
for (const { group, artifact, version } of androidDeps.values()) await fetchPom(group, artifact, version);
const androidItems: Item[] = [];
for (const [key, { group, artifact, version }] of androidDeps) {
  const licenses = pomLicenses(group, artifact, version);
  const license = licenses.map((l) => l.name).join(' / ') || 'UNKNOWN';
  // The project's own <url>, not the ones inside <licenses>, <scm>, <parent>…
  const pomTop = readPom(group, artifact, version)?.replace(/<(licenses|scm|parent|developers|organization|issueManagement|distributionManagement)>[\s\S]*?<\/\1>/g, '');
  const url = pomTop === undefined ? undefined : /<url>\s*([^<]*?)\s*<\/url>/.exec(pomTop)?.[1];
  androidItems.push({
    name: key, version, license, url,
    text: addText(licenses.map((l) => canonicalText(l.name)).find((t) => t !== undefined)),
  });
}
androidItems.sort((a, b) => a.name.localeCompare(b.name));

// ── Rust ────────────────────────────────────────────────────────────────────

// One `cargo metadata --filter-platform <target>` dump per shipped target,
// comma-separated, so host-only and Windows crates drop out.
interface CargoMetadata {
  packages: {
    id: string; name: string; version: string; license?: string; repository?: string; manifest_path: string;
    targets: { kind: string[] }[];
  }[];
  resolve: { root: string; nodes: { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }[] };
}
const cargoDumps = cargoMetadataFile.split(',').map((f) => JSON.parse(readFileSync(f, 'utf8')) as CargoMetadata);
const cargoRoot = cargoDumps[0].resolve.root;
const crates = new Map(cargoDumps.flatMap((m) => m.packages.map((p) => [p.id, p] as const)));
const linked = new Set<string>();
for (const dump of cargoDumps) {
  const nodes = new Map(dump.resolve.nodes.map((n) => [n.id, n]));
  const stack = [dump.resolve.root];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    // A proc-macro runs in the compiler and is not linked into the library.
    if (crates.get(id)?.targets.some((t) => t.kind.includes('proc-macro'))) continue;
    linked.add(id);
    for (const dep of nodes.get(id)?.deps ?? []) {
      if (dep.dep_kinds.some((k) => k.kind === null)) stack.push(dep.pkg);
    }
  }
}
const rustItems: Item[] = [...crates.values()]
  .filter((p) => linked.has(p.id) && p.id !== cargoRoot)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((p) => ({
    name: p.name, version: p.version, license: p.license ?? 'UNKNOWN', url: p.repository,
    text: addText(licenseFilesText(dirname(p.manifest_path)) ?? canonicalText(p.license ?? '')),
  }));

// ── Fonts ───────────────────────────────────────────────────────────────────

const fontItems: Item[] = [
  { name: 'Inter', version: '', license: 'OFL-1.1', url: 'https://github.com/rsms/inter', text: addText(canonical('Inter-OFL.txt')) },
  { name: 'DM Sans', version: '', license: 'OFL-1.1', url: 'https://github.com/googlefonts/dm-fonts', text: addText(canonical('DMSans-OFL.txt')) },
];

const groups = [
  { id: 'js', items: jsItems },
  { id: 'ios', items: iosItems },
  { id: 'android', items: androidItems },
  { id: 'rust', items: rustItems },
  { id: 'fonts', items: fontItems },
];
const out = join(APP, 'src/legal/licenses.json');
writeFileSync(out, `${JSON.stringify({ groups, texts })}\n`);
for (const g of groups) {
  const missing = g.items.filter((i) => i.text === undefined).length;
  console.log(`${g.id}: ${g.items.length} (${missing} without a license text)`);
}
console.log(`wrote ${out} (${texts.length} distinct texts)`);
