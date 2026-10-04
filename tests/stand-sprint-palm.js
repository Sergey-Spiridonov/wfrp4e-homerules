// Стенд для homerules 1.12.0: рывок (удобство 8) и Девятнадцатая длань Воланса (предмет 9).
// Заглушки повторяют код системы 10.0.3 и ядра 14.364, выписанный с сервера.
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const SRC = process.env.HR_SRC || require("path").join(__dirname, "..", "scripts", "homerules.js");

// ---------- мини-DOM ----------
class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.dataset = {}; this.attrs = {}; this.listeners = {}; this._html = ""; this.type = ""; const s = new Set(); this.classList = { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), contains: c => s.has(c), toString: () => [...s].join(" ") }; }
    append(...n) { for (const c of n) { c.parentElement = this; this.children.push(c); } }
    set innerHTML(v) { this._html = v; } get innerHTML() { return this._html; }
    get textContent() { return this._html.replace(/<[^>]+>/g, "") + this.children.map(c => c.textContent).join(""); }
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
    click() { (this.listeners.click || []).forEach(f => f({ preventDefault() {}, stopPropagation() {} })); }
    *all() { for (const c of this.children) { yield c; yield* c.all(); } }
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
    querySelectorAll(sel) {
        const classes = [...sel.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
        return [...this.all()].filter(e => classes.every(c => e.classList.contains(c)));
    }
}
const document = { createElement: t => new El(t) };
function el(tag, ...classes) { const e = new El(tag); e.classList.add(...classes); return e; }

// ---------- заглушки Foundry ----------
const settingsDefs = {}, settingsVals = {};
const hooks = { on: {}, once: {} };
const notes = [], errors = [], confirms = [];
let confirmAnswer = true;
const combats = new Map();
const messages = new Map();
const actorsByUuid = new Map();
let activeOwnerId = "gm";
let now = 1_000_000;

class StandardActorModel {
    // system 10.0.3, wfrp4e.js:6605
    get movementDistance() {
        const value = this.details.move.value;
        const walk = [this.details.move.walk, this.details.move.run];
        return { walk, swim: walk.map(v => v * 0.5), climb: walk.map(v => v * 0.5), crawl: value * 0.5, fly: 0 };
    }
}
class CharacterModel extends StandardActorModel {}
class NPCModel extends StandardActorModel {}
class CreatureModel extends StandardActorModel {}
class VehicleModel { get movementDistance() { return { walk: this.details.move.value, swim: 0 }; } }

const systemCalls = [];
class ActorWFRP4e {
    // system 10.0.3, wfrp4e.js:21802
    async setupDispel(test) {
        const skill = this.itemTypes.skill.find(i => i.name.toLowerCase() == `${ctx.game.i18n.localize("NAME.Language")} (${ctx.game.i18n.localize("SPEC.Magick")})`.toLowerCase());
        if (!skill) throw new Error(`${this.name} does not have Language (Magick)!`);
        return this.setupSkill(skill.name, { dispel: test.message.id, appendTitle: " - Dispel" });
    }
    async setupSkill(name, context) { systemCalls.push(["skill", this.name, name, context]); return this.nextTest === undefined ? { kind: "skill", name, context, rolled: 0, async roll() { this.rolled++; } } : this.nextTest; }
    async setupCharacteristic(ch, context) { systemCalls.push(["char", this.name, ch, context]); return this.nextTest === undefined ? { kind: "char", ch, context, rolled: 0, async roll() { this.rolled++; } } : this.nextTest; }
}

const ctx = {
    HTMLElement: El, document, console: { error: (...a) => errors.push(a), warn: () => {}, log: console.log },
    Date: { now: () => now },
    Hooks: { on: (n, f) => (hooks.on[n] ||= []).push(f), once: (n, f) => (hooks.once[n] ||= []).push(f) },
    CONFIG: { Actor: { dataModels: { character: CharacterModel, npc: NPCModel, creature: CreatureModel, vehicle: VehicleModel }, documentClass: ActorWFRP4e } },
    game: {
        settings: { register: (m, k, d) => { settingsDefs[k] = d; settingsVals[k] = structuredClone(d.default); }, get: (m, k) => settingsVals[k], set: async (m, k, v) => { settingsVals[k] = v; } },
        i18n: { localize: k => ({ "NAME.Language": "Язык", "SPEC.Magick": "магический", "NAME.Athletics": "Атлетика" })[k] ?? k, lang: "ru" },
        user: { id: "gm", isGM: true },
        users: { activeGM: null, contents: [], find: () => null },
        combats: { get: id => combats.get(id), get contents() { return [...combats.values()]; } },
        messages: { get: id => messages.get(id) },
        modules: { get: () => modObj }
    },
    ui: { notifications: { info: m => notes.push(["info", m]), warn: m => notes.push(["warn", m]), error: m => notes.push(["error", m]) } },
    foundry: { utils: { escapeHTML: v => String(v).replace(/</g, "&lt;"), debounce: f => f, deepClone: v => structuredClone(v) },
        applications: { api: { DialogV2: { confirm: async cfg => { confirms.push(cfg); return confirmAnswer; }, prompt: async () => null }, ApplicationV2: class {} }, instances: new Map() } },
    fromUuidSync: uuid => actorsByUuid.get(uuid) ?? null,
    warhammer: { utility: { getActiveDocumentOwner: () => ({ id: activeOwnerId }) } }
};
const modObj = { api: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, "utf8"), ctx, { filename: "homerules.js" });
hooks.once.init.forEach(f => f());
hooks.once.setup.forEach(f => f());
hooks.once.ready.forEach(f => { try { f(); } catch (e) { /* сокет и прочее — не наше */ } });
const fire = (name, ...args) => Promise.all((hooks.on[name] || []).map(f => f(...args)));

// ---------- данные ----------
function makeActor({ name = "Ганс", type = "character", move = 4, owner = true, skills = [], items = [], uuid } = {}) {
    const Model = { character: CharacterModel, npc: NPCModel, creature: CreatureModel, vehicle: VehicleModel }[type];
    const system = Object.assign(new Model(), { details: { move: { value: move, walk: move * 2, run: move * 4 } } });
    const actor = Object.assign(new ActorWFRP4e(), {
        name, type, isOwner: owner, uuid: uuid ?? "Actor." + name, flags: {}, flagWrites: 0, system,
        itemTypes: { skill: skills.map(n => ({ name: n, type: "skill" })) },
        items: { contents: items },
        async setFlag(m, k, v) { this.flagWrites++; (this.flags[m] ||= {})[k] = structuredClone(v); },
        async unsetFlag(m, k) { this.flagWrites++; delete this.flags[m]?.[k]; }
    });
    system.parent = actor;
    actorsByUuid.set(actor.uuid, actor);
    return actor;
}
function combat(id, actors, { round = 1, started = true } = {}) {
    const c = { id, round, started, combatants: { contents: actors.map(a => ({ actor: a })) } };
    combats.set(id, c);
    return c;
}
function sprintMessage(actor, sl, { id = "M" + Math.random(), author = "gm" } = {}) {
    const m = { id, author: { id: author }, system: { testData: { preData: { options: { homerulesSprint: actor.uuid } }, result: { SL: sl } }, test: { result: { SL: sl } } } };
    messages.set(id, m);
    return m;
}
const flagOf = a => a.flags["wfrp4e-homerules"]?.sprint;
function reset() { combats.clear(); messages.clear(); notes.length = 0; errors.length = 0; confirms.length = 0; systemCalls.length = 0; confirmAnswer = true; settingsVals.sprintButton = true; settingsVals.volansPalm = true; ctx.game.user.id = "gm"; activeOwnerId = "gm"; now = 1_000_000; }

// Значения из песочницы vm — чужого мира: сравниваем через JSON.
const same = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);
let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------- рывок ----------
test("без рывка линейка как у системы; у повозки геттер не тронут", async () => {
    const a = makeActor();
    same(a.system.movementDistance.walk, [8, 16]);
    const v = makeActor({ name: "Телега", type: "vehicle" });
    assert.strictEqual(v.system.movementDistance.walk, 4);
});

test("рывок в бою: бег + УУ к пределу бега, шаг и плавание не меняются", async () => {
    const a = makeActor();
    combat("C1", [a], { round: 2 });
    await fire("createChatMessage", sprintMessage(a, "-2"));
    same(flagOf(a), { extra: 14, run: 16, sl: -2, message: flagOf(a).message, combat: "C1", round: 2, at: now });
    const d = a.system.movementDistance;
    same(d.walk, [8, 30]);
    same(d.swim, [4, 8]);
    same(d.climb, [4, 8]);
    assert(notes.some(([k, m]) => k === "info" && m.includes("ещё 14 ярдов") && m.includes("до конца раунда")));
});

test("пример из книги: скорость 4, УУ –2 — на 14 ярдов больше; строка УУ «+8» тоже читается", async () => {
    const a = makeActor({ name: "Пример" });
    combat("C1", [a]);
    await fire("createChatMessage", sprintMessage(a, "+8"));
    assert.strictEqual(flagOf(a).extra, 24);
    same(a.system.movementDistance.walk, [8, 40]);
});

test("большой минус УУ — ноль прибавки, предел не уменьшается", async () => {
    const a = makeActor({ name: "Улитка", move: 1 });
    combat("C1", [a]);
    await fire("createChatMessage", sprintMessage(a, "-6"));
    assert.strictEqual(flagOf(a).extra, 0);
    same(a.system.movementDistance.walk, [2, 4]);
});

test("следующий раунд, конец боя или бой не начат — рывок не действует", async () => {
    const a = makeActor();
    const c = combat("C1", [a], { round: 3 });
    await fire("createChatMessage", sprintMessage(a, "0"));
    same(a.system.movementDistance.walk, [8, 32]);
    c.round = 4;
    same(a.system.movementDistance.walk, [8, 16]);
    c.round = 3; c.started = false;
    same(a.system.movementDistance.walk, [8, 16]);
    c.started = true;
    combats.delete("C1");
    same(a.system.movementDistance.walk, [8, 16]);
});

test("вне боя: действует пять минут и снимается первым перемещением своего токена", async () => {
    const a = makeActor();
    await fire("createChatMessage", sprintMessage(a, "+1"));
    assert.strictEqual(flagOf(a).combat, null);
    assert(notes.some(([, m]) => m.includes("до следующего перемещения")));
    same(a.system.movementDistance.walk, [8, 33]);
    now += 4 * 60 * 1000;
    same(a.system.movementDistance.walk, [8, 33]);
    now += 2 * 60 * 1000;
    same(a.system.movementDistance.walk, [8, 16]);
    now -= 6 * 60 * 1000;
    await fire("moveToken", { actor: a }, {}, {}, { id: "player" });
    assert(flagOf(a), "чужое перемещение не снимает");
    await fire("moveToken", { actor: a }, {}, {}, { id: "gm" });
    assert.strictEqual(flagOf(a), undefined);
});

test("вне боя рывок, потом начался бой — рывок вне боя не действует", async () => {
    const a = makeActor();
    await fire("createChatMessage", sprintMessage(a, "+1"));
    combat("C9", [a]);
    same(a.system.movementDistance.walk, [8, 16]);
});

test("в бою перемещение рывок не снимает: история хода копится", async () => {
    const a = makeActor();
    combat("C1", [a]);
    await fire("createChatMessage", sprintMessage(a, "+1"));
    await fire("moveToken", { actor: a }, {}, {}, { id: "gm" });
    assert.strictEqual(flagOf(a).extra, 17);
});

test("пишет только бросивший; без ярлыка карточка не трогается", async () => {
    const a = makeActor();
    combat("C1", [a]);
    await fire("createChatMessage", sprintMessage(a, "+1", { author: "player" }));
    assert.strictEqual(flagOf(a), undefined);
    await fire("createChatMessage", { id: "X", author: { id: "gm" }, system: { testData: { preData: { options: {} } } } });
    assert.strictEqual(a.flagWrites, 0);
});

test("+1 УУ за удачу правит ту же карточку — прибавка пересчитана; правка старой карточки не воскрешает рывок", async () => {
    const a = makeActor();
    combat("C1", [a]);
    const m = sprintMessage(a, "+1", { id: "S1" });
    await fire("createChatMessage", m);
    m.system.test.result.SL = "+2";
    await fire("updateChatMessage", m);
    assert.strictEqual(flagOf(a).extra, 18);
    const writes = a.flagWrites;
    await fire("updateChatMessage", m);
    assert.strictEqual(a.flagWrites, writes, "без изменений не пишем");
    const old = sprintMessage(a, "+5", { id: "OLD" });
    await fire("updateChatMessage", old);
    assert.strictEqual(flagOf(a).extra, 18);
});

test("переброс за удачу — новая карточка с тем же ярлыком заменяет прибавку", async () => {
    const a = makeActor();
    combat("C1", [a]);
    await fire("createChatMessage", sprintMessage(a, "-3", { id: "S1" }));
    await fire("createChatMessage", sprintMessage(a, "+3", { id: "S2" }));
    assert.strictEqual(flagOf(a).extra, 19);
    assert.strictEqual(flagOf(a).message, "S2");
});

test("НПС и существо тоже бегают; выключенная настройка — линейка как у системы", async () => {
    const n = makeActor({ name: "Громила", type: "npc", move: 4 });
    const c = makeActor({ name: "Волк", type: "creature", move: 9 });
    combat("C1", [n, c]);
    await fire("createChatMessage", sprintMessage(n, "+1"));
    await fire("createChatMessage", sprintMessage(c, "0"));
    same(n.system.movementDistance.walk, [8, 33]);
    same(c.system.movementDistance.walk, [18, 72]);
    settingsVals.sprintButton = false;
    same(n.system.movementDistance.walk, [8, 16]);
    await fire("createChatMessage", sprintMessage(n, "+5"));
    assert.strictEqual(flagOf(n).extra, 17, "при выключенной настройке не пишем");
});

test("повторная обёртка (второй setup) прибавку не удваивает", async () => {
    hooks.once.setup.forEach(f => f());
    const a = makeActor();
    combat("C1", [a]);
    await fire("createChatMessage", sprintMessage(a, "0"));
    same(a.system.movementDistance.walk, [8, 32]);
});

test("кнопка: проверка атлетики +20 с ярлыком; закрытое окно — ничего; чужой персонаж и повозка — отказ", async () => {
    const a = makeActor();
    await modObj.api.startSprint(a);
    const [kind, , skill, context] = systemCalls[0];
    assert.strictEqual(kind, "skill");
    assert.strictEqual(skill, "Атлетика");
    same(context.fields, { difficulty: "average" });
    assert.strictEqual(context.homerulesSprint, a.uuid);
    assert.strictEqual(context.appendTitle, " — Рывок");
    a.nextTest = null;
    await modObj.api.startSprint(a);
    assert.strictEqual(errors.length, 0);
    const foreign = makeActor({ name: "Чужой", owner: false });
    await modObj.api.startSprint(foreign);
    const cart = makeActor({ name: "Телега", type: "vehicle" });
    await modObj.api.startSprint(cart);
    assert.strictEqual(systemCalls.length, 2);
    assert.strictEqual(notes.filter(([k]) => k === "warn").length, 2);
});

test("рывок уже сделан — спросить; отказ не бросает, согласие бросает", async () => {
    const a = makeActor();
    combat("C1", [a]);
    await fire("createChatMessage", sprintMessage(a, "0"));
    confirmAnswer = false;
    await modObj.api.startSprint(a);
    assert.strictEqual(confirms.length, 1);
    assert.strictEqual(systemCalls.length, 0);
    confirmAnswer = true;
    await modObj.api.startSprint(a);
    assert.strictEqual(systemCalls.length, 1);
});

test("ошибка системы при проверке ловится и показывается", async () => {
    const a = makeActor();
    a.setupSkill = async () => { throw new Error("сломалось"); };
    await modObj.api.startSprint(a);
    assert(notes.some(([k, m]) => k === "error" && m.includes("сломалось")));
});

test("строка под карточкой: сколько ярдов; второй вызов хука не задваивает", async () => {
    const a = makeActor();
    const m = sprintMessage(a, "-2");
    const root = el("li", "chat-message"); const content = el("div", "message-content"); root.append(content);
    await fire("renderChatMessageHTML", m, root);
    await fire("renderChatMessage", m, [root]);
    const notesEl = root.querySelectorAll(".homerule-sprint-note");
    assert.strictEqual(notesEl.length, 1);
    assert.strictEqual(notesEl[0].parentElement, content);
    assert(notesEl[0].textContent.includes("Рывок: ещё 14 ярдов (бег 16, УУ –2)"), notesEl[0].textContent);
    const plain = el("li"); plain.append(el("div", "message-content"));
    await fire("renderChatMessageHTML", { system: { testData: { preData: { options: {} } } } }, plain);
    assert.strictEqual(plain.querySelectorAll(".homerule-sprint-note").length, 0);
});

function hudFor(actor) {
    const root = el("div"); const left = el("div", "col", "left"); root.append(left);
    const hud = { object: { actor }, closed: 0, close() { this.closed++; } };
    return { root, left, hud };
}
test("меню токена: кнопка владельцу в левой колонке, подсветка при рывке, щелчок — закрыть меню и бросить", async () => {
    const a = makeActor();
    const { root, left, hud } = hudFor(a);
    await fire("renderTokenHUD", hud, root);
    await fire("renderTokenHUD", hud, root);
    const buttons = left.querySelectorAll(".homerule-sprint");
    assert.strictEqual(buttons.length, 1);
    assert(buttons[0].classList.contains("control-icon"));
    assert(!buttons[0].classList.contains("active"));
    assert.strictEqual(buttons[0].type, "button");
    buttons[0].click();
    await new Promise(r => setImmediate(r));
    assert.strictEqual(hud.closed, 1);
    assert.strictEqual(systemCalls.length, 1);
    combat("C1", [a]);
    await fire("createChatMessage", sprintMessage(a, "+2"));
    const second = hudFor(a);
    await fire("renderTokenHUD", second.hud, second.root);
    const lit = second.left.querySelector(".homerule-sprint");
    assert(lit.classList.contains("active"));
    assert(lit.dataset.tooltip.includes("ещё 18 ярдов"));
});

test("меню токена: чужому, повозке и при выключенной настройке кнопки нет", async () => {
    for (const actor of [makeActor({ name: "Чужой", owner: false }), makeActor({ name: "Телега", type: "vehicle" })]) {
        const { root, left, hud } = hudFor(actor);
        await fire("renderTokenHUD", hud, root);
        assert.strictEqual(left.querySelectorAll(".homerule-sprint").length, 0, actor.name);
    }
    settingsVals.sprintButton = false;
    const { root, left, hud } = hudFor(makeActor());
    await fire("renderTokenHUD", hud, root);
    assert.strictEqual(left.querySelectorAll(".homerule-sprint").length, 0);
});

test("+1 УУ по-системному: сперва правка содержимого с прежним УУ, потом testData с новым", async () => {
    // test-wfrp4e.js renderRollCard: message.update(content), затем updateMessageData → "system.testData"
    const a = makeActor();
    combat("C1", [a]);
    const m = sprintMessage(a, "+1", { id: "S1" });
    await fire("createChatMessage", m);
    const writes = a.flagWrites;
    await fire("updateChatMessage", m);
    assert.strictEqual(a.flagWrites, writes, "правка содержимого без нового УУ — не пишем");
    m.system.test.result.SL = "+2"; m.system.testData.result.SL = "+2";
    await fire("updateChatMessage", m);
    assert.strictEqual(flagOf(a).extra, 18);
    assert.strictEqual(flagOf(a).sl, 2);
});

test("переброс ведущим или сделка с тьмой: новая карточка автора-переброщика, preData.options с ярлыком сохранены", async () => {
    // reroll(): messageId = "", preData не сбрасывается (только roll, SL, hitloc) → ChatMessage.create с тем же preData
    const a = makeActor();
    combat("C1", [a]);
    ctx.game.user.id = "player";
    await fire("createChatMessage", sprintMessage(a, "-1", { id: "P1", author: "player" }));
    assert.strictEqual(flagOf(a).extra, 15);
    ctx.game.user.id = "gm";
    await fire("createChatMessage", sprintMessage(a, "+4", { id: "G1", author: "gm" }));
    assert.strictEqual(flagOf(a).extra, 20);
    assert.strictEqual(flagOf(a).message, "G1");
});

test("«Изменить проверку» ведущего правит ту же карточку — прибавка пересчитана", async () => {
    const a = makeActor();
    combat("C1", [a]);
    const m = sprintMessage(a, "0", { id: "E1" });
    await fire("createChatMessage", m);
    m.system.test.result.SL = "+3";
    await fire("updateChatMessage", m);
    assert.strictEqual(flagOf(a).extra, 19);
});

// ---------- Длань Воланса ----------
const PALM = (over = {}) => Object.assign({ type: "trapping", name: "Девятнадцатая длань Воланса", isEquipped: true, flags: { babele: { originalName: "The Nineteenth Palm of Volans" } }, _stats: { compendiumSource: "Compendium.wfrp4e-ua1.items.Item.76P6iODnOpT8JLfu" } }, over);
const castTest = () => ({ message: { id: "CAST1" } });

test("с навыком «Язык (магический)» — развеивание как у системы, Длань не мешает", async () => {
    const a = makeActor({ name: "Маг", skills: ["Язык (магический)"], items: [PALM()] });
    const t = await a.setupDispel(castTest());
    assert.strictEqual(t.kind, "skill");
    same(systemCalls[0].slice(2), ["Язык (магический)", { dispel: "CAST1", appendTitle: " - Dispel" }]);
});

test("без навыка и без Длани — ошибка системы как была", async () => {
    const a = makeActor({ name: "Воин" });
    await assert.rejects(a.setupDispel(castTest()), /does not have Language/);
});

test("без навыка, Длань надета — проверка силы воли с ярлыком карточки заклинания", async () => {
    const a = makeActor({ name: "Воин", items: [PALM()] });
    const t = await a.setupDispel(castTest());
    assert.strictEqual(t.kind, "char");
    assert.strictEqual(systemCalls[0][2], "wp");
    assert.strictEqual(systemCalls[0][3].homerulesPalmDispel, "CAST1");
    assert(systemCalls[0][3].appendTitle.includes("Девятнадцатая длань Воланса"));
});

test("Длань не надета — понятная ошибка по-русски, проверки нет", async () => {
    const a = makeActor({ name: "Воин", items: [PALM({ isEquipped: false })] });
    await assert.rejects(a.setupDispel(castTest()), /не надета/);
    assert.strictEqual(systemCalls.length, 0);
});

test("окно проверки закрыли — отдаём пустышку, у кнопки системы `test.roll()` не падает", async () => {
    const a = makeActor({ name: "Воин", items: [PALM()] });
    a.nextTest = undefined; a.setupCharacteristic = async () => undefined;
    const t = await a.setupDispel(castTest());
    await t.roll();
});

test("выключенная настройка — как у системы", async () => {
    settingsVals.volansPalm = false;
    const a = makeActor({ name: "Воин", items: [PALM()] });
    await assert.rejects(a.setupDispel(castTest()), /does not have Language/);
});

test("Длань узнаётся по русскому имени, по английскому, по источнику; заклинание «Взор Воланса» и прочие вещи — нет", async () => {
    const variants = [
        PALM({ flags: {}, _stats: {} }),
        PALM({ name: "The Nineteenth Palm of Volans", flags: {}, _stats: {} }),
        PALM({ name: "Амулет", flags: {}, _stats: { compendiumSource: "Compendium.wfrp4e-ua1.items.Item.76P6iODnOpT8JLfu" } }),
        PALM({ name: "Девятнадцатая ладонь Воланса", flags: {}, _stats: {} })
    ];
    for (const palm of variants) {
        systemCalls.length = 0;
        const a = makeActor({ name: "Воин", items: [palm] });
        const t = await a.setupDispel(castTest());
        assert.strictEqual(t.kind, "char", palm.name);
    }
    for (const other of [{ type: "spell", name: "Взор Воланса", isEquipped: true }, { type: "trapping", name: "Лицензия тенеманта", isEquipped: true }, { type: "trapping", name: "Перстень Воланса", isEquipped: true }]) {
        const a = makeActor({ name: "Воин", items: [other] });
        await assert.rejects(a.setupDispel(castTest()), /does not have Language/, other.name);
    }
});

test("повторная обёртка не множит обёртки", async () => {
    const before = ActorWFRP4e.prototype.setupDispel;
    hooks.once.setup.forEach(f => f());
    assert.strictEqual(ActorWFRP4e.prototype.setupDispel, before);
});

function palmMessage(castId) {
    return { id: "D1", author: { id: "player" }, system: { testData: { preData: { options: { homerulesPalmDispel: castId } } }, test: { result: { SL: "+2" } } } };
}
test("карточка силы воли: ведущий карточки заклинания передаёт результат в updateDispel (4-я редакция)", async () => {
    const calls = [];
    messages.set("CAST1", { id: "CAST1", system: { test: { updateDispel: t => calls.push(t) } } });
    const m = palmMessage("CAST1");
    await fire("createChatMessage", m);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0], m.system.test);
});

test("не ведущий карточки заклинания — ничего не делает (иначе двойное развеивание)", async () => {
    const calls = [];
    messages.set("CAST1", { id: "CAST1", system: { test: { updateDispel: t => calls.push(t) } } });
    activeOwnerId = "player";
    await fire("createChatMessage", palmMessage("CAST1"));
    assert.strictEqual(calls.length, 0);
});

test("5-я редакция: у проверки сотворения только dispel — зовём его", async () => {
    const calls = [];
    messages.set("CAST1", { id: "CAST1", system: { test: { dispel: t => calls.push(t) } } });
    await fire("createChatMessage", palmMessage("CAST1"));
    assert.strictEqual(calls.length, 1);
});

test("карточки заклинания нет или настройка выключена — тихо ничего", async () => {
    await fire("createChatMessage", palmMessage("NOPE"));
    const calls = [];
    messages.set("CAST1", { id: "CAST1", system: { test: { updateDispel: t => calls.push(t) } } });
    settingsVals.volansPalm = false;
    await fire("createChatMessage", palmMessage("CAST1"));
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(errors.length, 0);
});

test("настройки мира и их тексты", async () => {
    for (const key of ["sprintButton", "volansPalm"]) {
        assert.strictEqual(settingsDefs[key].scope, "world");
        assert.strictEqual(settingsDefs[key].config, true);
        assert.strictEqual(settingsDefs[key].default, true);
    }
});

(async () => {
    for (const [name, fn] of tests) {
        reset();
        try { await fn(); passed++; console.log("ok  " + name); }
        catch (e) { console.log("ПАДЕНИЕ  " + name + "\n" + (e.stack || e)); }
    }
    console.log(`\nпрошло ${passed} из ${tests.length}`);
    if (errors.length) console.log("ошибки в консоли:", errors.map(e => String(e[0])).join(" | "));
    process.exit(passed === tests.length ? 0 : 1);
})();
