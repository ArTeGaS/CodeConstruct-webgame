const programLines = [
  { id: "line-1", text: 'word = input("Введи слово: ")' },
  { id: "line-2", text: 'vowels = "аеєиіїоуюя"' },
  { id: "line-3", text: "count = 0" },
  { id: "line-4", text: "for ch in word:" },
  { id: "line-5", text: "if ch.lower() in vowels:" },
  { id: "line-6", text: "count += 1" },
  { id: "line-7", text: 'print("Голосних:", count)' }
];

const PY_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "case", "class",
  "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
  "if", "import", "in", "is", "lambda", "match", "nonlocal", "not", "or", "pass", "raise",
  "return", "try", "while", "with", "yield"
]);

const PY_GLOBALS = new Set([
  "input", "print", "len", "range", "str", "int", "float", "bool", "list", "dict", "set",
  "tuple", "sum", "min", "max", "abs", "enumerate", "any", "all"
]);

const MAX_INDENT = 4;
const lineById = new Map(programLines.map((line) => [line.id, line]));

const state = {
  slots: new Array(programLines.length).fill(null),
  indents: new Array(programLines.length).fill(0),
  bankOrder: shuffle(programLines.map((line) => line.id)),
  selectedBlockId: null
};

const editorSlotsEl = document.getElementById("editor-slots");
const codeBankEl = document.getElementById("code-bank");
const resultEl = document.getElementById("result");
const previewEl = document.getElementById("solution-preview");
const checkBtn = document.getElementById("check-btn");
const resetBtn = document.getElementById("reset-btn");
const shuffleBtn = document.getElementById("shuffle-btn");

render();
setResult("Збери програму: перевіряємо синтаксис Python (блоки, відступи, використання змінних).", "neutral");

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

checkBtn.addEventListener("click", checkSolution);
resetBtn.addEventListener("click", resetPuzzle);
shuffleBtn.addEventListener("click", () => {
  state.bankOrder = shuffle(state.bankOrder.slice());
  state.selectedBlockId = null;
  renderBank();
});

function render() {
  renderEditor();
  renderBank();
}

function renderEditor() {
  editorSlotsEl.innerHTML = "";

  for (let i = 0; i < programLines.length; i += 1) {
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
  codeBankEl.innerHTML = "";
  const used = new Set(state.slots.filter(Boolean));
  const available = state.bankOrder.filter((id) => !used.has(id));

  if (available.length === 0) {
    const donePlaceholder = document.createElement("div");
    donePlaceholder.className = "bank-placeholder";
    donePlaceholder.textContent = "Усі блоки вже в редакторі. Перевір рішення або підкоригуй порядок.";
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
  issues.push(...validateNameDependencies(assembled));

  if (issues.length === 0) {
    setResult("Готово. Синтаксис зібрано правильно.", "ok");
    renderSolutionPreview();
    return;
  }

  const previewIssues = issues.slice(0, 5).join("\n");
  const extra = issues.length > 5 ? `\n...і ще ${issues.length - 5} помилок.` : "";
  setResult(`${previewIssues}${extra}`, "error");
  previewEl.hidden = true;
}

function buildAssembledProgram() {
  return state.slots
    .map((id, index) => {
      if (!id) {
        return null;
      }
      const line = lineById.get(id);
      const analysis = analyzeLine(line.text);
      return {
        lineNumber: index + 1,
        text: line.text,
        indent: state.indents[index],
        opensBlock: analysis.opensBlock,
        defines: analysis.defines,
        uses: analysis.uses
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
        issues.push(`Рядок ${line.lineNumber}: зайвий відступ без попереднього ':'`);
      }
      if (line.indent !== prev.indent + 1) {
        issues.push(`Рядок ${line.lineNumber}: відступ має збільшуватися лише на 1 рівень.`);
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
      issues.push(`Рядок ${prev.lineNumber}: після ':' потрібен вкладений блок.`);
    }
  }

  const lastLine = lines[lines.length - 1];
  if (lastLine.opensBlock) {
    issues.push(`Рядок ${lastLine.lineNumber}: після ':' бракує вкладених рядків.`);
  }

  return dedupe(issues);
}

function validateNameDependencies(lines) {
  const issues = [];
  const knownNames = new Set(PY_GLOBALS);

  for (const line of lines) {
    for (const name of line.uses) {
      if (!knownNames.has(name)) {
        issues.push(`Рядок ${line.lineNumber}: '${name}' використано до оголошення.`);
      }
    }
    for (const name of line.defines) {
      knownNames.add(name);
    }
  }

  return dedupe(issues);
}

function analyzeLine(rawText) {
  const text = rawText.trim();
  const withoutStrings = stripStringLiterals(text);
  const withoutAttributes = withoutStrings.replace(/\.[A-Za-z_][A-Za-z0-9_]*/g, "");
  const defines = new Set();
  const uses = new Set();

  const forMatch = withoutAttributes.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+):$/);
  if (forMatch) {
    defines.add(forMatch[1]);
    addNames(forMatch[2], uses);
    return {
      opensBlock: true,
      defines: [...defines],
      uses: [...uses]
    };
  }

  const augAssignMatch = withoutAttributes.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*([+\-*/%]=)\s*(.+)$/);
  if (augAssignMatch) {
    const target = augAssignMatch[1];
    uses.add(target);
    addNames(augAssignMatch[3], uses);
    defines.add(target);
    return {
      opensBlock: text.endsWith(":"),
      defines: [...defines],
      uses: [...uses]
    };
  }

  const assignMatch = withoutAttributes.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
  if (assignMatch) {
    defines.add(assignMatch[1]);
    addNames(assignMatch[2], uses);
    return {
      opensBlock: text.endsWith(":"),
      defines: [...defines],
      uses: [...uses]
    };
  }

  addNames(withoutAttributes, uses);

  return {
    opensBlock: text.endsWith(":"),
    defines: [...defines],
    uses: [...uses]
  };
}

function addNames(fragment, targetSet) {
  const tokens = fragment.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
  for (const token of tokens) {
    if (!PY_KEYWORDS.has(token)) {
      targetSet.add(token);
    }
  }
}

function stripStringLiterals(text) {
  return text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
}

function dedupe(items) {
  return [...new Set(items)];
}

function renderSolutionPreview() {
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
  state.slots.fill(null);
  state.indents.fill(0);
  state.selectedBlockId = null;
  state.bankOrder = shuffle(state.bankOrder.slice());
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
