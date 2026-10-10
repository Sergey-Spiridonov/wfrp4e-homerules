# Мутационная проверка стенда для правила «Всадник против всадника» (1.15.0):
# каждая поломка должна уронить хотя бы один сценарий tests/stand.js.
import os
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

HERE = Path(__file__).resolve().parent
SRC = str(HERE.parent / "scripts" / "homerules.js")
src = open(SRC, encoding="utf-8").read()

MUTATIONS = [
    ("+20 системы не снимается", "        dialog.fields.modifier -= 20;\n        const label", "        const label"),
    ("строка системы остаётся в подсказке", "            tips.splice(at, 1);", "            // оставили"),
    ("снимаем +20 и без него", "    if (mine - other.sizeNum >= 1)\n    {\n        dialog.fields.modifier -= 20;", "    if (true)\n    {\n        dialog.fields.modifier -= 20;"),
    ("крупнее — без +20", "        dialog.fields.modifier += 20;\n        dialog.tooltips.add(\"modifier\", 20,", "        dialog.tooltips.add(\"modifier\", 20,"),
    ("мельче — без −10", "        dialog.fields.modifier -= 10;\n        dialog.tooltips.add(\"modifier\", -10,", "        dialog.tooltips.add(\"modifier\", -10,"),
    ("длинное оружие не спасает", "else if (mine < theirs && !((Number(dialog.item.reachNum) || 0) >= 5))", "else if (mine < theirs)"),
    ("и стрельба", "if (!game.settings.get(MODULE, MOUNTED_SETTING) || dialog?.item?.attackType !== \"melee\")", "if (!game.settings.get(MODULE, MOUNTED_SETTING))"),
    ("и при выключенном правиле", "if (!game.settings.get(MODULE, MOUNTED_SETTING) || dialog?.item?.attackType !== \"melee\")", "if (dialog?.item?.attackType !== \"melee\")"),
    ("и против пешего", "    return Boolean(actor?.isMounted && other?.isMounted", "    return Boolean(actor?.isMounted"),
    ("оборачиваем повторно", "if (typeof original !== \"function\" || original.homeruleMounted)", "if (typeof original !== \"function\")"),
    ("оборачиваем наследника", "while (proto && proto.constructor?.name !== \"AttackDialog\")", "while (proto && !proto.hasOwnProperty(\"_computeTargets\") && proto.constructor?.name !== \"AttackDialog\")"),
    ("первое окно не перерисовывается", "app.data?.targets?.[0]))\n        {\n            app.render();", "app.data?.targets?.[0]))\n        {\n            // без перерисовки"),
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
