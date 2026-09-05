import mermaid from "mermaid";

interface PiMermaidRenderer {
	render(code: string, dark: boolean): Promise<string>;
}

let initializedTheme = "";
let renderCounter = 0;

function ensureInitialized(dark: boolean): void {
	const theme = dark ? "dark" : "default";
	if (initializedTheme === theme) {
		return;
	}
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: "strict",
		suppressErrorRendering: true,
		theme,
		flowchart: { curve: "linear" },
	});
	initializedTheme = theme;
}

async function renderDiagram(code: string, dark: boolean): Promise<string> {
	if (!code.trim()) {
		throw new Error("Empty mermaid diagram.");
	}
	ensureInitialized(dark);
	renderCounter += 1;
	const { svg } = await mermaid.render(`pi-mermaid-${renderCounter}`, code);
	return svg;
}

const api: PiMermaidRenderer = {
	render: renderDiagram,
};

(globalThis as typeof globalThis & { piMermaid: PiMermaidRenderer }).piMermaid = api;
