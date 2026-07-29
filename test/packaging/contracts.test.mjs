import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../../backend/server/meta.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');

test('keeps package and backend versions synchronized', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.version, APP_VERSION);
});

test('Docker editions preserve data and separate basic proxy from Linux TUN', async () => {
  const [dockerfile, basic, tun] = await Promise.all([
    read('Dockerfile'),
    read('deploy/docker/compose.yaml'),
    read('deploy/docker/compose.tun.yaml')
  ]);
  assert.match(dockerfile, /WEBXRAY_DATA_DIR=\/data/);
  assert.match(dockerfile, /WEBXRAY_DISTRIBUTION=docker/);
  assert.match(dockerfile, /WEBXRAY_DEFAULT_ALLOW_LAN=true/);
  assert.match(dockerfile, /VOLUME \["\/data"\]/);
  assert.match(basic, /- "3000:3000"/);
  assert.match(basic, /127\.0\.0\.1:10808:10808\/tcp/);
  assert.doesNotMatch(basic, /NET_ADMIN|\/dev\/net\/tun|network_mode/);
  assert.match(tun, /network_mode: host/);
  assert.match(tun, /NET_ADMIN/);
  assert.match(tun, /\/dev\/net\/tun/);
  assert.match(tun, /\.\/data:\/data/);
});

test('Deb package embeds Node and keeps state outside application files', async () => {
  const [builder, control, command, service, postRemove] = await Promise.all([
    read('packaging/build-deb.sh'),
    read('packaging/debian/control.in'),
    read('packaging/linux/webxray'),
    read('packaging/linux/webxray.service'),
    read('packaging/debian/postrm')
  ]);
  assert.match(builder, /usr\/lib\/webxray\/runtime\/node/);
  assert.match(builder, /cp -R "\$root_dir\/docs"/);
  assert.doesNotMatch(control, /Depends:.*nodejs/);
  assert.match(command, /usr\/lib\/webxray\/runtime\/node/);
  assert.match(command, /runuser -u webxray/);
  assert.match(command, /doctor/);
  assert.match(service, /WEBXRAY_DATA_DIR=\/var\/lib\/webxray/);
  assert.match(service, /CAP_NET_ADMIN/);
  assert.doesNotMatch(postRemove, /rm\s+-rf|\/var\/lib\/webxray/);
});

test('Windows archive has distinct portable and service lifecycle entry points', async () => {
  const [builder, direct, install, uninstall, command, service, workflow] = await Promise.all([
    read('packaging/build-windows.sh'),
    read('packaging/windows/WebXray-Run.cmd'),
    read('packaging/windows/WebXray-Install-Service.cmd'),
    read('packaging/windows/WebXray-Uninstall-Service.cmd'),
    read('packaging/windows/webxray.cmd'),
    read('packaging/windows/WebXrayService.xml'),
    read('.github/workflows/release-packages.yml')
  ]);
  assert.match(builder, /WebXray-Uninstall-Service\.cmd/);
  assert.match(builder, /cp -R "\$root_dir\/docs"/);
  assert.match(direct, /webxray\.cmd" token/i);
  assert.match(direct, /webxray\.cmd" url/i);
  assert.match(install, /-s install/i);
  assert.match(uninstall, /-s uninstall/i);
  assert.match(uninstall, /ProgramData%\\WebXray will be kept/i);
  assert.match(command, /WEBXRAY_HOST=127\.0\.0\.1/);
  assert.match(command, /WEBXRAY_PORTABLE_DATA_DIR=%~dp0data/);
  assert.match(command, /WEBXRAY_SERVICE_DATA_DIR=%ProgramData%\\WebXray/);
  assert.doesNotMatch(command, /robocopy|xcopy|Copying existing data/i);
  assert.match(command, /\*S-1-5-18:\(OI\)\(CI\)F/);
  assert.match(command, /\*S-1-5-32-544:\(OI\)\(CI\)F/);
  assert.match(command, /"%~f0" -s url/);
  assert.match(service, /WEBXRAY_DISTRIBUTION" value="windows-service/);
  assert.match(service, /WEBXRAY_HOST" value="127\.0\.0\.1/);
  assert.match(service, /WEBXRAY_DATA_DIR" value="%ProgramData%\\WebXray/);
  assert.match(service, /<logpath>%ProgramData%\\WebXray\\logs<\/logpath>/);
  assert.doesNotMatch(service, /%BASE%\\data/);
  assert.match(workflow, /& \$command -s install/);
  assert.match(workflow, /\$token -eq \$portableToken/);
  assert.match(workflow, /Get-Acl \$serviceData/);
});

test('documentation entry points exist', async () => {
  for (const file of [
    'docs/PLATFORMS.md',
    'docs/install/docker.md',
    'docs/install/linux.md',
    'docs/install/windows.md',
    'docs/SECURITY.md',
    'docs/UPGRADING.md',
    'docs/ARCHITECTURE.md'
  ]) await access(path.join(root, file));
});
