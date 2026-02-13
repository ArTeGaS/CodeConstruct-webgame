const tasks = normalizeTasks(window.TASKS_DATA || []);
const BLOCK_HEADER_REGEX = /^(if|elif|else|for|while|def|class|try|except|finally|with|match|case)\b.*:\s*$/;
const MAX_INDENT = 6;

const state = {
  activeTaskIndex: 0,
  slots: [],
  indents: [],
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
  state.bankOrder = shuffle(task.lines.map((line) => line.id));
  state.selectedBlockId = null;

  taskTitleEl.textContent = task.title;
  taskDescriptionEl.textContent = task.description;
  previewEl.hidden = true;

  setResult("Збери програму в редакторі та перевір синтаксис.", "neutral");
  renderTaskList();
  render();
}

function getActiveTask() {
  return tasks[state.activeTaskIndex];
}

function getActiveLineMap() {
  return new Map(getActiveTask().lines.map((line) => [line.id, line]));
}

function renderTaskList() {
  taskListEl.innerHTML = "";
  tasks.forEach((task, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-item task-btn";
    button.dataset.taskIndex = String(index);
    button.textContent = task.title;
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

  const assembled = buildAssembledProgram();
  issues.push(...validateBlockSyntax(assembled));

  if (issues.length === 0) {
    setResult("Готово. Базовий синтаксис Python зібрано правильно.", "ok");
    renderSolutionPreview();
    return;
  }

  const previewIssues = issues.slice(0, 5).join("\n");
  const extra = issues.length > 5 ? `\n...і ще ${issues.length - 5} помилок.` : "";
  setResult(`${previewIssues}${extra}`, "error");
  previewEl.hidden = true;
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
        opensBlock: isBlockHeader(line.text)
      };
    })
    .filter(Boolean);
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
      if (!prev.opensBlock) {
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

    if (prev && prev.opensBlock && line.indent <= prev.indent) {
      issues.push(`Рядок ${prev.lineNumber}: після ':' потрібен вкладений рядок.`);
    }
  }

  const lastLine = lines[lines.length - 1];
  if (lastLine.opensBlock) {
    issues.push(`Рядок ${lastLine.lineNumber}: після ':' бракує вкладеного блоку.`);
  }

  return dedupe(issues);
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
  state.bankOrder = shuffle(task.lines.map((line) => line.id));
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
        title: String(task.title || "Завдання"),
        description: String(task.description || "Збери програму з блоків коду."),
        lines
      };
    })
    .filter((task) => task.lines.length > 0);
}
