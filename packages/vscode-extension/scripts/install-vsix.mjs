import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(scriptPath), "..");
const repoRoot = resolve(packageRoot, "..", "..");
const packageJsonPath = join(packageRoot, "package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const defaultVsixPath = join(
	repoRoot,
	".artifacts",
	"vscode-extension",
	`pi-vscode-extension-${packageJson.version}.vsix`,
);
const vsixPath = process.env.PI_VSCODE_VSIX_PATH ? resolve(process.env.PI_VSCODE_VSIX_PATH) : defaultVsixPath;
const codeCommand = process.env.PI_VSCODE_CODE_BIN ?? "code";

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
	await access(vsixPath);
} catch {
	throw new Error(`VSIX not found: ${vsixPath}\nRun npm run package:vscode-vsix first, or set PI_VSCODE_VSIX_PATH.`);
}

run(codeCommand, ["--install-extension", vsixPath, "--force"], repoRoot);
console.log(`Installed VSIX into VS Code: ${vsixPath}`);
