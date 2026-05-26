import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	requestUrl,
	Setting,
	TFile,
} from "obsidian";

interface NeetCodeNotesSettings {
	rootFolder: string;
	defaultLanguage: string;
	includeOfficialSolution: boolean;
	includeStarterCode: boolean;
	openAfterCreate: boolean;
	createConnectionNotes: boolean;
}

interface NeetCodeProblem {
	id: string;
	name: string;
	description?: string;
	difficulty?: string;
	tag?: string;
	topics?: string[];
	custom_test_cases?: string[];
	availableLanguages?: string[];
	starterCode?: Record<string, string>;
	solutions?: Record<string, string>;
	prereqs?: Array<{
		course?: string;
		name?: string;
		routerLink?: string;
	}>;
}

interface NeetCodeApiResponse {
	data: NeetCodeProblem;
}

interface BuildProblemMarkdownOptions {
	problem: NeetCodeProblem;
	link: string;
	roadmapFolder: string;
	rootFolder: string;
	language: string;
	includeOfficialSolution: boolean;
	includeStarterCode: boolean;
}

const DEFAULT_SETTINGS: NeetCodeNotesSettings = {
	rootFolder: "NeetCode",
	defaultLanguage: "go",
	includeOfficialSolution: false,
	includeStarterCode: false,
	openAfterCreate: true,
	createConnectionNotes: true,
};

const ROADMAP_FOLDERS = [
	"Array & Hashing",
	"Two Pointers",
	"Stack",
	"Binary Search",
	"Sliding Window",
	"Linked List",
	"Trees",
	"Tries",
	"Heap / Priority Queue",
	"Intervals",
	"Greedy",
	"Advanced Graphs",
	"Backtracking",
	"Graphs",
	"1-D DP",
	"2-D DP",
	"Bit Manipulation",
	"Math & Geometry",
];

const NEETCODE_API_URL = "https://neetcode.io/api/getProblemMetadataFunctionHttp";

export default class NeetCodeNotesPlugin extends Plugin {
	settings: NeetCodeNotesSettings;

	async onload() {
		console.log("[NeetCode Notes] plugin loaded");

		await this.loadSettings();

		this.addRibbonIcon("rocket", "Create NeetCode note", async () => {
			await this.createNeetCodeNoteFlow();
		});

		this.addCommand({
			id: "create-neetcode-note",
			name: "Create NeetCode note",
			callback: async () => {
				await this.createNeetCodeNoteFlow();
			},
		});

		this.addSettingTab(new NeetCodeNotesSettingTab(this.app, this));
	}

	onunload() {
		console.log("[NeetCode Notes] plugin unloaded");
	}

	async createNeetCodeNoteFlow() {
		try {
			const url = await new ProblemUrlModal(this.app).openAndGetValue();

			if (!url) {
				return;
			}

			const problemId = extractProblemIdFromUrl(url);
			new Notice(`Problem ID: ${problemId}`);

			const problem = await fetchNeetCodeProblem(problemId);
			new Notice(`Loaded: ${problem.name}`);

			const roadmapFolder = await new RoadmapFolderModal(this.app, problem).openAndGetValue();

			if (!roadmapFolder) {
				return;
			}

			if (this.settings.createConnectionNotes) {
				await this.createConnectionNotes(roadmapFolder);
			}

			const notePath = await this.createProblemNote(problem, url, roadmapFolder);

			if (this.settings.openAfterCreate) {
				await this.openNote(notePath);
			}

			new Notice(`Created: ${notePath}`);
		} catch (error) {
			console.error("[NeetCode Notes] error:", error);
			new Notice(error instanceof Error ? error.message : "Failed to create NeetCode note");
		}
	}

	async createProblemNote(
		problem: NeetCodeProblem,
		link: string,
		roadmapFolder: string
	): Promise<string> {
		const folderPath = getRoadmapFolderPath(this.settings.rootFolder, roadmapFolder);
		await ensureFolderExists(this.app, folderPath);

		const notePath = getProblemNotePath(folderPath, problem.name);

		if (this.app.vault.getAbstractFileByPath(notePath)) {
			throw new Error(`Note already exists: ${notePath}`);
		}

		const markdown = buildProblemMarkdown({
			problem,
			link,
			roadmapFolder,
			rootFolder: this.settings.rootFolder,
			language: this.settings.defaultLanguage,
			includeOfficialSolution: this.settings.includeOfficialSolution,
			includeStarterCode: this.settings.includeStarterCode,
		});

		await this.app.vault.create(notePath, markdown);

		return notePath;
	}

	async createConnectionNotes(roadmapFolder: string): Promise<void> {
		await createRootHubIfMissing(this.app, this.settings.rootFolder);
		await createRoadmapHubIfMissing(this.app, this.settings.rootFolder, roadmapFolder);
	}

	async openNote(notePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(notePath);

		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ProblemUrlModal extends Modal {
	private value = "";
	private resolvePromise?: (value: string | null) => void;
	private resolved = false;

	constructor(app: App) {
		super(app);
	}

	openAndGetValue(): Promise<string | null> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.resolved = false;
			this.open();
		});
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", { text: "Create NeetCode note" });

		new Setting(contentEl)
			.setName("Problem link")
			.setDesc("Paste a NeetCode problem link, for example: https://neetcode.io/problems/two-integer-sum")
			.addText((text) => {
				text
					.setPlaceholder("https://neetcode.io/problems/two-integer-sum")
					.onChange((value) => {
						this.value = value.trim();
					});

				text.inputEl.focus();

				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key === "Enter") {
						this.submit();
					}
				});
			});

		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText("Create")
					.setCta()
					.onClick(() => this.submit());
			})
			.addButton((button) => {
				button
					.setButtonText("Cancel")
					.onClick(() => this.cancel());
			});
	}

	onClose() {
		this.contentEl.empty();

		if (!this.resolved) {
			this.resolved = true;
			this.resolvePromise?.(null);
		}
	}

	private submit() {
		if (!this.value) {
			new Notice("Paste a NeetCode problem link first");
			return;
		}

		this.resolve(this.value);
	}

	private cancel() {
		this.resolve(null);
	}

	private resolve(value: string | null) {
		this.resolved = true;
		this.resolvePromise?.(value);
		this.close();
	}
}

class RoadmapFolderModal extends Modal {
	private resolvePromise?: (value: string | null) => void;
	private resolved = false;

	constructor(
		app: App,
		private readonly problem: NeetCodeProblem
	) {
		super(app);
	}

	openAndGetValue(): Promise<string | null> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.resolved = false;
			this.open();
		});
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.empty();

		contentEl.createEl("h2", { text: "Choose roadmap folder" });

		contentEl.createEl("p", {
			text: `${this.problem.name} · ${this.problem.difficulty ?? "Unknown difficulty"}`,
		});

		this.renderTopics(contentEl);
		this.renderSuggestedFolder(contentEl);
		this.renderFolderGrid(contentEl);
		this.renderCancelButton(contentEl);
	}

	onClose() {
		this.contentEl.empty();

		if (!this.resolved) {
			this.resolve(null);
		}
	}

	private renderTopics(contentEl: HTMLElement) {
		const topics = this.problem.topics ?? [];

		if (topics.length === 0) {
			return;
		}

		const topicsEl = contentEl.createEl("p");
		topicsEl.createSpan({ text: "Topics: " });

		topics.forEach((topic, index) => {
			topicsEl.createSpan({
				text: index === topics.length - 1 ? topic : `${topic}, `,
				cls: "neetcode-topic-inline",
			});
		});
	}

	private renderSuggestedFolder(contentEl: HTMLElement) {
		const suggestedFolder = detectRoadmapFolder(this.problem);

		const suggestedBlock = contentEl.createDiv({
			cls: "neetcode-suggested-block",
		});

		suggestedBlock.createEl("div", {
			text: `Suggested: ${suggestedFolder}`,
			cls: "neetcode-suggested-title",
		});

		const suggestedButton = suggestedBlock.createEl("button", {
			text: `Use ${suggestedFolder}`,
			cls: "neetcode-folder-button neetcode-folder-button-suggested",
		});

		suggestedButton.addEventListener("click", () => {
			this.resolve(suggestedFolder);
		});
	}

	private renderFolderGrid(contentEl: HTMLElement) {
		const wrapper = contentEl.createDiv({
			cls: "neetcode-folder-grid",
		});

		for (const folder of ROADMAP_FOLDERS) {
			const button = wrapper.createEl("button", {
				text: folder,
				cls: "neetcode-folder-button",
			});

			button.addEventListener("click", () => {
				this.resolve(folder);
			});
		}
	}

	private renderCancelButton(contentEl: HTMLElement) {
		new Setting(contentEl).addButton((button) => {
			button
				.setButtonText("Cancel")
				.onClick(() => this.resolve(null));
		});
	}

	private resolve(value: string | null) {
		this.resolved = true;
		this.resolvePromise?.(value);
		this.close();
	}
}

class NeetCodeNotesSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: NeetCodeNotesPlugin
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl("h2", { text: "NeetCode Notes Settings" });

		this.addRootFolderSetting(containerEl);
		this.addDefaultLanguageSetting(containerEl);
		this.addIncludeStarterCodeSetting(containerEl);
		this.addIncludeOfficialSolutionSetting(containerEl);
		this.addOpenAfterCreateSetting(containerEl);
		this.addCreateHubNotesSetting(containerEl);
	}

	private addRootFolderSetting(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName("Root folder")
			.setDesc("Base folder where problem notes will be created.")
			.addText((text) =>
				text
					.setPlaceholder("NeetCode")
					.setValue(this.plugin.settings.rootFolder)
					.onChange(async (value) => {
						this.plugin.settings.rootFolder = value.trim() || DEFAULT_SETTINGS.rootFolder;
						await this.plugin.saveSettings();
					})
			);
	}

	private addDefaultLanguageSetting(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName("Default language")
			.setDesc("Language used for starter code and solution blocks.")
			.addText((text) =>
				text
					.setPlaceholder("go")
					.setValue(this.plugin.settings.defaultLanguage)
					.onChange(async (value) => {
						this.plugin.settings.defaultLanguage = value.trim() || DEFAULT_SETTINGS.defaultLanguage;
						await this.plugin.saveSettings();
					})
			);
	}

	private addIncludeStarterCodeSetting(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName("Include starter code")
			.setDesc("Add starter code from NeetCode if available.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeStarterCode)
					.onChange(async (value) => {
						this.plugin.settings.includeStarterCode = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private addIncludeOfficialSolutionSetting(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName("Include official solution")
			.setDesc("Add NeetCode solution code if available.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeOfficialSolution)
					.onChange(async (value) => {
						this.plugin.settings.includeOfficialSolution = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private addOpenAfterCreateSetting(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName("Open note after creation")
			.setDesc("Open the created note immediately.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openAfterCreate)
					.onChange(async (value) => {
						this.plugin.settings.openAfterCreate = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private addCreateHubNotesSetting(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName("Create hub notes")
			.setDesc("Create only NeetCode root hub and roadmap folder hub notes.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.createConnectionNotes)
					.onChange(async (value) => {
						this.plugin.settings.createConnectionNotes = value;
						await this.plugin.saveSettings();
					})
			);
	}
}

async function fetchNeetCodeProblem(problemId: string): Promise<NeetCodeProblem> {
	const response = await requestUrl({
		url: NEETCODE_API_URL,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ problemId }),
	});

	const json = response.json as NeetCodeApiResponse;

	if (!json?.data?.name) {
		throw new Error(`NeetCode API returned invalid problem data for: ${problemId}`);
	}

	return json.data;
}

function extractProblemIdFromUrl(input: string): string {
	let url: URL;

	try {
		url = new URL(input.trim());
	} catch {
		throw new Error("Invalid URL");
	}

	if (!url.hostname.includes("neetcode.io")) {
		throw new Error("Only neetcode.io problem links are supported for now");
	}

	const parts = url.pathname.split("/").filter(Boolean);
	const problemsIndex = parts.indexOf("problems");
	const problemId = parts[problemsIndex + 1];

	if (problemsIndex === -1 || !problemId) {
		throw new Error("Cannot extract problem id from URL");
	}

	return decodeURIComponent(problemId);
}

function detectRoadmapFolder(problem: NeetCodeProblem): string {
	const topics = problem.topics ?? [];

	const has = (topic: string) => topics.includes(topic);

	if (has("Two Pointers")) return "Two Pointers";
	if (has("Stack")) return "Stack";
	if (has("Binary Search")) return "Binary Search";
	if (has("Sliding Window")) return "Sliding Window";
	if (has("Linked List")) return "Linked List";
	if (has("Tree") || has("Binary Tree") || has("Binary Search Tree")) return "Trees";
	if (has("Trie")) return "Tries";
	if (has("Heap") || has("Priority Queue")) return "Heap / Priority Queue";
	if (has("Backtracking")) return "Backtracking";
	if (has("Graph")) return "Graphs";
	if (has("Advanced Graphs")) return "Advanced Graphs";
	if (has("Dynamic Programming")) return "1-D DP";
	if (has("Greedy")) return "Greedy";
	if (has("Intervals")) return "Intervals";
	if (has("Math") || has("Geometry")) return "Math & Geometry";
	if (has("Bit Manipulation")) return "Bit Manipulation";

	if (has("Array") || has("Hash Table") || has("Hash Map")) {
		return "Array & Hashing";
	}

	return DEFAULT_SETTINGS.rootFolder === "NeetCode" ? "Array & Hashing" : ROADMAP_FOLDERS[0];
}

function buildProblemMarkdown(options: BuildProblemMarkdownOptions): string {
	const {
		problem,
		link,
		roadmapFolder,
		rootFolder,
		language,
		includeOfficialSolution,
		includeStarterCode,
	} = options;

	const topics = problem.topics ?? [];
	const created = getCurrentDate();

	const starterCodeBlock = buildOptionalCodeBlock({
		title: "Starter Code",
		code: problem.starterCode?.[language],
		language,
		enabled: includeStarterCode,
	});

	const officialSolutionBlock = buildOptionalCodeBlock({
		title: "NeetCode Solution",
		code: problem.solutions?.[language],
		language,
		enabled: includeOfficialSolution,
	});

	return `---
difficulty: ${escapeYamlValue(problem.difficulty ?? "")}
roadmap_topic: ${escapeYamlValue(roadmapFolder)}
roadmap_link: "${createRoadmapHubWikiLink(rootFolder, roadmapFolder)}"
topics:
${buildYamlList(topics)}
link: ${escapeYamlValue(link)}
created: ${created}
---

## Problem

${cleanProblemDescription(problem.description ?? "")}

## Solution

${starterCodeBlock}
${officialSolutionBlock}`;
}

function buildOptionalCodeBlock(options: {
	title: string;
	code?: string;
	language: string;
	enabled: boolean;
}): string {
	const { title, code, language, enabled } = options;

	if (!enabled || !code) {
		return "";
	}

	return `\n## ${title}\n\n\`\`\`${language}\n${code.trim()}\n\`\`\`\n`;
}

function cleanProblemDescription(description: string): string {
	return description
		.replace(/<details[\s\S]*?<\/details>/gi, "")
		.replace(/<br\s*\/?>/gi, "")
		.replace(/<\/?[a-z][a-z0-9-]*(\s[^>]*)?>/gi, "")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

async function createRootHubIfMissing(app: App, rootFolder: string): Promise<void> {
	const rootPath = normalizePath(rootFolder);
	await ensureFolderExists(app, rootPath);

	const notePath = getRootHubPath(rootFolder);

	if (app.vault.getAbstractFileByPath(notePath)) {
		return;
	}

	const roadmapLinks = ROADMAP_FOLDERS
		.map((folder) => `- ${createRoadmapHubWikiLink(rootFolder, folder)}`)
		.join("\n");

	const content = `---
type: neetcode_root
created: ${getCurrentDate()}
---

## Roadmap

${roadmapLinks}
`;

	await app.vault.create(notePath, content);
}

async function createRoadmapHubIfMissing(
	app: App,
	rootFolder: string,
	roadmapFolder: string
): Promise<void> {
	const folderPath = getRoadmapFolderPath(rootFolder, roadmapFolder);
	await ensureFolderExists(app, folderPath);

	const notePath = getRoadmapHubPath(rootFolder, roadmapFolder);

	if (app.vault.getAbstractFileByPath(notePath)) {
		return;
	}

	const content = `---
type: neetcode_roadmap
roadmap_topic: ${escapeYamlValue(roadmapFolder)}
parent: "${createRootHubWikiLink(rootFolder)}"
created: ${getCurrentDate()}
---

`;

	await app.vault.create(notePath, content);
}

async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const normalizedPath = normalizePath(folderPath);

	if (!normalizedPath) {
		return;
	}

	const parts = normalizedPath.split("/");
	let currentPath = "";

	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;

		if (!app.vault.getAbstractFileByPath(currentPath)) {
			await app.vault.createFolder(currentPath);
		}
	}
}

function getRootHubPath(rootFolder: string): string {
	return normalizePath(`${rootFolder}/${rootFolder}.md`);
}

function getRoadmapFolderPath(rootFolder: string, roadmapFolder: string): string {
	return normalizePath(`${rootFolder}/${roadmapFolder}`);
}

function getRoadmapHubPath(rootFolder: string, roadmapFolder: string): string {
	return normalizePath(`${rootFolder}/${roadmapFolder}/${roadmapFolder}.md`);
}

function getProblemNotePath(folderPath: string, problemName: string): string {
	return normalizePath(`${folderPath}/${sanitizeFileName(problemName)}.md`);
}

function createRootHubWikiLink(rootFolder: string): string {
	return `[[${rootFolder}/${rootFolder}|${rootFolder}]]`;
}

function createRoadmapHubWikiLink(rootFolder: string, roadmapFolder: string): string {
	return `[[${rootFolder}/${roadmapFolder}/${roadmapFolder}|${roadmapFolder}]]`;
}

function buildYamlList(values: string[]): string {
	if (values.length === 0) {
		return "  []";
	}

	return values.map((value) => `  - ${escapeYamlValue(value)}`).join("\n");
}

function getCurrentDate(): string {
	return new Date().toISOString().slice(0, 10);
}

function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\/|\/$/g, "");
}

function sanitizeFileName(fileName: string): string {
	return fileName
		.replace(/[\\/:*?"<>|]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function escapeYamlValue(value: string): string {
	if (!value) {
		return '""';
	}

	const needsQuotes = /[:#\-[\]{},&*!|>'"%@`]/.test(value) || value.includes("\n");

	if (!needsQuotes) {
		return value;
	}

	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
