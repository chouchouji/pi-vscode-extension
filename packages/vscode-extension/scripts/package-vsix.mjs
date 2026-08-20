import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(scriptPath), "..");
const repoRoot = resolve(packageRoot, "..", "..");
const packageJsonPath = join(packageRoot, "package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const outDir = process.env.PI_VSCODE_VSIX_OUT
	? resolve(process.env.PI_VSCODE_VSIX_OUT)
	: join(repoRoot, ".artifacts", "vscode-extension");
const outPath = join(outDir, `pi-vscode-extension-${packageJson.version}.vsix`);
const stagingRoot = await mkdtemp(join(tmpdir(), "pi-vscode-extension-vsix-"));

function run(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd,
		stdio: "inherit",
		shell: process.platform === "win32",
	});
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
	}
}

try {
	const copiedEntries = [];
	for (const entry of packageJson.files ?? []) {
		const source = join(packageRoot, entry);
		const target = join(stagingRoot, entry);
		await mkdir(dirname(target), { recursive: true });
		try {
			await cp(source, target, { recursive: true });
			copiedEntries.push(entry);
		} catch (error) {
			if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
				continue;
			}
			throw error;
		}
	}

	const stagedPackageJson = {
		...packageJson,
		files: copiedEntries,
		name: "pi-vscode-extension",
		publisher: "earendil-works",
	};
	delete stagedPackageJson.scripts;
	delete stagedPackageJson.dependencies;
	delete stagedPackageJson.devDependencies;
	delete stagedPackageJson.optionalDependencies;
	await writeFile(join(stagingRoot, "package.json"), `${JSON.stringify(stagedPackageJson, undefined, "\t")}\n`);

	await mkdir(outDir, { recursive: true });
	run("vsce", ["package", "--allow-missing-repository", "--out", outPath], stagingRoot);
	console.log(`Packaged ${basename(outPath)}`);
} finally {
	await rm(stagingRoot, { recursive: true, force: true });
}
