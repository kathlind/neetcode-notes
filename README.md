# NeetCode Notes

NeetCode Notes is a small Obsidian plugin that creates structured notes from NeetCode problem links.

## What it does

- Creates notes from `neetcode.io/problems/...` links.
- Fetches problem metadata automatically.
- Lets you choose a NeetCode roadmap folder manually.
- Creates a clean folder structure inside your vault.
- Adds note properties like difficulty, topics, link, and roadmap connection.

## Example structure

```text
NeetCode/
├── NeetCode.md
├── Array & Hashing/
│   ├── Array & Hashing.md
│   ├── Group Anagrams.md
│   └── Valid Anagram.md
└── Two Pointers/
    ├── Two Pointers.md
    └── Two Integer Sum II.md
```

## Example note

```md
---
difficulty: Medium
roadmap_topic: Array & Hashing
roadmap_link: "[[NeetCode/Array & Hashing/Array & Hashing|Array & Hashing]]"
topics:
  - Array
  - Hash Table
  - String
link: https://neetcode.io/problems/anagram-groups/question
created: 2026-05-26
---

## Problem

...

## Solution
```

## Manual installation

Download the latest release and copy these files:

```text
manifest.json
main.js
styles.css
```

to:

```text
<YOUR_VAULT>/.obsidian/plugins/neetcode-notes/
```

Final structure:

```text
<YOUR_VAULT>/.obsidian/plugins/neetcode-notes/
├── manifest.json
├── main.js
└── styles.css
```

Then restart Obsidian and enable the plugin:

```text
Settings → Community plugins → NeetCode Notes → Enable
```

## Usage

1. Click the rocket icon in the left ribbon.
2. Paste a NeetCode problem link.
3. Choose a roadmap folder.
4. The note will be created and opened automatically.

## Development

```bash
npm install
npm run build
```

For development mode:

```bash
npm run dev
```

## Note

This plugin uses a NeetCode API endpoint to fetch problem metadata. If NeetCode changes its API, the plugin may require updates.

## License

MIT
