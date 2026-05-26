var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => NeetCodeNotesPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  rootFolder: "NeetCode",
  defaultLanguage: "go",
  includeOfficialSolution: false,
  includeStarterCode: false,
  openAfterCreate: true,
  createConnectionNotes: true
};
var ROADMAP_FOLDERS = [
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
  "Math & Geometry"
];
var NEETCODE_API_URL = "https://neetcode.io/api/getProblemMetadataFunctionHttp";
var NeetCodeNotesPlugin = class extends import_obsidian.Plugin {
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
      }
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
      new import_obsidian.Notice(`Problem ID: ${problemId}`);
      const problem = await fetchNeetCodeProblem(problemId);
      new import_obsidian.Notice(`Loaded: ${problem.name}`);
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
      new import_obsidian.Notice(`Created: ${notePath}`);
    } catch (error) {
      console.error("[NeetCode Notes] error:", error);
      new import_obsidian.Notice(error instanceof Error ? error.message : "Failed to create NeetCode note");
    }
  }
  async createProblemNote(problem, link, roadmapFolder) {
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
      includeStarterCode: this.settings.includeStarterCode
    });
    await this.app.vault.create(notePath, markdown);
    return notePath;
  }
  async createConnectionNotes(roadmapFolder) {
    await createRootHubIfMissing(this.app, this.settings.rootFolder);
    await createRoadmapHubIfMissing(this.app, this.settings.rootFolder, roadmapFolder);
  }
  async openNote(notePath) {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (file instanceof import_obsidian.TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var ProblemUrlModal = class extends import_obsidian.Modal {
  constructor(app) {
    super(app);
    this.value = "";
    this.resolved = false;
  }
  openAndGetValue() {
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
    new import_obsidian.Setting(contentEl).setName("Problem link").setDesc("Paste a NeetCode problem link, for example: https://neetcode.io/problems/two-integer-sum").addText((text) => {
      text.setPlaceholder("https://neetcode.io/problems/two-integer-sum").onChange((value) => {
        this.value = value.trim();
      });
      text.inputEl.focus();
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          this.submit();
        }
      });
    });
    new import_obsidian.Setting(contentEl).addButton((button) => {
      button.setButtonText("Create").setCta().onClick(() => this.submit());
    }).addButton((button) => {
      button.setButtonText("Cancel").onClick(() => this.cancel());
    });
  }
  onClose() {
    var _a;
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolved = true;
      (_a = this.resolvePromise) == null ? void 0 : _a.call(this, null);
    }
  }
  submit() {
    if (!this.value) {
      new import_obsidian.Notice("Paste a NeetCode problem link first");
      return;
    }
    this.resolve(this.value);
  }
  cancel() {
    this.resolve(null);
  }
  resolve(value) {
    var _a;
    this.resolved = true;
    (_a = this.resolvePromise) == null ? void 0 : _a.call(this, value);
    this.close();
  }
};
var RoadmapFolderModal = class extends import_obsidian.Modal {
  constructor(app, problem) {
    super(app);
    this.problem = problem;
    this.resolved = false;
  }
  openAndGetValue() {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.resolved = false;
      this.open();
    });
  }
  onOpen() {
    var _a;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Choose roadmap folder" });
    contentEl.createEl("p", {
      text: `${this.problem.name} \xB7 ${(_a = this.problem.difficulty) != null ? _a : "Unknown difficulty"}`
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
  renderTopics(contentEl) {
    var _a;
    const topics = (_a = this.problem.topics) != null ? _a : [];
    if (topics.length === 0) {
      return;
    }
    const topicsEl = contentEl.createEl("p");
    topicsEl.createSpan({ text: "Topics: " });
    topics.forEach((topic, index) => {
      topicsEl.createSpan({
        text: index === topics.length - 1 ? topic : `${topic}, `,
        cls: "neetcode-topic-inline"
      });
    });
  }
  renderSuggestedFolder(contentEl) {
    const suggestedFolder = detectRoadmapFolder(this.problem);
    const suggestedBlock = contentEl.createDiv({
      cls: "neetcode-suggested-block"
    });
    suggestedBlock.createEl("div", {
      text: `Suggested: ${suggestedFolder}`,
      cls: "neetcode-suggested-title"
    });
    const suggestedButton = suggestedBlock.createEl("button", {
      text: `Use ${suggestedFolder}`,
      cls: "neetcode-folder-button neetcode-folder-button-suggested"
    });
    suggestedButton.addEventListener("click", () => {
      this.resolve(suggestedFolder);
    });
  }
  renderFolderGrid(contentEl) {
    const wrapper = contentEl.createDiv({
      cls: "neetcode-folder-grid"
    });
    for (const folder of ROADMAP_FOLDERS) {
      const button = wrapper.createEl("button", {
        text: folder,
        cls: "neetcode-folder-button"
      });
      button.addEventListener("click", () => {
        this.resolve(folder);
      });
    }
  }
  renderCancelButton(contentEl) {
    new import_obsidian.Setting(contentEl).addButton((button) => {
      button.setButtonText("Cancel").onClick(() => this.resolve(null));
    });
  }
  resolve(value) {
    var _a;
    this.resolved = true;
    (_a = this.resolvePromise) == null ? void 0 : _a.call(this, value);
    this.close();
  }
};
var NeetCodeNotesSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
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
  addRootFolderSetting(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Root folder").setDesc("Base folder where problem notes will be created.").addText(
      (text) => text.setPlaceholder("NeetCode").setValue(this.plugin.settings.rootFolder).onChange(async (value) => {
        this.plugin.settings.rootFolder = value.trim() || DEFAULT_SETTINGS.rootFolder;
        await this.plugin.saveSettings();
      })
    );
  }
  addDefaultLanguageSetting(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Default language").setDesc("Language used for starter code and solution blocks.").addText(
      (text) => text.setPlaceholder("go").setValue(this.plugin.settings.defaultLanguage).onChange(async (value) => {
        this.plugin.settings.defaultLanguage = value.trim() || DEFAULT_SETTINGS.defaultLanguage;
        await this.plugin.saveSettings();
      })
    );
  }
  addIncludeStarterCodeSetting(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Include starter code").setDesc("Add starter code from NeetCode if available.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.includeStarterCode).onChange(async (value) => {
        this.plugin.settings.includeStarterCode = value;
        await this.plugin.saveSettings();
      })
    );
  }
  addIncludeOfficialSolutionSetting(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Include official solution").setDesc("Add NeetCode solution code if available.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.includeOfficialSolution).onChange(async (value) => {
        this.plugin.settings.includeOfficialSolution = value;
        await this.plugin.saveSettings();
      })
    );
  }
  addOpenAfterCreateSetting(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Open note after creation").setDesc("Open the created note immediately.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.openAfterCreate).onChange(async (value) => {
        this.plugin.settings.openAfterCreate = value;
        await this.plugin.saveSettings();
      })
    );
  }
  addCreateHubNotesSetting(containerEl) {
    new import_obsidian.Setting(containerEl).setName("Create hub notes").setDesc("Create only NeetCode root hub and roadmap folder hub notes.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.createConnectionNotes).onChange(async (value) => {
        this.plugin.settings.createConnectionNotes = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
async function fetchNeetCodeProblem(problemId) {
  var _a;
  const response = await (0, import_obsidian.requestUrl)({
    url: NEETCODE_API_URL,
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ problemId })
  });
  const json = response.json;
  if (!((_a = json == null ? void 0 : json.data) == null ? void 0 : _a.name)) {
    throw new Error(`NeetCode API returned invalid problem data for: ${problemId}`);
  }
  return json.data;
}
function extractProblemIdFromUrl(input) {
  let url;
  try {
    url = new URL(input.trim());
  } catch (e) {
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
function detectRoadmapFolder(problem) {
  var _a;
  const topics = (_a = problem.topics) != null ? _a : [];
  const has = (topic) => topics.includes(topic);
  if (has("Two Pointers"))
    return "Two Pointers";
  if (has("Stack"))
    return "Stack";
  if (has("Binary Search"))
    return "Binary Search";
  if (has("Sliding Window"))
    return "Sliding Window";
  if (has("Linked List"))
    return "Linked List";
  if (has("Tree") || has("Binary Tree") || has("Binary Search Tree"))
    return "Trees";
  if (has("Trie"))
    return "Tries";
  if (has("Heap") || has("Priority Queue"))
    return "Heap / Priority Queue";
  if (has("Backtracking"))
    return "Backtracking";
  if (has("Graph"))
    return "Graphs";
  if (has("Advanced Graphs"))
    return "Advanced Graphs";
  if (has("Dynamic Programming"))
    return "1-D DP";
  if (has("Greedy"))
    return "Greedy";
  if (has("Intervals"))
    return "Intervals";
  if (has("Math") || has("Geometry"))
    return "Math & Geometry";
  if (has("Bit Manipulation"))
    return "Bit Manipulation";
  if (has("Array") || has("Hash Table") || has("Hash Map")) {
    return "Array & Hashing";
  }
  return DEFAULT_SETTINGS.rootFolder === "NeetCode" ? "Array & Hashing" : ROADMAP_FOLDERS[0];
}
function buildProblemMarkdown(options) {
  var _a, _b, _c, _d, _e;
  const {
    problem,
    link,
    roadmapFolder,
    rootFolder,
    language,
    includeOfficialSolution,
    includeStarterCode
  } = options;
  const topics = (_a = problem.topics) != null ? _a : [];
  const created = getCurrentDate();
  const starterCodeBlock = buildOptionalCodeBlock({
    title: "Starter Code",
    code: (_b = problem.starterCode) == null ? void 0 : _b[language],
    language,
    enabled: includeStarterCode
  });
  const officialSolutionBlock = buildOptionalCodeBlock({
    title: "NeetCode Solution",
    code: (_c = problem.solutions) == null ? void 0 : _c[language],
    language,
    enabled: includeOfficialSolution
  });
  return `---
difficulty: ${escapeYamlValue((_d = problem.difficulty) != null ? _d : "")}
roadmap_topic: ${escapeYamlValue(roadmapFolder)}
roadmap_link: "${createRoadmapHubWikiLink(rootFolder, roadmapFolder)}"
topics:
${buildYamlList(topics)}
link: ${escapeYamlValue(link)}
created: ${created}
---

## Problem

${cleanProblemDescription((_e = problem.description) != null ? _e : "")}

## Solution

${starterCodeBlock}
${officialSolutionBlock}`;
}
function buildOptionalCodeBlock(options) {
  const { title, code, language, enabled } = options;
  if (!enabled || !code) {
    return "";
  }
  return `
## ${title}

\`\`\`${language}
${code.trim()}
\`\`\`
`;
}
function cleanProblemDescription(description) {
  return description.replace(/<details[\s\S]*?<\/details>/gi, "").replace(/<br\s*\/?>/gi, "").replace(/<\/?[a-z][a-z0-9-]*(\s[^>]*)?>/gi, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
async function createRootHubIfMissing(app, rootFolder) {
  const rootPath = normalizePath(rootFolder);
  await ensureFolderExists(app, rootPath);
  const notePath = getRootHubPath(rootFolder);
  if (app.vault.getAbstractFileByPath(notePath)) {
    return;
  }
  const roadmapLinks = ROADMAP_FOLDERS.map((folder) => `- ${createRoadmapHubWikiLink(rootFolder, folder)}`).join("\n");
  const content = `---
type: neetcode_root
created: ${getCurrentDate()}
---

## Roadmap

${roadmapLinks}
`;
  await app.vault.create(notePath, content);
}
async function createRoadmapHubIfMissing(app, rootFolder, roadmapFolder) {
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
async function ensureFolderExists(app, folderPath) {
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
function getRootHubPath(rootFolder) {
  return normalizePath(`${rootFolder}/${rootFolder}.md`);
}
function getRoadmapFolderPath(rootFolder, roadmapFolder) {
  return normalizePath(`${rootFolder}/${roadmapFolder}`);
}
function getRoadmapHubPath(rootFolder, roadmapFolder) {
  return normalizePath(`${rootFolder}/${roadmapFolder}/${roadmapFolder}.md`);
}
function getProblemNotePath(folderPath, problemName) {
  return normalizePath(`${folderPath}/${sanitizeFileName(problemName)}.md`);
}
function createRootHubWikiLink(rootFolder) {
  return `[[${rootFolder}/${rootFolder}|${rootFolder}]]`;
}
function createRoadmapHubWikiLink(rootFolder, roadmapFolder) {
  return `[[${rootFolder}/${roadmapFolder}/${roadmapFolder}|${roadmapFolder}]]`;
}
function buildYamlList(values) {
  if (values.length === 0) {
    return "  []";
  }
  return values.map((value) => `  - ${escapeYamlValue(value)}`).join("\n");
}
function getCurrentDate() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function normalizePath(path) {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}
function sanitizeFileName(fileName) {
  return fileName.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}
function escapeYamlValue(value) {
  if (!value) {
    return '""';
  }
  const needsQuotes = /[:#\-[\]{},&*!|>'"%@`]/.test(value) || value.includes("\n");
  if (!needsQuotes) {
    return value;
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
