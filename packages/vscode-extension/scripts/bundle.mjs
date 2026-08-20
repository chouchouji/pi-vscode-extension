import { cp, mkdir, readdir, rm, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(scriptPath), "..");
const repoRoot = resolve(packageRoot, "..", "..");
const distDir = join(packageRoot, "dist");
const entryPoint = join(distDir, "extension.js");
const highlighterEntryPoint = join(packageRoot, "src", "webview", "highlighter.ts");
const highlighterPath = join(distDir, "webview-highlighter.js");
const bundledPath = join(distDir, "extension.bundle.js");

async function removeRuntimeJs(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			await removeRuntimeJs(path);
			continue;
		}
		if ((entry.name.endsWith(".js") || entry.name.endsWith(".js.map")) && entry.name !== "extension.bundle.js") {
			await rm(path);
		}
	}
}

async function copyIfExists(source, target) {
	try {
		await mkdir(dirname(target), { recursive: true });
		await cp(source, target, { recursive: true });
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return;
		}
		throw error;
	}
}

async function copyMatchingFiles(sourceDir, targetDir, include) {
	await rm(targetDir, { recursive: true, force: true });
	let entries;
	try {
		entries = await readdir(sourceDir, { withFileTypes: true });
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return;
		}
		throw error;
	}

	for (const entry of entries) {
		const source = join(sourceDir, entry.name);
		const target = join(targetDir, entry.name);
		if (entry.isDirectory()) {
			await copyMatchingFiles(source, target, include);
			continue;
		}
		if (include(entry.name)) {
			await copyIfExists(source, target);
		}
	}
}

await build({
	entryPoints: [entryPoint],
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	packages: "bundle",
	external: ["vscode"],
	ignoreAnnotations: true,
	outfile: bundledPath,
	banner: {
		js: [
			"import { createRequire as __piCreateRequire } from 'node:module';",
			"import { fileURLToPath as __piFileURLToPath } from 'node:url';",
			"import { dirname as __piDirname } from 'node:path';",
			"const require = __piCreateRequire(import.meta.url);",
			"const __filename = __piFileURLToPath(import.meta.url);",
			"const __dirname = __piDirname(__filename);",
		].join("\n"),
	},
});

await removeRuntimeJs(distDir);
await rename(bundledPath, entryPoint);

await build({
	entryPoints: [highlighterEntryPoint],
	bundle: true,
	platform: "browser",
	format: "iife",
	target: "es2022",
	outfile: highlighterPath,
	minify: true,
	legalComments: "none",
});

await copyMatchingFiles(
	join(repoRoot, "packages", "coding-agent", "dist", "modes", "interactive", "theme"),
	join(distDir, "modes", "interactive", "theme"),
	(name) => name.endsWith(".json"),
);
await copyMatchingFiles(
	join(repoRoot, "packages", "coding-agent", "dist", "modes", "interactive", "assets"),
	join(distDir, "modes", "interactive", "assets"),
	(name) => name.endsWith(".png"),
);
await copyMatchingFiles(
	join(repoRoot, "packages", "coding-agent", "dist", "core", "export-html"),
	join(distDir, "core", "export-html"),
	(name) => name === "template.html" || name === "template.css" || name === "template.js" || name.endsWith(".min.js"),
);
await copyIfExists(
	join(repoRoot, "node_modules", "@silvia-odwyer", "photon-node", "photon_rs_bg.wasm"),
	join(distDir, "photon_rs_bg.wasm"),
);
await copyIfExists(
	join(repoRoot, "packages", "mcp-adapter", "dist", "app-bridge.bundle.js"),
	join(distDir, "app-bridge.bundle.js"),
);
await copyIfExists(
	join(repoRoot, "packages", "mcp-adapter", "dist", "mcp-keyring-helper.cjs"),
	join(distDir, "mcp-keyring-helper.cjs"),
);
await copyIfExists(
	join(repoRoot, "packages", "mcp-adapter", "dist", "mcp-script-worker.mjs"),
	join(distDir, "mcp-script-worker.mjs"),
);
