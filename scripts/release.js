#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PACKAGES = [
  { name: '@portals/contracts', path: 'packages/contracts' },
  { name: '@portals/billing-metering', path: 'packages/billing/metering-client' },
  { name: '@portals/billing-engine', path: 'packages/billing/billing-engine' },
  { name: '@portals/billing-marketplace', path: 'packages/billing/marketplace-split' },
  { name: '@portals/registry', path: 'packages/registry' },
  { name: '@portals/resolver', path: 'packages/resolver' },
  { name: '@portals/runtime-core', path: 'packages/runtime-core' },
  { name: '@portals/sdk', path: 'packages/sdk' },
  { name: '@portals/capabilities-redirect', path: 'packages/capabilities/redirect' },
];

function runCommand(command, cwd) {
  console.log(`Running: ${command}`);
  try {
    execSync(command, { cwd, stdio: 'inherit' });
  } catch (error) {
    console.error(`Command failed: ${command}`);
    process.exit(1);
  }
}

function getPackagePath(packageName) {
  const pkg = PACKAGES.find(p => p.name === packageName);
  if (!pkg) {
    console.error(`Package not found: ${packageName}`);
    console.error('Available packages:');
    PACKAGES.forEach(p => console.error(`  - ${p.name}`));
    process.exit(1);
  }
  return pkg.path;
}

function getPackageVersion(packagePath) {
  const packageJsonPath = path.join(packagePath, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npm run release <package-name>');
    console.error('\nAvailable packages:');
    PACKAGES.forEach(p => console.error(`  - ${p.name}`));
    process.exit(1);
  }

  const packageName = args[0];
  const packagePath = getPackagePath(packageName);
  const fullPath = path.resolve(packagePath);
  const version = getPackageVersion(fullPath);
  const tagName = `${packageName}@${version}`;

  console.log(`\n📦 Releasing ${packageName} v${version}\n`);

  // Build the specific package
  console.log('Building package...');
  runCommand(`npm run build --filter=${packageName}`, process.cwd());

  // Create git tag
  console.log(`\nCreating git tag: ${tagName}`);
  runCommand(`git tag -a ${tagName} -m "Release ${packageName} v${version}"`, process.cwd());

  // Push tag to GitHub
  console.log(`Pushing tag to GitHub...`);
  runCommand(`git push origin ${tagName}`, process.cwd());

  // Publish the package
  console.log('\nPublishing to npm...');
  runCommand('npm publish --provenance --access public', fullPath);

  console.log(`\n✅ Successfully released ${packageName} v${version}\n`);
  console.log(`📌 Git tag: ${tagName}\n`);
}

main();
