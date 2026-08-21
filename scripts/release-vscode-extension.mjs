#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const packageRoot = join(repoRoot, "packages", "vscode-extension");
const packageJsonPath = join(packageRoot, "package.json");
const changelogPath = join(packageRoot, "CHANGELOG.md");
const bumpTypes = new Set(["major", "minor", "patch"]);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function usage() {
	console.log(`Usage: node scripts/release-vscode-extension.mjs --bump-type <major|minor|patch> [options]

Options:
  --bump-type <type>  Bump the VS Code extension version by major, minor, or patch.
  --skip-check        Skip npm run check.
  --skip-package      Skip VSIX packaging.

Examples:
  npm run release:vscode-extension -- --bump-type patch
`);
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

function parseArgs(args) {
	const options = {
		bumpType: undefined,
		skipCheck: false,
		skipPackage: false,
	};

	if (args.includes("--help") || args.includes("-h")) {
		usage();
		process.exit(0);
	}

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--bump-type") {
			const bumpType = args[index + 1];
			if (!bumpType || !bumpTypes.has(bumpType)) {
				fail("--bump-type must be major, minor, or patch.");
			}
			options.bumpType = bumpType;
			index++;
			continue;
		}
		if (arg === "--skip-check") {
			options.skipCheck = true;
			continue;
		}
		if (arg === "--skip-package") {
			options.skipPackage = true;
			continue;
		}
		fail(`Unknown option: ${arg}`);
	}

	if (!options.bumpType) {
		fail("Use --bump-type <major|minor|patch>.");
	}

	return options;
}

function run(command, args) {
	console.log(`$ ${[command, ...args].join(" ")}`);
	execFileSync(command, args, {
		cwd: repoRoot,
		stdio: "inherit",
	});
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function getReleaseDate() {
	const date = new Date();
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function getUnreleasedBounds(content) {
	const header = "## [Unreleased]";
	const headerStart = content.indexOf(header);
	if (headerStart === -1) {
		fail(`${changelogPath} must contain ## [Unreleased].`);
	}
	const nextHeaderStart = content.indexOf("\n## [", headerStart + header.length);
	return {
		body: content.slice(headerStart + header.length, nextHeaderStart === -1 ? content.length : nextHeaderStart).trim(),
		header,
		headerStart,
		nextHeaderStart,
	};
}

function releaseChangelog(version) {
	const content = readFileSync(changelogPath, "utf8");
	const bounds = getUnreleasedBounds(content);
	if (!bounds.body) {
		fail(`${changelogPath} has no [Unreleased] entries. Add changelog entries before releasing.`);
	}

	const suffix = bounds.nextHeaderStart === -1 ? "" : content.slice(bounds.nextHeaderStart + 1);
	const releaseSection = `## [Unreleased]\n\n## [${version}] - ${getReleaseDate()}\n\n${bounds.body}\n\n`;
	const updated = `${content.slice(0, bounds.headerStart)}${releaseSection}${suffix}`;
	writeFileSync(changelogPath, updated.endsWith("\n") ? updated : `${updated}\n`);
}

function ensurePackageIncludesChangelog() {
	const packageJson = readJson(packageJsonPath);
	const files = packageJson.files ?? [];
	if (!files.includes("CHANGELOG.md")) {
		packageJson.files = [...files, "CHANGELOG.md"];
		writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, undefined, 2)}\n`);
	}
}

const options = parseArgs(process.argv.slice(2));

ensurePackageIncludesChangelog();
if (!existsSync(changelogPath)) {
	fail(`${changelogPath} is missing. Add a CHANGELOG.md with an [Unreleased] section before releasing.`);
}

run(npmCommand, ["version", options.bumpType, "--workspace", "packages/vscode-extension", "--no-git-tag-version"]);

const nextPackageJson = readJson(packageJsonPath);
releaseChangelog(nextPackageJson.version);

if (!options.skipCheck) {
	run(npmCommand, ["run", "check"]);
}

if (!options.skipPackage) {
	run(npmCommand, ["run", "package:vscode-vsix"]);
}

console.log(`Prepared pi-vscode-extension ${nextPackageJson.version}.`);
