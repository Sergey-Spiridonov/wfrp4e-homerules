# Мутационная проверка стенда для урона по графе травмы при отводе чертой «Броня»
# (1.14.2): каждая поломка должна уронить хотя бы один сценарий tests/stand.js.
import os
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

HERE = Path(__file__).resolve().parent
SRC = str(HERE.parent / "scripts" / "homerules.js")
src = open(SRC, encoding="utf-8").read()

MUTATIONS = [
    ("травма на листе не снимается", "        await applied.delete();\n", ""),
    ("травма на листе: пункты снимаются второй раз", "        await applied.delete();\n", "        await applied.delete();\n        await actor.modifyWounds(-3);\n"),
    ("выпавшие пункты прибавляются", "            await actor.modifyWounds(-wounds);\n            return { wounds, postedMessage: posted,", "            await actor.modifyWounds(wounds);\n            return { wounds, postedMessage: posted,"),
    ("травма из чата — любой атаки", "data.flags?.wfrp4e?.sourceMessageId === messageId)\n        {\n            return recent[i];", "data)\n        {\n            return recent[i];"),
    ("берётся первая травма, а не последняя", "for (let i = recent.length - 1; i >= 0; i--)\n    {\n        const data = recent[i]?.system?.itemData;", "for (let i = 0; i < recent.length; i++)\n    {\n        const data = recent[i]?.system?.itemData;"),
    ("на лист не пускаем никому", "if (source && critDeflectedFor(source, item.parent))", "if (source && hackAppliedFrom(source, \"crit\").length)"),
    ("карточка травмы зачёркнута без отвода", "            if (source && hackAppliedFrom(source, \"crit\").length)\n            {\n                root.querySelector(\".post-item\")", "            if (source)\n            {\n                root.querySelector(\".post-item\")"),
    ("«Отменить» не возвращает пункты", "            await trait.parent.modifyWounds?.(card.wounds); // пункты, снятые по графе травмы", "            // пункты не возвращаем"),
    ("не ведущий бросает сам", "    if (!game.user.isGM)\n    {\n        return { line: \"Бросок по таблице травм — за ведущим", "    if (false)\n    {\n        return { line: \"Бросок по таблице травм — за ведущим"),
]


def run(m):
    name, a, b = m
    assert src.count(a) == 1, name
    path = HERE / f".mut-{abs(hash(name))}.js"
    path.write_text(src.replace(a, b), encoding="utf-8")
    try:
        r = subprocess.run(["node", str(HERE / "stand.js")], env={**os.environ, "HR_SRC": str(path)},
                           capture_output=True, text=True, encoding="utf-8", timeout=300)
        return name, r.returncode != 0
    finally:
        path.unlink(missing_ok=True)


with ThreadPoolExecutor(4) as ex:
    results = list(ex.map(run, MUTATIONS))
for name, caught in results:
    print(("поймана  " if caught else "ПРОПУЩЕНА ") + name)
print(f"поймано {sum(c for _, c in results)} из {len(results)}")
