# Мутационная проверка стенда рывка и Длани: каждая поломка должна уронить хотя бы один сценарий.
import os
import subprocess
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

SRC = str(Path(__file__).resolve().parent.parent / "scripts" / "homerules.js")
src = open(SRC, encoding="utf-8").read()

MUTATIONS = [
    ("прибавка без нижней границы", "    return Math.max(0, run + sl);", "    return run + sl;"),
    ("прибавка вычитает УУ", "    return Math.max(0, run + sl);", "    return Math.max(0, run - sl);"),
    ("раунд не сверяется", "return combat?.started && combat.round === flag.round ? flag : null;", "return combat?.started ? flag : null;"),
    ("начат ли бой — не сверяется", "return combat?.started && combat.round === flag.round ? flag : null;", "return combat && combat.round === flag.round ? flag : null;"),
    ("вне боя бессрочно", "if (sprintCombatOf(actor) || !(Date.now() - Number(flag.at) < SPRINT_LOOSE_MS))", "if (sprintCombatOf(actor))"),
    ("вне боя действует и в бою", "if (sprintCombatOf(actor) || !(Date.now() - Number(flag.at) < SPRINT_LOOSE_MS))", "if (!(Date.now() - Number(flag.at) < SPRINT_LOOSE_MS))"),
    ("прибавка и к шагу", "walk: [distance.walk[0], distance.walk[1] + Number(bonus.extra)]", "walk: [distance.walk[0] + Number(bonus.extra), distance.walk[1] + Number(bonus.extra)]"),
    ("двойная обёртка геттера", "if (typeof descriptor?.get !== \"function\" || descriptor.get.homeruleSprint)", "if (typeof descriptor?.get !== \"function\")"),
    ("сложность +40 вместо +20", "fields: { difficulty: \"average\" },", "fields: { difficulty: \"easy\" },"),
    ("пишет любой клиент", "            return; // пишет один клиент — тот, кто бросал", "            // пишет один клиент — тот, кто бросал"),
    ("правка старой карточки воскрешает", "            return; // правка старой карточки не воскрешает прошлый рывок", "            // правка старой карточки не воскрешает прошлый рывок"),
    ("перемещение в бою снимает рывок", "if (!flag || flag.combat || !actor.isOwner)", "if (!flag || !actor.isOwner)"),
    ("чужое перемещение снимает рывок", "    if ((user?.id ?? user) !== game.user.id)\n    {\n        return;\n    }\n    const actor = token?.actor;", "    const actor = token?.actor;"),
    ("кнопка и чужому", "|| !actor?.isOwner || !SPRINT_ACTOR_TYPES.includes(actor.type))", "|| !SPRINT_ACTOR_TYPES.includes(actor.type))"),
    ("кнопка и повозке", "|| !actor?.isOwner || !SPRINT_ACTOR_TYPES.includes(actor.type))", "|| !actor?.isOwner)"),
    ("подсветка наоборот", "        if (bonus)\n        {\n            button.classList.add(\"active\");", "        if (!bonus)\n        {\n            button.classList.add(\"active\");"),
    ("строка под карточкой задваивается", "if (!tag || !root || root.dataset.homeruleSprint || !game.settings.get(MODULE, SPRINT_SETTING))", "if (!tag || !root || !game.settings.get(MODULE, SPRINT_SETTING))"),
    ("минус УУ дефисом", "return sl < 0 ? \"–\" + Math.abs(sl) : \"+\" + sl;", "return sl < 0 ? String(sl) : \"+\" + sl;"),
    ("рывок пишется при выключенной настройке", "if (!tag || !game.settings.get(MODULE, SPRINT_SETTING))\n        {\n            return;\n        }\n        if ((message.author", "if (!tag)\n        {\n            return;\n        }\n        if ((message.author"),
    ("повторный рывок без вопроса", "    const active = sprintBonus(actor);\n    if (active)", "    const active = sprintBonus(actor);\n    if (false)"),
    ("закрытое окно рывка не проверяется", "        if (!test)\n        {\n            return; // окно проверки закрыли\n        }\n", ""),
    ("Длань подменяет и навык", "if (!game.settings.get(MODULE, PALM_SETTING) || languageMagick(this))", "if (!game.settings.get(MODULE, PALM_SETTING))"),
    ("Длань работает выключенной", "if (!game.settings.get(MODULE, PALM_SETTING) || languageMagick(this))", "if (languageMagick(this))"),
    ("Длань действует не надетой", "if (!palms.some(palm => palm.isEquipped ?? palm.system?.isEquipped))", "if (false)"),
    ("характеристика не та", "const dispelTest = await this.setupCharacteristic(\"wp\", {", "const dispelTest = await this.setupCharacteristic(\"int\", {"),
    ("ярлык без id карточки", "[PALM_TAG]: test.message.id", "[PALM_TAG]: true"),
    ("закрытое окно Длани роняет кнопку", "return dispelTest ?? { roll() {} };", "return dispelTest;"),
    ("двойная обёртка setupDispel", "if (typeof original !== \"function\" || original.homerulePalm)", "if (typeof original !== \"function\")"),
    ("развеивает каждый клиент", "if (!cast || game.user.id !== warhammer.utility.getActiveDocumentOwner(cast)?.id)", "if (!cast)"),
    ("в updateDispel уходит сообщение", "castTest.updateDispel(dispelTest);", "castTest.updateDispel(message);"),
    ("5-я редакция забыта", "            castTest.dispel(dispelTest);", "            // castTest.dispel(dispelTest);"),
    ("Длань по одному слову «Воланс»", "|| (/воланс/i.test(name) && /длан|ладон/i.test(name));", "|| /воланс/i.test(name);"),
    ("Длань не узнаётся по источнику", "return source.endsWith(PALM_SOURCE_ID)", "return false"),
    ("Длань не узнаётся по английскому имени", "|| /palm of volans/i.test(original) || /palm of volans/i.test(name)", ""),
]


def run(mutation):
    label, old, new = mutation
    count = src.count(old)
    if count != 1:
        return label, f"якорь найден {count} раз"
    here = Path(__file__).resolve().parent
    path = str(here / f"mut_{abs(hash(label))}.js")
    open(path, "w", encoding="utf-8").write(src.replace(old, new))
    try:
        r = subprocess.run(["node", str(here / "stand-sprint-palm.js")], capture_output=True, text=True, encoding="utf-8",
                           env=dict(os.environ, HR_SRC=os.path.abspath(path)), timeout=120)
        caught = any(line.startswith("ПАДЕНИЕ") for line in r.stdout.splitlines()) or r.returncode != 0
        return label, "поймано" if caught else "НЕ ПОЙМАНО"
    finally:
        os.remove(path)


with ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(run, MUTATIONS))
bad = [r for r in results if r[1] != "поймано"]
for label, verdict in results:
    print(f"{verdict:12} {label}")
print(f"\nпоймано {len(results) - len(bad)} из {len(results)}")
sys.exit(1 if bad else 0)
