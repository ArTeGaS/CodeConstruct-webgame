const tasks = normalizeTasks(window.TASKS_DATA || []);
const allLinesData = normalizeAllLines(window.ALL_LINES_DATA || []);
const taskExamplesData = normalizeTaskExamples(window.TASK_EXAMPLES_DATA || {});
const allLinesById = new Map(allLinesData.map((line) => [line.id, line]));
const EXTRA_LINES_PER_TASK = 10;
const BLOCK_HEADER_REGEX = /^(if|elif|else|for|while|def|class|try|except|finally|with|match|case)\b.*:\s*$/;
const MAX_INDENT = 6;
const PY_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "case", "class",
  "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
  "if", "import", "in", "is", "lambda", "match", "nonlocal", "not", "or", "pass", "raise",
  "return", "try", "while", "with", "yield"
]);
const PY_BUILTINS = new Set([
  "input", "print", "int", "float", "str", "bool", "len", "range", "sum", "min", "max", "abs",
  "round", "list", "dict", "set", "tuple", "enumerate", "zip", "sorted", "reversed", "map",
  "filter", "any", "all"
]);
const LOOP_KEYWORDS = new Set(["for", "while"]);
const CONDITIONAL_BLOCK_KEYWORDS = new Set([
  "if", "elif", "else", "for", "while", "try", "except", "finally", "with", "match", "case"
]);

const state = {
  activeTaskIndex: 0,
  slots: [],
  indents: [],
  bankPoolIds: [],
  bankOrder: [],
  selectedBlockId: null
};

const editorSlotsEl = document.getElementById("editor-slots");
const codeBankEl = document.getElementById("code-bank");
const resultEl = document.getElementById("result");
const previewEl = document.getElementById("solution-preview");
const checkBtn = document.getElementById("check-btn");
const resetBtn = document.getElementById("reset-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const taskListEl = document.getElementById("task-list");
const taskTitleEl = document.getElementById("task-title");
const taskDescriptionEl = document.getElementById("task-description");
const taskExamplesEl = document.getElementById("task-examples");
const taskCountEl = document.getElementById("task-count");

init();

function init() {
  if (!tasks.length) {
    disableActions();
    setResult("Не знайдено жодного завдання. Перевір файл tasks-data.js.", "error");
    return;
  }

  taskCountEl.textContent = `${tasks.length} завдання`;
  renderTaskList();
  loadTask(0);

  editorSlotsEl.addEventListener("dragover", (event) => {
    const zone = event.target.closest(".slot-drop-zone");
    if (!zone) {
      return;
    }
    event.preventDefault();
    zone.classList.add("is-over");
  });

  editorSlotsEl.addEventListener("dragleave", (event) => {
    const zone = event.target.closest(".slot-drop-zone");
    if (zone) {
      zone.classList.remove("is-over");
    }
  });

  editorSlotsEl.addEventListener("drop", (event) => {
    const zone = event.target.closest(".slot-drop-zone");
    if (!zone) {
      return;
    }
    event.preventDefault();
    zone.classList.remove("is-over");

    const blockId = event.dataTransfer.getData("text/plain");
    const slotIndex = Number(zone.dataset.slot);
    if (!blockId || Number.isNaN(slotIndex)) {
      return;
    }
    placeBlock(blockId, slotIndex);
  });

  codeBankEl.addEventListener("dragstart", (event) => {
    const block = event.target.closest(".code-block");
    if (!block || !event.dataTransfer) {
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", block.dataset.blockId);
  });

  codeBankEl.addEventListener("click", (event) => {
    const block = event.target.closest(".code-block");
    if (!block) {
      return;
    }
    const clickedId = block.dataset.blockId;
    state.selectedBlockId = state.selectedBlockId === clickedId ? null : clickedId;
    renderBank();
  });

  editorSlotsEl.addEventListener("click", (event) => {
    const actionBtn = event.target.closest("[data-action]");
    if (actionBtn) {
      const slotIndex = Number(actionBtn.dataset.slot);
      if (Number.isNaN(slotIndex)) {
        return;
      }
      const action = actionBtn.dataset.action;
      if (action === "indent-left") {
        updateIndent(slotIndex, -1);
      }
      if (action === "indent-right") {
        updateIndent(slotIndex, 1);
      }
      if (action === "clear-slot") {
        clearSlot(slotIndex);
      }
      return;
    }

    const zone = event.target.closest(".slot-drop-zone");
    if (!zone) {
      return;
    }
    const slotIndex = Number(zone.dataset.slot);
    if (Number.isNaN(slotIndex)) {
      return;
    }

    if (state.selectedBlockId) {
      placeBlock(state.selectedBlockId, slotIndex);
      return;
    }

    const occupied = state.slots[slotIndex];
    if (occupied) {
      state.slots[slotIndex] = null;
      state.indents[slotIndex] = 0;
      state.selectedBlockId = occupied;
      render();
    }
  });

  taskListEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-task-index]");
    if (!button) {
      return;
    }
    const index = Number(button.dataset.taskIndex);
    if (Number.isNaN(index)) {
      return;
    }
    loadTask(index);
  });

  checkBtn.addEventListener("click", checkSolution);
  resetBtn.addEventListener("click", resetPuzzle);
  shuffleBtn.addEventListener("click", () => {
    state.bankOrder = shuffle(state.bankOrder.slice());
    state.selectedBlockId = null;
    renderBank();
  });
}

function disableActions() {
  checkBtn.disabled = true;
  resetBtn.disabled = true;
  shuffleBtn.disabled = true;
}

function loadTask(index) {
  state.activeTaskIndex = clamp(index, 0, tasks.length - 1);
  const task = getActiveTask();

  state.slots = new Array(task.lines.length).fill(null);
  state.indents = new Array(task.lines.length).fill(0);
  state.bankPoolIds = generateTaskBankIds(task, EXTRA_LINES_PER_TASK);
  state.bankOrder = shuffle(state.bankPoolIds.slice());
  state.selectedBlockId = null;

  taskTitleEl.textContent = formatTaskLabel(task);
  taskDescriptionEl.textContent = task.description;
  renderTaskExamples(task);
  previewEl.hidden = true;

  setResult("Збери програму в редакторі та перевір синтаксис.", "neutral");
  renderTaskList();
  render();
}

function getActiveTask() {
  return tasks[state.activeTaskIndex];
}

function getActiveLineMap() {
  const map = new Map();
  for (const id of state.bankPoolIds) {
    const line = allLinesById.get(id);
    if (line) {
      map.set(id, line);
    }
  }
  for (const line of getActiveTask().lines) {
    map.set(line.id, line);
  }
  return map;
}

function renderTaskList() {
  taskListEl.innerHTML = "";
  tasks.forEach((task, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-item task-btn";
    button.dataset.taskIndex = String(index);
    button.textContent = formatTaskLabel(task);
    if (index === state.activeTaskIndex) {
      button.classList.add("is-active");
    }
    item.appendChild(button);
    taskListEl.appendChild(item);
  });
}

function render() {
  renderEditor();
  renderBank();
}

function renderEditor() {
  const activeTask = getActiveTask();
  const lineById = getActiveLineMap();

  editorSlotsEl.innerHTML = "";
  for (let i = 0; i < activeTask.lines.length; i += 1) {
    const slotLineId = state.slots[i];
    const slot = document.createElement("li");
    slot.className = "editor-slot";

    const index = document.createElement("span");
    index.className = "slot-index";
    index.textContent = String(i + 1);

    const zone = document.createElement("div");
    zone.className = "slot-drop-zone";
    zone.dataset.slot = String(i);

    if (slotLineId) {
      const code = document.createElement("code");
      code.className = "code-line";
      const indentSpaces = " ".repeat(state.indents[i] * 4);
      code.textContent = `${indentSpaces}${lineById.get(slotLineId).text}`;
      zone.appendChild(code);
    } else {
      zone.classList.add("is-empty");
      zone.textContent = "Перетягни блок сюди";
    }

    const tools = document.createElement("div");
    tools.className = "slot-tools";

    const leftBtn = createToolButton("←", "indent-left", i);
    leftBtn.disabled = !slotLineId || state.indents[i] === 0;

    const rightBtn = createToolButton("→", "indent-right", i);
    rightBtn.disabled = !slotLineId || state.indents[i] >= MAX_INDENT;

    const clearBtn = createToolButton("×", "clear-slot", i);
    clearBtn.disabled = !slotLineId;
    clearBtn.title = "Повернути блок праворуч";

    tools.append(leftBtn, rightBtn, clearBtn);
    slot.append(index, zone, tools);
    editorSlotsEl.appendChild(slot);
  }
}

function renderBank() {
  const lineById = getActiveLineMap();

  codeBankEl.innerHTML = "";
  const used = new Set(state.slots.filter(Boolean));
  const available = state.bankOrder.filter((id) => !used.has(id));

  if (available.length === 0) {
    const donePlaceholder = document.createElement("div");
    donePlaceholder.className = "bank-placeholder";
    donePlaceholder.textContent = "Усі блоки в редакторі. Натисни «Перевірити» або поправ порядок.";
    codeBankEl.appendChild(donePlaceholder);
    return;
  }

  for (const id of available) {
    const line = lineById.get(id);
    const block = document.createElement("button");
    block.type = "button";
    block.className = "code-block";
    block.draggable = true;
    block.dataset.blockId = id;
    if (state.selectedBlockId === id) {
      block.classList.add("is-selected");
    }

    const code = document.createElement("code");
    code.className = "code-line";
    code.textContent = line.text;
    block.appendChild(code);

    codeBankEl.appendChild(block);
  }
}

function placeBlock(blockId, slotIndex) {
  const lineById = getActiveLineMap();
  if (!lineById.has(blockId)) {
    return;
  }
  removeBlockFromSlots(blockId);
  state.slots[slotIndex] = blockId;
  state.selectedBlockId = null;
  render();
}

function removeBlockFromSlots(blockId) {
  for (let i = 0; i < state.slots.length; i += 1) {
    if (state.slots[i] === blockId) {
      state.slots[i] = null;
      state.indents[i] = 0;
    }
  }
}

function clearSlot(slotIndex) {
  state.slots[slotIndex] = null;
  state.indents[slotIndex] = 0;
  render();
}

function updateIndent(slotIndex, diff) {
  if (!state.slots[slotIndex]) {
    return;
  }
  state.indents[slotIndex] = clamp(state.indents[slotIndex] + diff, 0, MAX_INDENT);
  renderEditor();
}

function checkSolution() {
  const issues = [];

  if (state.slots.some((id) => !id)) {
    issues.push("Заповни всі рядки редактора.");
  }

  issues.push(...validateSelectedTaskLines());

  const assembled = buildAssembledProgram();
  issues.push(...validateProgramSemantics(assembled));

  if (issues.length === 0) {
    setResult("Готово. Базовий синтаксис Python і залежності імен коректні.", "ok");
    renderSolutionPreview();
    return;
  }

  const previewIssues = issues.slice(0, 5).join("\n");
  const extra = issues.length > 5 ? `\n...і ще ${issues.length - 5} помилок.` : "";
  setResult(`${previewIssues}${extra}`, "error");
  previewEl.hidden = true;
}

function validateSelectedTaskLines() {
  const issues = [];
  const taskLineIds = new Set(getActiveTask().lines.map((line) => line.id));

  for (let i = 0; i < state.slots.length; i += 1) {
    const id = state.slots[i];
    if (!id) {
      continue;
    }
    if (!taskLineIds.has(id)) {
      issues.push(`Рядок ${i + 1}: це зайвий блок з іншого завдання.`);
    }
  }

  return dedupe(issues);
}

function buildAssembledProgram() {
  const lineById = getActiveLineMap();

  return state.slots
    .map((id, index) => {
      if (!id) {
        return null;
      }
      const line = lineById.get(id);
      return {
        lineNumber: index + 1,
        text: line.text,
        indent: state.indents[index],
        analysis: parseLineAnalysis(line.text)
      };
    })
    .filter(Boolean);
}

function validateProgramSemantics(lines) {
  const issues = [];
  issues.push(...validateBlockSyntax(lines));
  issues.push(...validateKeywordChains(lines));
  issues.push(...validateNameDependencies(lines));
  issues.push(...validateRecursiveBaseCases(lines));
  return dedupe(issues);
}

function validateBlockSyntax(lines) {
  const issues = [];
  if (lines.length === 0) {
    return issues;
  }

  if (lines[0].indent !== 0) {
    issues.push("Рядок 1: програма має починатися без відступу.");
  }

  const indentStack = [0];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : null;

    if (line.indent < 0) {
      issues.push(`Рядок ${line.lineNumber}: некоректний відступ.`);
      continue;
    }

    if (prev && line.indent > prev.indent) {
      if (!prev.analysis.opensBlock) {
        issues.push(`Рядок ${line.lineNumber}: зайвий відступ без попереднього блоку.`);
      }
      if (line.indent !== prev.indent + 1) {
        issues.push(`Рядок ${line.lineNumber}: відступ має збільшуватись тільки на 1 рівень.`);
      }
      indentStack.push(line.indent);
      continue;
    }

    while (indentStack.length > 1 && line.indent < indentStack[indentStack.length - 1]) {
      indentStack.pop();
    }

    if (line.indent !== indentStack[indentStack.length - 1]) {
      issues.push(`Рядок ${line.lineNumber}: некоректний рівень відступу.`);
    }

    if (prev && prev.analysis.opensBlock && line.indent <= prev.indent) {
      issues.push(`Рядок ${prev.lineNumber}: після ':' потрібен вкладений рядок.`);
    }
  }

  const lastLine = lines[lines.length - 1];
  if (lastLine.analysis.opensBlock) {
    issues.push(`Рядок ${lastLine.lineNumber}: після ':' бракує вкладеного блоку.`);
  }

  return dedupe(issues);
}

function validateKeywordChains(lines) {
  const issues = [];
  const blockStack = [];
  const ifChains = new Set();
  const tryChains = new Map();

  for (const line of lines) {
    const keyword = line.analysis.keyword;

    while (blockStack.length > 0 && line.indent <= blockStack[blockStack.length - 1].indent) {
      blockStack.pop();
    }

    for (const indent of [...ifChains]) {
      if (indent > line.indent) {
        ifChains.delete(indent);
      }
    }
    for (const [indent, state] of [...tryChains.entries()]) {
      if (indent > line.indent) {
        if (!state.hasHandler) {
          issues.push(`Рядок ${state.lineNumber}: після try потрібен except або finally.`);
        }
        tryChains.delete(indent);
      }
    }

    if (ifChains.has(line.indent) && keyword !== "elif" && keyword !== "else") {
      ifChains.delete(line.indent);
    }

    if (tryChains.has(line.indent) && keyword !== "except" && keyword !== "finally") {
      const pendingTry = tryChains.get(line.indent);
      if (!pendingTry.hasHandler) {
        issues.push(`Рядок ${pendingTry.lineNumber}: після try потрібен except або finally.`);
      }
      tryChains.delete(line.indent);
    }

    if ((keyword === "elif" || keyword === "else") && !ifChains.has(line.indent)) {
      issues.push(`Рядок ${line.lineNumber}: '${keyword}' без відповідного if.`);
    }
    if (keyword === "elif") {
      ifChains.add(line.indent);
    } else if (keyword === "else") {
      ifChains.delete(line.indent);
    } else if (keyword === "if") {
      ifChains.add(line.indent);
    }

    if ((keyword === "except" || keyword === "finally") && !tryChains.has(line.indent)) {
      issues.push(`Рядок ${line.lineNumber}: '${keyword}' без відповідного try.`);
    }
    if (keyword === "except") {
      const state = tryChains.get(line.indent);
      if (state) {
        state.hasHandler = true;
      }
    } else if (keyword === "finally") {
      const state = tryChains.get(line.indent);
      if (state) {
        state.hasHandler = true;
      }
      tryChains.delete(line.indent);
    } else if (keyword === "try") {
      tryChains.set(line.indent, { hasHandler: false, lineNumber: line.lineNumber });
    }

    const insideFunction = blockStack.some((block) => block.keyword === "def");
    const insideLoop = blockStack.some((block) => LOOP_KEYWORDS.has(block.keyword));

    if (line.analysis.isReturn && !insideFunction) {
      issues.push(`Рядок ${line.lineNumber}: return може бути лише всередині def.`);
    }
    if (line.analysis.isBreak && !insideLoop) {
      issues.push(`Рядок ${line.lineNumber}: break може бути лише всередині циклу.`);
    }
    if (line.analysis.isContinue && !insideLoop) {
      issues.push(`Рядок ${line.lineNumber}: continue може бути лише всередині циклу.`);
    }

    if (line.analysis.opensBlock) {
      blockStack.push({ indent: line.indent, keyword });
    }
  }

  for (const state of tryChains.values()) {
    if (!state.hasHandler) {
      issues.push(`Рядок ${state.lineNumber}: після try потрібен except або finally.`);
    }
  }

  return dedupe(issues);
}

function validateNameDependencies(lines) {
  const issues = [];
  const globalKnown = new Set(PY_BUILTINS);
  const scopeStack = [{ indent: -1, kind: "module", locals: new Set() }];
  const blockStack = [];
  const conditionalScopes = [];

  for (const line of lines) {
    while (blockStack.length > 0 && line.indent <= blockStack[blockStack.length - 1].indent) {
      blockStack.pop();
    }
    while (conditionalScopes.length > 0 && line.indent <= conditionalScopes[conditionalScopes.length - 1].indent) {
      conditionalScopes.pop();
    }
    while (scopeStack.length > 1 && line.indent <= scopeStack[scopeStack.length - 1].indent) {
      scopeStack.pop();
    }

    const visible = collectVisibleNames(globalKnown, scopeStack, conditionalScopes);
    for (const name of line.analysis.uses) {
      if (!visible.has(name)) {
        issues.push(`Рядок ${line.lineNumber}: '${name}' використано до оголошення.`);
      }
    }

    for (const name of line.analysis.defines) {
      registerDefinition(name, globalKnown, scopeStack, conditionalScopes);
    }

    if (line.analysis.opensBlock && line.analysis.keyword === "def") {
      scopeStack.push({
        indent: line.indent,
        kind: "def",
        locals: new Set(line.analysis.defParams)
      });
    } else if (line.analysis.opensBlock && line.analysis.keyword === "class") {
      scopeStack.push({
        indent: line.indent,
        kind: "class",
        locals: new Set()
      });
    }

    if (line.analysis.opensBlock) {
      blockStack.push({ indent: line.indent, keyword: line.analysis.keyword });
      if (CONDITIONAL_BLOCK_KEYWORDS.has(line.analysis.keyword)) {
        conditionalScopes.push({
          indent: line.indent,
          names: new Set()
        });
      }
    }
  }

  return dedupe(issues);
}

function validateRecursiveBaseCases(lines) {
  const issues = [];
  const defStack = [];

  function finalizeContext(context) {
    if (!context) {
      return;
    }
    if (!context.baseCaseRecursiveLines.length || !context.topLevelPlainReturnLines.length) {
      return;
    }
    for (const lineNumber of context.baseCaseRecursiveLines) {
      issues.push(
        `Рядок ${lineNumber}: підозріла рекурсія в базовій умові. Перевір базовий return у функції '${context.name}'.`
      );
    }
  }

  for (const line of lines) {
    while (defStack.length > 0 && line.indent <= defStack[defStack.length - 1].indent) {
      finalizeContext(defStack.pop());
    }

    const activeDef = defStack[defStack.length - 1];
    if (activeDef) {
      while (
        activeDef.baseIfStack.length > 0 &&
        line.indent <= activeDef.baseIfStack[activeDef.baseIfStack.length - 1].indent
      ) {
        activeDef.baseIfStack.pop();
      }

      if (line.analysis.keyword === "if" && line.indent === activeDef.indent + 1) {
        const condition = extractIfCondition(line.text);
        if (isLikelyBaseCaseCondition(condition, activeDef.params)) {
          activeDef.baseIfStack.push({ indent: line.indent });
        }
      }

      if (line.analysis.isReturn) {
        const isRecursiveReturn = hasFunctionCall(line.text, activeDef.name);
        if (
          isRecursiveReturn &&
          activeDef.baseIfStack.length > 0 &&
          line.indent > activeDef.baseIfStack[activeDef.baseIfStack.length - 1].indent
        ) {
          activeDef.baseCaseRecursiveLines.push(line.lineNumber);
        } else if (!isRecursiveReturn && line.indent === activeDef.indent + 1) {
          activeDef.topLevelPlainReturnLines.push(line.lineNumber);
        }
      }
    }

    if (line.analysis.keyword === "def" && line.analysis.opensBlock) {
      const defName = line.analysis.defines[0];
      if (defName) {
        defStack.push({
          name: defName,
          indent: line.indent,
          params: line.analysis.defParams.slice(),
          baseIfStack: [],
          baseCaseRecursiveLines: [],
          topLevelPlainReturnLines: []
        });
      }
    }
  }

  while (defStack.length > 0) {
    finalizeContext(defStack.pop());
  }

  return dedupe(issues);
}

function extractIfCondition(text) {
  const match = text.trim().match(/^if\s+(.+)\s*:\s*$/u);
  return match ? match[1] : "";
}

function isLikelyBaseCaseCondition(condition, params) {
  if (!condition) {
    return false;
  }
  const cleaned = stripStringLiterals(condition).replace(/\s+/gu, " ").trim();
  if (!cleaned) {
    return false;
  }
  const paramPattern = params.length
    ? params.map((name) => escapeRegExp(name)).join("|")
    : "[A-Za-z_][A-Za-z0-9_]*";
  const leftPattern = new RegExp(`\\b(?:${paramPattern})\\s*(?:<=|<|==)\\s*(?:0|1)\\b`, "u");
  const rightPattern = new RegExp(`\\b(?:0|1)\\s*(?:>=|>|==)\\s*(?:${paramPattern})\\b`, "u");
  return leftPattern.test(cleaned) || rightPattern.test(cleaned);
}

function hasFunctionCall(text, functionName) {
  if (!functionName) {
    return false;
  }
  const cleaned = stripStringLiterals(text);
  const callPattern = new RegExp(`\\b${escapeRegExp(functionName)}\\s*\\(`, "u");
  return callPattern.test(cleaned);
}

function escapeRegExp(source) {
  return source.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function collectVisibleNames(globalKnown, scopeStack, conditionalScopes) {
  const names = new Set(globalKnown);
  for (const scope of scopeStack) {
    for (const name of scope.locals) {
      names.add(name);
    }
  }
  for (const scope of conditionalScopes) {
    for (const name of scope.names) {
      names.add(name);
    }
  }
  return names;
}

function registerDefinition(name, globalKnown, scopeStack, conditionalScopes) {
  if (!name) {
    return;
  }
  if (scopeStack.length > 1) {
    scopeStack[scopeStack.length - 1].locals.add(name);
    return;
  }
  if (conditionalScopes.length > 0) {
    conditionalScopes[conditionalScopes.length - 1].names.add(name);
    return;
  }
  globalKnown.add(name);
}

function parseLineAnalysis(rawText) {
  const text = rawText.trim();
  const keywordMatch = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/);
  const keyword = keywordMatch ? keywordMatch[1] : "";
  const analysis = {
    keyword,
    opensBlock: isBlockHeader(text),
    defines: [],
    uses: [],
    defParams: [],
    isReturn: /^return\b/u.test(text),
    isBreak: /^break\b/u.test(text),
    isContinue: /^continue\b/u.test(text)
  };

  for (const expression of extractFStringExpressions(text)) {
    addNames(expression, analysis.uses);
  }

  const sanitized = stripStringLiterals(text).replace(/#.*/u, "");
  const withoutAttributes = sanitized.replace(/\.[A-Za-z_][A-Za-z0-9_]*/gu, "");

  if (keyword === "import") {
    const importBody = sanitized.replace(/^import\s+/u, "");
    for (const part of splitArgs(importBody)) {
      const importMatch = part.trim().match(/^([A-Za-z_][A-Za-z0-9_.]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/u);
      if (!importMatch) {
        continue;
      }
      const alias = importMatch[2] || importMatch[1].split(".")[0];
      analysis.defines.push(alias);
    }
    return finalizeAnalysis(analysis);
  }

  if (keyword === "from") {
    const fromMatch = sanitized.match(/^from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import\s+(.+)$/u);
    if (fromMatch) {
      for (const item of splitArgs(fromMatch[2])) {
        const trimmed = item.trim();
        if (!trimmed || trimmed === "*") {
          continue;
        }
        const importMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/u);
        if (!importMatch) {
          continue;
        }
        analysis.defines.push(importMatch[2] || importMatch[1]);
      }
    }
    return finalizeAnalysis(analysis);
  }

  if (keyword === "def") {
    const defMatch = withoutAttributes.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*:/u);
    if (defMatch) {
      analysis.defines.push(defMatch[1]);
      const params = splitArgs(defMatch[2]);
      for (const param of params) {
        const trimmed = param.trim();
        if (!trimmed) {
          continue;
        }
        const parts = trimmed.split("=");
        const lhs = parts[0].trim().replace(/^\*+/u, "");
        const paramNameMatch = lhs.match(/^([A-Za-z_][A-Za-z0-9_]*)/u);
        if (paramNameMatch) {
          analysis.defParams.push(paramNameMatch[1]);
        }
        if (parts.length > 1) {
          addNames(parts.slice(1).join("=").trim(), analysis.uses);
        }
      }
    }
    return finalizeAnalysis(analysis);
  }

  if (keyword === "class") {
    const classMatch = withoutAttributes.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?\s*:/u);
    if (classMatch) {
      analysis.defines.push(classMatch[1]);
      if (classMatch[2]) {
        addNames(classMatch[2], analysis.uses);
      }
    }
    return finalizeAnalysis(analysis);
  }

  if (keyword === "for") {
    const forMatch = withoutAttributes.match(/^for\s+(.+?)\s+in\s+(.+)\s*:\s*$/u);
    if (forMatch) {
      for (const target of parseAssignmentTargets(forMatch[1])) {
        analysis.defines.push(target);
      }
      addNames(forMatch[2], analysis.uses);
    }
    return finalizeAnalysis(analysis);
  }

  const augAssignMatch = withoutAttributes.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[+\-*/%&|^]=\s*(.+)$/u);
  if (augAssignMatch) {
    analysis.uses.push(augAssignMatch[1]);
    addNames(augAssignMatch[2], analysis.uses);
    analysis.defines.push(augAssignMatch[1]);
    return finalizeAnalysis(analysis);
  }

  const assignMatch = withoutAttributes.match(/^(.+?)\s*=\s*(.+)$/u);
  if (assignMatch && !/==|!=|<=|>=/u.test(withoutAttributes)) {
    for (const target of parseAssignmentTargets(assignMatch[1])) {
      analysis.defines.push(target);
    }
    addNames(assignMatch[2], analysis.uses);
    return finalizeAnalysis(analysis);
  }

  addNames(withoutAttributes, analysis.uses);
  return finalizeAnalysis(analysis);
}

function finalizeAnalysis(analysis) {
  analysis.defines = dedupe(analysis.defines);
  analysis.uses = dedupe(analysis.uses.filter((name) => !analysis.defParams.includes(name)));
  analysis.defParams = dedupe(analysis.defParams);
  return analysis;
}

function parseAssignmentTargets(lhs) {
  const cleaned = lhs.replace(/[()\[\]]/gu, " ");
  const chunks = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  const names = [];
  for (const chunk of chunks) {
    const match = chunk.match(/^([A-Za-z_][A-Za-z0-9_]*)$/u);
    if (match) {
      names.push(match[1]);
    }
  }
  return names;
}

function splitArgs(rawArgs) {
  const args = [];
  let current = "";
  let depth = 0;
  for (const char of rawArgs) {
    if (char === "," && depth === 0) {
      args.push(current);
      current = "";
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    } else if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
    }
    current += char;
  }
  if (current.trim() !== "") {
    args.push(current);
  }
  return args;
}

function addNames(fragment, collector) {
  const tokens = fragment.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/gu) || [];
  for (const token of tokens) {
    if (!PY_KEYWORDS.has(token)) {
      collector.push(token);
    }
  }
}

function extractFStringExpressions(text) {
  const expressions = [];
  const stringMatches =
    text.match(/\b[fF][rRuUbB]*"(?:\\.|[^"\\])*"|\b[fF][rRuUbB]*'(?:\\.|[^'\\])*'/gu) || [];

  for (const matched of stringMatches) {
    const noPrefix = matched.replace(/^[fFrRuUbB]+/u, "");
    if (noPrefix.length < 2) {
      continue;
    }
    const body = noPrefix.slice(1, -1);
    const braceMatches = body.match(/\{[^{}]+\}/gu) || [];
    for (const brace of braceMatches) {
      expressions.push(brace.slice(1, -1));
    }
  }

  return expressions;
}

function stripStringLiterals(text) {
  return text.replace(/(?:\b[furbFURB]+)?"(?:\\.|[^"\\])*"|(?:\b[furbFURB]+)?'(?:\\.|[^'\\])*'/gu, "");
}

function isBlockHeader(rawText) {
  const text = rawText.trim();
  return BLOCK_HEADER_REGEX.test(text);
}

function dedupe(items) {
  return [...new Set(items)];
}

function renderSolutionPreview() {
  const lineById = getActiveLineMap();

  const code = state.slots
    .map((id, index) => {
      const line = lineById.get(id);
      return `${" ".repeat(state.indents[index] * 4)}${line.text}`;
    })
    .join("\n");
  previewEl.hidden = false;
  previewEl.textContent = code;
}

function resetPuzzle() {
  const task = getActiveTask();
  state.slots = new Array(task.lines.length).fill(null);
  state.indents = new Array(task.lines.length).fill(0);
  state.selectedBlockId = null;
  state.bankOrder = shuffle(state.bankPoolIds.slice());
  render();
  setResult("Стан очищено. Збери програму ще раз.", "neutral");
  previewEl.hidden = true;
}

function setResult(message, type) {
  resultEl.textContent = message;
  resultEl.classList.remove("is-ok", "is-error");
  if (type === "ok") {
    resultEl.classList.add("is-ok");
  }
  if (type === "error") {
    resultEl.classList.add("is-error");
  }
}

function createToolButton(label, action, slotIndex) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tool-btn";
  btn.dataset.action = action;
  btn.dataset.slot = String(slotIndex);
  btn.textContent = label;
  return btn;
}

function shuffle(arr) {
  const array = arr.slice();
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTasks(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((task) => {
      const lines = Array.isArray(task.lines)
        ? task.lines
            .filter((line) => line && typeof line.text === "string" && line.text.trim() !== "")
            .map((line, index) => ({
              id: typeof line.id === "string" ? line.id : `line-${index + 1}`,
              text: line.text.trim(),
              canonicalIndent: Number.isInteger(line.canonicalIndent) ? line.canonicalIndent : 0
            }))
        : [];

      return {
        id: String(task.id || "task"),
        number: Number(task.number),
        title: String(task.title || "Завдання"),
        description: String(task.description || "Збери програму з блоків коду."),
        lines
      };
    })
    .filter((task) => task.lines.length > 0);
}

function formatTaskLabel(task) {
  const number = Number(task?.number);
  if (Number.isFinite(number)) {
    return `Завдання ${number}`;
  }
  return String(task?.title || "Завдання");
}

function normalizeTaskExamples(input) {
  if (!input || typeof input !== "object") {
    return {};
  }

  const normalized = {};
  for (const [taskId, rawExamples] of Object.entries(input)) {
    if (!Array.isArray(rawExamples)) {
      continue;
    }
    const cleaned = rawExamples
      .map((example) => String(example || "").trim())
      .filter(Boolean)
      .slice(0, 3);
    if (cleaned.length > 0) {
      normalized[String(taskId)] = cleaned;
    }
  }
  return normalized;
}

function renderTaskExamples(task) {
  if (!taskExamplesEl) {
    return;
  }

  const fallback = ["Приклад виводу недоступний."];
  const examples = taskExamplesData[task.id] || fallback;

  taskExamplesEl.innerHTML = "";
  examples.slice(0, 3).forEach((example, index) => {
    const item = document.createElement("article");
    item.className = "task-example-item";

    const label = document.createElement("p");
    label.className = "task-example-label";
    label.textContent = `Приклад ${index + 1}`;

    const code = document.createElement("pre");
    code.className = "task-example-code";
    code.textContent = example;

    item.append(label, code);
    taskExamplesEl.appendChild(item);
  });
}

function normalizeAllLines(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((line) => ({
      id: String(line?.id || ""),
      text: typeof line?.text === "string" ? line.text.trim() : "",
      taskId: String(line?.taskId || "")
    }))
    .filter((line) => line.id && line.text);
}

function generateTaskBankIds(task, extrasCount) {
  const ownIds = task.lines.map((line) => line.id);
  const ownIdSet = new Set(ownIds);
  const ownTextSet = new Set(task.lines.map((line) => line.text));

  const foreignCandidates = allLinesData
    .filter((line) => line.taskId !== String(task.id) && !ownIdSet.has(line.id) && !ownTextSet.has(line.text))
    .map((line) => line.id);

  const shuffledForeign = shuffle(foreignCandidates);
  const extraIds = shuffledForeign.slice(0, Math.max(0, Math.min(extrasCount, shuffledForeign.length)));
  return ownIds.concat(extraIds);
}
