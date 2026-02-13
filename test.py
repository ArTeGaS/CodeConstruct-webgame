import itertools
import json
import math
import re
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TASKS_FILE = ROOT / "tasks-data.json"
REPORT_FILE = ROOT / "permutation_trace_report.json"
STEP_LIMIT = 1200
EXAMPLES_PER_TASK = 4

BLOCK_HEADER_RE = re.compile(r"^(if|elif|else|for|while|def|class|try|except|finally|with|match|case)\b.*:\s*$")

PY_KEYWORDS = {
    "False", "None", "True", "and", "as", "assert", "async", "await", "break", "case", "class",
    "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
    "if", "import", "in", "is", "lambda", "match", "nonlocal", "not", "or", "pass", "raise",
    "return", "try", "while", "with", "yield",
}

PY_BUILTINS = {
    "input", "print", "int", "float", "str", "bool", "len", "range", "sum", "min", "max", "abs",
    "round", "list", "dict", "set", "tuple", "enumerate", "zip", "sorted", "reversed", "map",
    "filter", "any", "all",
}

LOOP_KEYWORDS = {"for", "while"}
CONDITIONAL_BLOCK_KEYWORDS = {"if", "elif", "else", "for", "while", "try", "except", "finally", "with", "match", "case"}


class StepLimitExceeded(RuntimeError):
    pass


def dedupe(items):
    seen = set()
    out = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def is_block_header(raw_text: str) -> bool:
    return bool(BLOCK_HEADER_RE.match(raw_text.strip()))


def strip_string_literals(text: str) -> str:
    return re.sub(r"(?:\b[furbFURB]+)?\"(?:\\.|[^\"\\])*\"|(?:\b[furbFURB]+)?'(?:\\.|[^'\\])*'", "", text)


def extract_fstring_expressions(text: str):
    expressions = []
    string_matches = re.findall(r"\b[fF][rRuUbB]*\"(?:\\.|[^\"\\])*\"|\b[fF][rRuUbB]*'(?:\\.|[^'\\])*'", text)
    for matched in string_matches:
        no_prefix = re.sub(r"^[fFrRuUbB]+", "", matched)
        if len(no_prefix) < 2:
            continue
        body = no_prefix[1:-1]
        for chunk in re.findall(r"\{[^{}]+\}", body):
            expressions.append(chunk[1:-1])
    return expressions


def split_args(raw_args: str):
    args = []
    current = []
    depth = 0
    for ch in raw_args:
        if ch == "," and depth == 0:
            args.append("".join(current))
            current = []
            continue
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth = max(0, depth - 1)
        current.append(ch)
    if "".join(current).strip():
        args.append("".join(current))
    return args


def parse_assignment_targets(lhs: str):
    cleaned = re.sub(r"[()\[\]]", " ", lhs)
    names = []
    for chunk in cleaned.split(","):
        chunk = chunk.strip()
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", chunk):
            names.append(chunk)
    return names


def add_names(fragment: str, collector: list[str]):
    for token in re.findall(r"\b[A-Za-z_][A-Za-z0-9_]*\b", fragment):
        if token not in PY_KEYWORDS:
            collector.append(token)


def finalize_analysis(info: dict):
    defines = dedupe(info["defines"])
    params = dedupe(info["defParams"])
    uses = dedupe([name for name in info["uses"] if name not in params])

    info["defines"] = defines
    info["defParams"] = params
    info["uses"] = uses
    return info


def parse_line_analysis(raw_text: str):
    text = raw_text.strip()
    keyword_match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\b", text)
    keyword = keyword_match.group(1) if keyword_match else ""

    info = {
        "keyword": keyword,
        "opensBlock": is_block_header(text),
        "defines": [],
        "uses": [],
        "defParams": [],
        "isReturn": bool(re.match(r"^return\b", text)),
        "isBreak": bool(re.match(r"^break\b", text)),
        "isContinue": bool(re.match(r"^continue\b", text)),
    }

    for expr in extract_fstring_expressions(text):
        add_names(expr, info["uses"])

    sanitized = strip_string_literals(text)
    sanitized = re.sub(r"#.*", "", sanitized)
    without_attrs = re.sub(r"\.[A-Za-z_][A-Za-z0-9_]*", "", sanitized)

    if keyword == "import":
        import_body = re.sub(r"^import\s+", "", sanitized)
        for part in split_args(import_body):
            m = re.match(r"^([A-Za-z_][A-Za-z0-9_.]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$", part.strip())
            if not m:
                continue
            alias = m.group(2) or m.group(1).split(".")[0]
            info["defines"].append(alias)
        return finalize_analysis(info)

    if keyword == "from":
        m = re.match(r"^from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import\s+(.+)$", sanitized)
        if m:
            for item in split_args(m.group(2)):
                item = item.strip()
                if not item or item == "*":
                    continue
                im = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$", item)
                if not im:
                    continue
                info["defines"].append(im.group(2) or im.group(1))
        return finalize_analysis(info)

    if keyword == "def":
        m = re.match(r"^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*:", without_attrs)
        if m:
            info["defines"].append(m.group(1))
            for param in split_args(m.group(2)):
                part = param.strip()
                if not part:
                    continue
                chunks = part.split("=")
                lhs = chunks[0].strip().lstrip("*")
                pm = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)", lhs)
                if pm:
                    info["defParams"].append(pm.group(1))
                if len(chunks) > 1:
                    add_names("=".join(chunks[1:]).strip(), info["uses"])
        return finalize_analysis(info)

    if keyword == "class":
        m = re.match(r"^class\s+([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?\s*:", without_attrs)
        if m:
            info["defines"].append(m.group(1))
            if m.group(2):
                add_names(m.group(2), info["uses"])
        return finalize_analysis(info)

    if keyword == "for":
        m = re.match(r"^for\s+(.+?)\s+in\s+(.+)\s*:\s*$", without_attrs)
        if m:
            info["defines"].extend(parse_assignment_targets(m.group(1)))
            add_names(m.group(2), info["uses"])
        return finalize_analysis(info)

    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*[+\-*/%&|^]=\s*(.+)$", without_attrs)
    if m:
        info["uses"].append(m.group(1))
        add_names(m.group(2), info["uses"])
        info["defines"].append(m.group(1))
        return finalize_analysis(info)

    m = re.match(r"^(.+?)\s*=\s*(.+)$", without_attrs)
    if m and not re.search(r"==|!=|<=|>=", without_attrs):
        info["defines"].extend(parse_assignment_targets(m.group(1)))
        add_names(m.group(2), info["uses"])
        return finalize_analysis(info)

    add_names(without_attrs, info["uses"])
    return finalize_analysis(info)


def validate_block_syntax(lines):
    issues = []
    if not lines:
        return issues

    if lines[0]["indent"] != 0:
        issues.append("Рядок 1: програма має починатися без відступу.")

    indent_stack = [0]

    for i, line in enumerate(lines):
        prev = lines[i - 1] if i > 0 else None

        if line["indent"] < 0:
            issues.append(f"Рядок {line['lineNumber']}: некоректний відступ.")
            continue

        if prev and line["indent"] > prev["indent"]:
            if not prev["analysis"]["opensBlock"]:
                issues.append(f"Рядок {line['lineNumber']}: зайвий відступ без попереднього блоку.")
            if line["indent"] != prev["indent"] + 1:
                issues.append(f"Рядок {line['lineNumber']}: відступ має збільшуватись тільки на 1 рівень.")
            indent_stack.append(line["indent"])
            continue

        while len(indent_stack) > 1 and line["indent"] < indent_stack[-1]:
            indent_stack.pop()

        if line["indent"] != indent_stack[-1]:
            issues.append(f"Рядок {line['lineNumber']}: некоректний рівень відступу.")

        if prev and prev["analysis"]["opensBlock"] and line["indent"] <= prev["indent"]:
            issues.append(f"Рядок {prev['lineNumber']}: після ':' потрібен вкладений рядок.")

    if lines[-1]["analysis"]["opensBlock"]:
        issues.append(f"Рядок {lines[-1]['lineNumber']}: після ':' бракує вкладеного блоку.")

    return dedupe(issues)


def validate_keyword_chains(lines):
    issues = []
    block_stack = []
    if_chains = set()
    try_chains = {}

    for line in lines:
        keyword = line["analysis"]["keyword"]

        while block_stack and line["indent"] <= block_stack[-1]["indent"]:
            block_stack.pop()

        for indent in [x for x in if_chains if x > line["indent"]]:
            if_chains.discard(indent)

        for indent in [x for x in try_chains if x > line["indent"]]:
            state = try_chains[indent]
            if not state["hasHandler"]:
                issues.append(f"Рядок {state['lineNumber']}: після try потрібен except або finally.")
            del try_chains[indent]

        if line["indent"] in if_chains and keyword not in {"elif", "else"}:
            if_chains.discard(line["indent"])

        if line["indent"] in try_chains and keyword not in {"except", "finally"}:
            state = try_chains[line["indent"]]
            if not state["hasHandler"]:
                issues.append(f"Рядок {state['lineNumber']}: після try потрібен except або finally.")
            del try_chains[line["indent"]]

        if keyword in {"elif", "else"} and line["indent"] not in if_chains:
            issues.append(f"Рядок {line['lineNumber']}: '{keyword}' без відповідного if.")
        if keyword == "elif":
            if_chains.add(line["indent"])
        elif keyword == "else":
            if_chains.discard(line["indent"])
        elif keyword == "if":
            if_chains.add(line["indent"])

        if keyword in {"except", "finally"} and line["indent"] not in try_chains:
            issues.append(f"Рядок {line['lineNumber']}: '{keyword}' без відповідного try.")
        if keyword == "except":
            if line["indent"] in try_chains:
                try_chains[line["indent"]]["hasHandler"] = True
        elif keyword == "finally":
            if line["indent"] in try_chains:
                try_chains[line["indent"]]["hasHandler"] = True
                del try_chains[line["indent"]]
        elif keyword == "try":
            try_chains[line["indent"]] = {"hasHandler": False, "lineNumber": line["lineNumber"]}

        inside_function = any(block["keyword"] == "def" for block in block_stack)
        inside_loop = any(block["keyword"] in LOOP_KEYWORDS for block in block_stack)

        if line["analysis"]["isReturn"] and not inside_function:
            issues.append(f"Рядок {line['lineNumber']}: return може бути лише всередині def.")
        if line["analysis"]["isBreak"] and not inside_loop:
            issues.append(f"Рядок {line['lineNumber']}: break може бути лише всередині циклу.")
        if line["analysis"]["isContinue"] and not inside_loop:
            issues.append(f"Рядок {line['lineNumber']}: continue може бути лише всередині циклу.")

        if line["analysis"]["opensBlock"]:
            block_stack.append({"indent": line["indent"], "keyword": keyword})

    for state in try_chains.values():
        if not state["hasHandler"]:
            issues.append(f"Рядок {state['lineNumber']}: після try потрібен except або finally.")

    return dedupe(issues)


def collect_visible_names(global_known, scopes, conditional_scopes):
    names = set(global_known)
    for scope in scopes:
        names.update(scope["locals"])
    for scope in conditional_scopes:
        names.update(scope["names"])
    return names


def register_definition(name, global_known, scopes, conditional_scopes):
    if not name:
        return
    if len(scopes) > 1:
        scopes[-1]["locals"].add(name)
    elif conditional_scopes:
        conditional_scopes[-1]["names"].add(name)
    else:
        global_known.add(name)


def validate_name_dependencies(lines):
    issues = []
    global_known = set(PY_BUILTINS)
    scopes = [{"indent": -1, "kind": "module", "locals": set()}]
    block_stack = []
    conditional_scopes = []

    for line in lines:
        while block_stack and line["indent"] <= block_stack[-1]["indent"]:
            block_stack.pop()
        while conditional_scopes and line["indent"] <= conditional_scopes[-1]["indent"]:
            conditional_scopes.pop()
        while len(scopes) > 1 and line["indent"] <= scopes[-1]["indent"]:
            scopes.pop()

        visible = collect_visible_names(global_known, scopes, conditional_scopes)
        for name in line["analysis"]["uses"]:
            if name not in visible:
                issues.append(f"Рядок {line['lineNumber']}: '{name}' використано до оголошення.")

        for name in line["analysis"]["defines"]:
            register_definition(name, global_known, scopes, conditional_scopes)

        if line["analysis"]["opensBlock"] and line["analysis"]["keyword"] == "def":
            scopes.append({
                "indent": line["indent"],
                "kind": "def",
                "locals": set(line["analysis"]["defParams"]),
            })
        elif line["analysis"]["opensBlock"] and line["analysis"]["keyword"] == "class":
            scopes.append({
                "indent": line["indent"],
                "kind": "class",
                "locals": set(),
            })

        if line["analysis"]["opensBlock"]:
            block_stack.append({"indent": line["indent"], "keyword": line["analysis"]["keyword"]})
            if line["analysis"]["keyword"] in CONDITIONAL_BLOCK_KEYWORDS:
                conditional_scopes.append({"indent": line["indent"], "names": set()})

    return dedupe(issues)


def validate_program_semantics(lines):
    issues = []
    issues.extend(validate_block_syntax(lines))
    issues.extend(validate_keyword_chains(lines))
    issues.extend(validate_name_dependencies(lines))
    issues.extend(validate_recursive_base_cases(lines))
    return dedupe(issues)


def validate_recursive_base_cases(lines):
    issues = []
    def_stack = []

    def finalize_context(context):
        if not context:
            return
        if not context["base_case_recursive_lines"] or not context["top_level_plain_return_lines"]:
            return
        for line_number in context["base_case_recursive_lines"]:
            issues.append(
                f"Рядок {line_number}: підозріла рекурсія в базовій умові. "
                f"Перевір базовий return у функції '{context['name']}'."
            )

    for line in lines:
        while def_stack and line["indent"] <= def_stack[-1]["indent"]:
            finalize_context(def_stack.pop())

        active_def = def_stack[-1] if def_stack else None
        if active_def:
            while active_def["base_if_stack"] and line["indent"] <= active_def["base_if_stack"][-1]["indent"]:
                active_def["base_if_stack"].pop()

            if line["analysis"]["keyword"] == "if" and line["indent"] == active_def["indent"] + 1:
                condition = extract_if_condition(line["text"])
                if is_likely_base_case_condition(condition, active_def["params"]):
                    active_def["base_if_stack"].append({"indent": line["indent"]})

            if line["analysis"]["isReturn"]:
                is_recursive_return = has_function_call(line["text"], active_def["name"])
                if (
                    is_recursive_return
                    and active_def["base_if_stack"]
                    and line["indent"] > active_def["base_if_stack"][-1]["indent"]
                ):
                    active_def["base_case_recursive_lines"].append(line["lineNumber"])
                elif not is_recursive_return and line["indent"] == active_def["indent"] + 1:
                    active_def["top_level_plain_return_lines"].append(line["lineNumber"])

        if line["analysis"]["keyword"] == "def" and line["analysis"]["opensBlock"]:
            def_name = line["analysis"]["defines"][0] if line["analysis"]["defines"] else None
            if def_name:
                def_stack.append(
                    {
                        "name": def_name,
                        "indent": line["indent"],
                        "params": list(line["analysis"]["defParams"]),
                        "base_if_stack": [],
                        "base_case_recursive_lines": [],
                        "top_level_plain_return_lines": [],
                    }
                )

    while def_stack:
        finalize_context(def_stack.pop())

    return dedupe(issues)


def extract_if_condition(text: str) -> str:
    m = re.match(r"^if\s+(.+)\s*:\s*$", text.strip())
    return m.group(1) if m else ""


def is_likely_base_case_condition(condition: str, params: list[str]) -> bool:
    if not condition:
        return False
    cleaned = re.sub(r"\s+", " ", strip_string_literals(condition)).strip()
    if not cleaned:
        return False

    if params:
        param_pattern = "|".join(re.escape(name) for name in params)
    else:
        param_pattern = r"[A-Za-z_][A-Za-z0-9_]*"

    left = re.compile(rf"\b(?:{param_pattern})\s*(?:<=|<|==)\s*(?:0|1)\b")
    right = re.compile(rf"\b(?:0|1)\s*(?:>=|>|==)\s*(?:{param_pattern})\b")
    return bool(left.search(cleaned) or right.search(cleaned))


def has_function_call(text: str, function_name: str) -> bool:
    if not function_name:
        return False
    cleaned = strip_string_literals(text)
    return bool(re.search(rf"\b{re.escape(function_name)}\s*\(", cleaned))


def build_candidate(ordered_lines, slot_pattern):
    assembled = []
    rendered = []
    for idx, line in enumerate(ordered_lines):
        indent = int(slot_pattern[idx])
        assembled.append(
            {
                "lineNumber": idx + 1,
                "text": line["text"],
                "indent": indent,
                "analysis": line["analysis"],
            }
        )
        rendered.append(" " * (indent * 4) + line["text"])
    return "\n".join(rendered), assembled


def execute_with_guard(code: str):
    steps = 0
    input_stream = iter(["1"] * 300)

    def fake_input(_prompt=""):
        return next(input_stream, "1")

    def fake_print(*_args, **_kwargs):
        return None

    def tracer(frame, event, arg):
        nonlocal steps
        if event == "line" and frame.f_code.co_filename == "<candidate>":
            steps += 1
            if steps > STEP_LIMIT:
                raise StepLimitExceeded(f"Step limit ({STEP_LIMIT}) exceeded")
        return tracer

    env = {"__name__": "__main__", "input": fake_input, "print": fake_print}

    old_trace = sys.gettrace()
    sys.settrace(tracer)
    trace_restored = False
    try:
        compiled = compile(code, "<candidate>", "exec")
        exec(compiled, env, env)
        return "ok", ""
    except Exception as exc:
        if not trace_restored:
            sys.settrace(old_trace)
            trace_restored = True
        tb_text = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__, limit=10))
        return "error", tb_text
    finally:
        if not trace_restored:
            sys.settrace(old_trace)


def analyze_task(task):
    lines = [
        {
            "id": line["id"],
            "text": line["text"],
            "canonicalIndent": int(line.get("canonicalIndent", 0)),
            "analysis": parse_line_analysis(line["text"]),
        }
        for line in task["lines"]
    ]
    slot_pattern = [line["canonicalIndent"] for line in lines]
    n = len(lines)

    permutations_total = 0
    syntax_passed = 0
    runtime_error = 0
    examples = []

    for perm in itertools.permutations(range(n)):
        permutations_total += 1
        ordered = [lines[i] for i in perm]

        code, assembled = build_candidate(ordered, slot_pattern)
        if validate_program_semantics(assembled):
            continue

        syntax_passed += 1
        status, tb = execute_with_guard(code)

        if status == "error":
            runtime_error += 1
            if len(examples) < EXAMPLES_PER_TASK:
                examples.append(
                    {
                        "perm": [i + 1 for i in perm],
                        "code": code,
                        "traceback": tb,
                    }
                )

    return {
        "task": task["title"],
        "task_number": task["number"],
        "line_count": n,
        "permutations": permutations_total,
        "syntax_passed": syntax_passed,
        "runtime_error": runtime_error,
        "examples": examples,
    }


def main():
    tasks = json.loads(TASKS_FILE.read_text(encoding="utf-8"))

    summary = {
        "total_tasks": len(tasks),
        "total_permutations": 0,
        "total_syntax_passed": 0,
        "total_runtime_error": 0,
        "tasks_with_runtime_error": [],
    }

    print(f"Loaded tasks: {len(tasks)}")

    for idx, task in enumerate(tasks, start=1):
        result = analyze_task(task)

        summary["total_permutations"] += result["permutations"]
        summary["total_syntax_passed"] += result["syntax_passed"]
        summary["total_runtime_error"] += result["runtime_error"]

        if result["runtime_error"] > 0:
            summary["tasks_with_runtime_error"].append(result)

        print(
            f"[{idx:02d}/{len(tasks):02d}] {task['title']}: "
            f"perms={result['permutations']} syntax_ok={result['syntax_passed']} "
            f"runtime_error={result['runtime_error']}"
        )

    summary["tasks_with_runtime_error"].sort(key=lambda x: x["task_number"])
    REPORT_FILE.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n=== SUMMARY ===")
    print(f"total_permutations={summary['total_permutations']}")
    print(f"total_syntax_passed={summary['total_syntax_passed']}")
    print(f"total_runtime_error={summary['total_runtime_error']}")
    print(f"tasks_with_runtime_error={len(summary['tasks_with_runtime_error'])}")
    print(f"report_file={REPORT_FILE}")


if __name__ == "__main__":
    main()
