import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const moduleRoot = fileURLToPath(new URL('../', import.meta.url));

test('manifest preserves published Foundry compatibility and required libWrapper', async () => {
  const manifest = JSON.parse(await readFile(path.join(moduleRoot, 'module.json'), 'utf8'));
  assert.equal(manifest.id, 'gga-ammo-resource-assistant');
  assert.equal(
    manifest.version,
    JSON.parse(await readFile(path.join(moduleRoot, 'package.json'), 'utf8')).version,
  );
  assert.equal(manifest.authors[0].name, 'Phil Brown');
  assert.equal(manifest.compatibility.minimum, '13');
  assert.equal(manifest.relationships.systems[0].id, 'gurps');
  assert.equal(manifest.relationships.requires[0].id, 'lib-wrapper');
  for (const file of [...manifest.esmodules, ...manifest.styles]) {
    await assert.doesNotReject(readFile(path.join(moduleRoot, file)));
  }
});

test('release documentation contains installation and hotbar instructions', async () => {
  const guide = await readFile(path.join(moduleRoot, 'USER-GUIDE.md'), 'utf8');
  const readme = await readFile(path.join(moduleRoot, 'README.md'), 'utf8');
  assert.match(guide, /Instant hotbar shooting/);
  assert.match(guide, /First-time ammunition setup/);
  assert.match(guide, /Hold \*\*Shift\*\*/);
  assert.match(guide, /Basic Set: Campaigns.*B373/s);
  assert.match(guide, /Basic Set: Characters.*B270/s);
  assert.match(guide, /Undo/);
  assert.match(readme, /Compatibility matrix/);
  assert.match(readme, /MIT License/);
  assert.doesNotMatch(readme, /Automated checks cover/);
  await assert.doesNotReject(readFile(path.join(moduleRoot, 'LICENSE'), 'utf8'));
});

test('template contains all four task views and hotbar drag data', async () => {
  const template = await readFile(path.join(moduleRoot, 'templates/ammo-assistant.hbs'), 'utf8');
  for (const view of ['isFire', 'isReload', 'isAdjust', 'isLoadouts'])
    assert.match(template, new RegExp(view));
  assert.match(template, /data-hotbar-drag/);
  assert.match(template, /Roll & spend/);
  assert.match(template, /setup-ammunition/);
  assert.match(template, /actorSearch/);
  assert.match(template, /create-magazine/);
});

test('release contains no development or test files', async () => {
  await import('../tools/build-release.mjs');
  const manifest = JSON.parse(await readFile(path.join(moduleRoot, 'module.json'), 'utf8'));
  const archive = unzipSync(
    await readFile(path.join(moduleRoot, 'dist', `${manifest.id}-v${manifest.version}.zip`)),
  );
  assert.ok(Object.keys(archive).every((name) => name.startsWith(manifest.id + '/')));
  assert.ok(
    Object.keys(archive).every(
      (name) => !/(^|\/)(tests|tools|node_modules|development|\.github)(\/|$)/.test(name),
    ),
  );
});

test('assistant surfaces and fields define matching light and dark theme colours', async () => {
  const css = await readFile(path.join(moduleRoot, 'styles/ammo-assistant.css'), 'utf8');
  assert.match(css, /--ara-surface-card:/);
  assert.match(css, /--ara-field-bg:/);
  assert.match(css, /\.theme-dark \.gga-ara/);
  assert.match(css, /\.gga-ara\.theme-dark/);
  assert.match(css, /\[data-theme=[\x22\x27]dark[\x22\x27]\] \.gga-ara/);
  assert.match(css, /\.gga-ara select,/);
  assert.doesNotMatch(css, /var\(--color-bg, white\)/);
});

test('runtime hooks refresh the assistant for synthetic ActorDelta updates', async () => {
  const source = await readFile(path.join(moduleRoot, 'scripts/module.mjs'), 'utf8');
  assert.match(source, /Hooks\.on\([\x22\x27]updateActorDelta[\x22\x27]/);
});
