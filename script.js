const programLines = [
  { id: "line-1", text: 'word = input("Введи слово: ")', indent: 0 },
  { id: "line-2", text: 'vowels = "аеєиіїоуюя"', indent: 0 },
  { id: "line-3", text: "count = 0", indent: 0 },
  { id: "line-4", text: "for ch in word:", indent: 0 },
  { id: "line-5", text: "if ch.lower() in vowels:", indent: 1 },
  { id: "line-6", text: "count += 1", indent: 2 },
  { id: "line-7", text: 'print("Голосних:", count)', indent: 1 }
];

const slotRules = [
  { allowedIds: ["line-1"], indent: 0 },
  { allowedIds: ["line-2", "line-3"], indent: 0 },
  { allowedIds: ["line-2", "line-3"], indent: 0 },
  { allowedIds: ["line-4"], indent: 0 },
  { allowedIds: ["line-5"], indent: 1 },
  { allowedIds: ["line-6"], indent: 2 },
  { allowedIds: ["line-7"], indent: 1 }
];

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
setResult("Збери програму: порядок + відступи. Для рядків 2/3 порядок не критичний.", "neutral");

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

  for (let i = 0; i < slotRules.length; i += 1) {
    const rule = slotRules[i];
    const actualId = state.slots[i];

    if (!actualId) {
      issues.push(`Рядок ${i + 1}: порожній.`);
      continue;
    }

    if (!rule.allowedIds.includes(actualId)) {
      issues.push(`Рядок ${i + 1}: неправильний блок.`);
    }

    if (state.indents[i] !== rule.indent) {
      issues.push(`Рядок ${i + 1}: відступ ${state.indents[i]}, очікується ${rule.indent}.`);
    }
  }

  if (issues.length === 0) {
    setResult("Готово. Рішення правильне. Рядки 2 і 3 можуть бути в будь-якому порядку.", "ok");
    renderSolutionPreview();
    return;
  }

  const previewIssues = issues.slice(0, 4).join("\n");
  const extra = issues.length > 4 ? `\n...і ще ${issues.length - 4} помилок.` : "";
  setResult(`${previewIssues}${extra}`, "error");
  previewEl.hidden = true;
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
