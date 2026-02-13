import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, "Складність 1");
const OUT_JSON = path.join(ROOT, "tasks-data.json");
const OUT_JS = path.join(ROOT, "tasks-data.js");

const taskDirs = (await fs.readdir(SOURCE_ROOT, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^Завдання \d+$/u.test(entry.name))
  .sort((a, b) => taskNumber(a.name) - taskNumber(b.name));

const tasks = [];

for (const dir of taskDirs) {
  const number = taskNumber(dir.name);
  const sourcePath = path.join(SOURCE_ROOT, dir.name, "main_fixed.py");
  const sourceText = await fs.readFile(sourcePath, "utf8");
  const parsed = parseFixedTask(sourceText);

  tasks.push({
    id: `task-${number}`,
    number,
    title: `Завдання ${number}`,
    description: parsed.description || "Збери програму з блоків коду.",
    lines: parsed.lines.map((line, index) => ({
      id: `line-${index + 1}`,
      text: line.text,
      canonicalIndent: line.canonicalIndent
    }))
  });
}

await fs.writeFile(OUT_JSON, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
await fs.writeFile(OUT_JS, `window.TASKS_DATA = ${JSON.stringify(tasks, null, 2)};\n`, "utf8");

console.log(`Generated ${tasks.length} tasks -> tasks-data.json/tasks-data.js`);

function taskNumber(name) {
  const match = name.match(/\d+/u);
  return match ? Number(match[0]) : 0;
}

function parseFixedTask(rawText) {
  const text = rawText.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const lines = text.split("\n");

  let cursor = 0;
  while (cursor < lines.length && lines[cursor].trim() === "") {
    cursor += 1;
  }

  const descriptionBlock = readDocstringBlock(lines, cursor);
  let description = "";
  if (descriptionBlock) {
    cursor = descriptionBlock.nextIndex;
    description = descriptionBlock.content.replace(/\s+/gu, " ").trim();
  }

  let codeLines = lines.slice(cursor);
  const trailingDocStart = codeLines.findIndex((line) => line.trim().startsWith('"""'));
  if (trailingDocStart >= 0) {
    codeLines = codeLines.slice(0, trailingDocStart);
  }

  while (codeLines.length > 0 && codeLines[0].trim() === "") {
    codeLines.shift();
  }
  while (codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === "") {
    codeLines.pop();
  }

  const parsedLines = [];
  for (const rawLine of codeLines) {
    const expanded = rawLine.replace(/\t/gu, "    ");
    if (expanded.trim() === "") {
      continue;
    }
    const leadingSpaces = (expanded.match(/^ */u) || [""])[0].length;
    parsedLines.push({
      text: expanded.trim(),
      canonicalIndent: Math.floor(leadingSpaces / 4)
    });
  }

  return {
    description,
    lines: parsedLines
  };
}

function readDocstringBlock(lines, startIndex) {
  if (startIndex >= lines.length) {
    return null;
  }

  const startLine = lines[startIndex].trim();
  if (!startLine.startsWith('"""')) {
    return null;
  }

  const sameLineMatch = lines[startIndex].match(/^\s*"""(.*)"""\s*$/u);
  if (sameLineMatch) {
    return {
      content: sameLineMatch[1],
      nextIndex: startIndex + 1
    };
  }

  const parts = [];
  const firstLineWithoutOpen = lines[startIndex].replace(/^\s*"""/u, "").trim();
  if (firstLineWithoutOpen !== "") {
    parts.push(firstLineWithoutOpen);
  }

  let i = startIndex + 1;
  while (i < lines.length) {
    const endIdx = lines[i].indexOf('"""');
    if (endIdx >= 0) {
      const chunk = lines[i].slice(0, endIdx).trim();
      if (chunk !== "") {
        parts.push(chunk);
      }
      return {
        content: parts.join("\n"),
        nextIndex: i + 1
      };
    }
    parts.push(lines[i].trim());
    i += 1;
  }

  return {
    content: parts.join("\n"),
    nextIndex: i
  };
}
