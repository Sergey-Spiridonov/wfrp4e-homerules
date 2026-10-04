// Стенд для wfrp4e-spells-by-lore: мини-DOM + заглушки Foundry.
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const SRC = process.env.HR_SRC || require("path").join(__dirname, "..", "scripts", "homerules.js");

// ---------- мини-DOM ----------
class ClassList {
    constructor() { this.s = new Set(); }
    add(...c) { c.forEach(x => this.s.add(x)); }
    remove(...c) { c.forEach(x => this.s.delete(x)); }
    contains(c) { return this.s.has(c); }
    toggle(c, force) { const on = force === undefined ? !this.s.has(c) : !!force; on ? this.s.add(c) : this.s.delete(c); return on; }
    toString() { return [...this.s].join(" "); }
}
class HTMLElement {
    constructor(tag) { this.style = {}; this.tagName = tag.toUpperCase(); this.classList = new ClassList(); this.dataset = {}; this.attrs = {}; this.children = []; this.parentElement = null; this._text = ""; this.listeners = {}; }
    append(...nodes) { for (const n of nodes) { if (n.parentElement) n.remove(); n.parentElement = this; this.children.push(n); } }
    remove() { const p = this.parentElement; if (!p) return; p.children.splice(p.children.indexOf(this), 1); this.parentElement = null; }
    get nextElementSibling() { const p = this.parentElement; if (!p) return null; return p.children[p.children.indexOf(this) + 1] ?? null; }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(""); }
    set textContent(v) { this.children.forEach(c => c.parentElement = null); this.children = []; this._text = String(v); }
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
    click() { const ev = { preventDefault() {}, stopPropagation() {} }; (this.listeners.click || []).forEach(f => f(ev)); }
    dispatch(type, ev) { (this.listeners[type] || []).forEach(f => f(ev)); return ev; }
    after(...nodes) { const p = this.parentElement; let i = p.children.indexOf(this) + 1; for (const n of nodes) { if (n.parentElement) n.remove(); n.parentElement = p; p.children.splice(i++, 0, n); } }
    replaceChildren(...nodes) { this.children.forEach(c => c.parentElement = null); this.children = []; this.append(...nodes); }
    prepend(...nodes) { for (const n of nodes.reverse()) { if (n.parentElement) n.remove(); n.parentElement = this; this.children.unshift(n); } }
    focus() { this.focused = true; } setSelectionRange(a, b) { this.selection = [a, b]; } setAttribute(k, v) { this.attrs[k] = v; }
    *descendants() { for (const c of this.children) { yield c; yield* c.descendants(); } }
    matchesCompound(comp) {
        if (comp.tag && comp.tag !== this.tagName.toLowerCase()) return false;
        if (!comp.classes.every(c => this.classList.contains(c))) return false;
        return comp.attrs.every(([k, v]) => {
            if (k.startsWith("data-")) { const key = k.slice(5).replace(/-(\w)/g, (_, x) => x.toUpperCase()); return this.dataset[key] === v; }
            return this.attrs[k] === v;
        });
    }
    matches(chain) {
        // chain: [{comp, comb}] слева направо; сверяем справа налево
        const walk = (el, i) => {
            if (!el.matchesCompound(chain[i].comp)) return false;
            if (i === 0) return true;
            const comb = chain[i].comb;
            if (comb === ">") return !!el.parentElement && walk(el.parentElement, i - 1);
            for (let p = el.parentElement; p; p = p.parentElement) if (walk(p, i - 1)) return true;
            return false;
        };
        return walk(this, chain.length - 1);
    }
    querySelectorAll(sel) { const chain = parseSelector(sel); return [...this.descendants()].filter(el => el.matches(chain)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}
function parseSelector(sel) {
    const tokens = sel.replace(/\s*>\s*/g, " > ").trim().split(/\s+/);
    const chain = []; let comb = " ";
    for (const t of tokens) {
        if (t === ">") { comb = ">"; continue; }
        const comp = { tag: null, classes: [], attrs: [] };
        const m = t.match(/^[a-z]+/); if (m) comp.tag = m[0];
        for (const c of t.matchAll(/\.([\w-]+)/g)) comp.classes.push(c[1]);
        for (const a of t.matchAll(/\[([\w-]+)=['"]?([^'"\]]+)['"]?\]/g)) comp.attrs.push([a[1], a[2]]);
        chain.push({ comp, comb }); comb = " ";
    }
    return chain;
}
function el(tag, classes = [], dataset = {}, attrs = {}) { const e = new HTMLElement(tag); e.classList.add(...classes); Object.assign(e.dataset, dataset); Object.assign(e.attrs, attrs); return e; }
const document = { createElement: tag => new HTMLElement(tag) };

// ---------- заглушки Foundry ----------
const LORES = { petty: "Простейшие заклинания", beasts: "Звери", death: "Смерть", fire: "Огонь", heavens: "Небеса", metal: "Металл", life: "Жизнь", light: "Свет", shadow: "Тень", hedgecraft: "Знахарство", witchcraft: "Ведьмовство", daemonology: "Демонология", necromancy: "Некромантия", undivided: "Неделимый хаос", nurgle: "Нургл", slaanesh: "Слаанеш", tzeentch: "Тзинч" };
const settingsDefs = {}, settingsVals = {};
const hooks = { on: {}, once: {} };
let setCalls = 0;
class ActorSheetV2 { constructor() { this.rendered = true; this.renders = 0; } render() { this.renders++; } }
class OtherApp { constructor() { this.rendered = true; this.renders = 0; } render() { this.renders++; } }
const instances = new Map();
const errors = [];
const notes = [], dialogs = [], dialogQueue = []; let rid = 0;
const ctx = {
    HTMLElement, document, AbortController, setTimeout: (...a) => setTimeout(...a), clearTimeout: (...a) => clearTimeout(...a),
    console: { error: (...a) => errors.push(a), warn: console.warn, log: console.log },
    Hooks: { on: (n, f) => (hooks.on[n] ||= []).push(f), once: (n, f) => (hooks.once[n] ||= []).push(f) },
    game: {
        settings: {
            register: (m, k, d) => { settingsDefs[k] = d; settingsVals[k] = structuredClone(d.default); },
            get: (m, k) => settingsVals[k],
            set: async (m, k, v) => { setCalls++; settingsVals[k] = structuredClone(v); return v; }
        },
        wfrp4e: { config: { magicLores: LORES } },
        i18n: { localize: s => s, lang: "ru" }
    },
    ui: { notifications: { info: m => notes.push(m), warn: m => notes.push(m), error: m => notes.push(m) } },
    foundry: {
        utils: { deepClone: v => structuredClone(v), randomID: () => "NEW" + (++rid), escapeHTML: v => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;") },
        applications: {
            instances, sheets: { ActorSheetV2 },
            api: { DialogV2: {
                prompt: async cfg => { dialogs.push(cfg); const next = dialogQueue.shift(); if (next == null) return null; if (typeof next === "function") return next(cfg); return cfg.ok.callback({}, { form: next }); },
                confirm: async cfg => { dialogs.push(cfg); return dialogQueue.shift(); }
            } },
            ux: { TextEditor: { implementation: { getDragEventData: ev => JSON.parse(ev.dataTransfer.getData("text/plain")) } } }
        }
    }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, "utf8"), ctx, { filename: "homerules.js" });
hooks.once.init.forEach(f => f());
const render = (app, element) => hooks.on.renderActorSheetV2.forEach(f => f(app, element));

// ---------- данные ----------
let idc = 0;
function spell(name, lore, { chosen = "", cn = 0 } = {}) {
    const id = "i" + (++idc);
    return { id, type: "spell", name, uuid: "Actor.A1.Item." + id, system: { lore: { value: Array.isArray(lore) ? lore : [lore].filter(x => x !== null), chosen }, cn: { value: cn } } };
}
function makeActor(spells, uuid = "Actor.A1") {
    const map = new Map(spells.map(s => [s.id, s]));
    const actor = { uuid, isOwner: true, flags: {}, updates: [], spells,
        items: { get: id => map.get(id), find: f => spells.find(f), filter: f => spells.filter(f) },
        itemTypes: { spell: spells },
        async update(data) { actor.updates.push(structuredClone(data)); for (const [k, v] of Object.entries(data)) { const [, mod, key] = k.split("."); (actor.flags[mod] ||= {})[key] = structuredClone(v); } return actor; }
    };
    return actor;
}
// Разметка вкладки как в actor-magic.hbs 10.0.0
function makeSheet(actor) {
    const root = el("div", ["wfrp4e", "actor", "sheet"]);
    const tab = el("section", ["tab"], { tab: "magic", group: "primary" });
    root.append(tab);
    for (const kind of ["petty", "spells"]) {
        const list = el("div", ["sheet-list", kind]);
        const header = el("div", ["list-header", "row-content"]);
        const content = el("div", ["list-content"]);
        list.append(header, content);
        tab.append(list);
        for (const s of actor.spells) {
            const isPetty = s.system.lore.value.length === 1 && s.system.lore.value[0] === "petty";
            if ((kind === "petty") !== isPetty) continue;
            const row = el("div", ["list-row"], { uuid: s.uuid });
            const rc = el("div", ["row-content"]);
            const nm = el("div", ["list-name"]);
            const label = el("a", ["label"]); label.textContent = s.name;
            nm.append(label); rc.append(nm); row.append(rc);
            content.append(row);
        }
    }
    return root;
}
const content = (root, kind) => root.querySelector(`.sheet-list.${kind} > .list-content`);
function layout(root, kind = "spells") {
    return content(root, kind).children.map(c => c.classList.contains("homerule-lore-header")
        ? `## ${c.querySelector(".homerule-lore-name").textContent} (${c.querySelector(".homerule-lore-count").textContent})${c.classList.contains("collapsed") ? " [свёрнуто]" : ""}`
        : `${c.querySelector(".label").textContent}${c.classList.contains("homerule-lore-collapsed") ? " [скрыто]" : ""}`);
}
function noJunk(root) {
    const t = root.textContent;
    for (const bad of ["undefined", "NaN", "[object Object]", "null"]) assert(!t.includes(bad), "в выводе " + bad);
}

let passed = 0;
function test(name, f) { idc = 0; errors.length = 0; settingsVals.spellsByLore = true; settingsVals.spellsByLoreOrder = "name"; settingsVals.spellsByLoreCollapsed = {}; setCalls = 0; f(); passed++; console.log("ok  " + name); }

// Набор как у Тэлиры: металл 8, огонь 7, тень 6, свет 4, простейшие 6 — вперемешку
function telira() {
    const out = [];
    const add = (lore, names, cns) => names.forEach((n, i) => out.push(spell(n, lore, { cn: cns[i] })));
    add("metal", ["Удар молота", "Золотая броня", "Позолота", "Жар кузни", "Ртутный щит", "Трансмутация", "Бронзовый страж", "Сияние"], [5, 7, 6, 4, 9, 12, 8, 3]);
    add("fire", ["Огненный шар", "Пламя души", "Жаровня", "Огненная стена", "Искра", "Костёр", "Аура пламени"], [6, 8, 4, 10, 2, 5, 7]);
    add("shadow", ["Морок", "Тень", "Невидимость", "Двойник", "Мрак", "Сумрак"], [6, 5, 9, 8, 4, 3]);
    add("light", ["Свет истины", "Изгнание", "Ослепление", "Луч"], [7, 9, 5, 4]);
    add("petty", ["Свет", "Звук", "Дротик", "Замок", "Огонёк", "Сон"], [0, 0, 0, 0, 0, 0]);
    // перемешать детерминированно
    return out.map((s, i) => [((i * 7919) % 31), s]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
}

test("группы по школам в порядке magicLores, внутри по алфавиту", () => {
    const actor = makeActor(telira());
    const root = makeSheet(actor);
    render({ document: actor }, root);
    const l = layout(root);
    const heads = l.filter(x => x.startsWith("##"));
    assert.deepStrictEqual(heads, ["## Огонь (7)", "## Металл (8)", "## Свет (4)", "## Тень (6)"]);
    const fire = l.slice(1, 8);
    assert.deepStrictEqual(fire, [...fire].sort((a, b) => a.localeCompare(b, "ru")));
    assert.strictEqual(l.length, 25 + 4);
    const petty = layout(root, "petty");
    assert.deepStrictEqual(petty, ["Дротик", "Замок", "Звук", "Огонёк", "Свет", "Сон"]);
    assert(!petty.some(x => x.startsWith("##")), "в простейших не должно быть заголовков");
    noJunk(root);
    assert.strictEqual(errors.length, 0);
    console.log("    " + l.join(" | "));
});

test("цветной кружок: классы системы для известной школы", () => {
    const actor = makeActor(telira());
    const root = makeSheet(actor);
    render({ document: actor }, root);
    const sw = content(root, "spells").children[0].querySelector(".homerule-lore-swatch");
    assert.strictEqual(sw.classList.toString(), "homerule-lore-swatch lore chosen fire");
});

test("по порогу сотворения, при равенстве — по названию", () => {
    settingsVals.spellsByLoreOrder = "cn";
    const actor = makeActor([spell("Б", "fire", { cn: 5 }), spell("А", "fire", { cn: 5 }), spell("В", "fire", { cn: 2 }), spell("Г", "fire", { cn: 9 })]);
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(layout(root), ["## Огонь (4)", "В", "А", "Б", "Г"]);
});

test("«как в листе» сохраняет системный порядок внутри школы", () => {
    settingsVals.spellsByLoreOrder = "sheet";
    const actor = makeActor([spell("Я", "metal"), spell("Б", "fire"), spell("А", "metal"), spell("Ю", "fire")]);
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(layout(root), ["## Огонь (2)", "Б", "Ю", "## Металл (2)", "Я", "А"]);
});

test("несколько школ: выбранная, без выбора — первая (как spell.js:284)", () => {
    const actor = makeActor([spell("Выбрано", ["fire", "metal"], { chosen: "metal" }), spell("Первая", ["shadow", "fire"]), spell("Огонь-1", "fire")]);
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(layout(root), ["## Огонь (1)", "Огонь-1", "## Металл (1)", "Выбрано", "## Тень (1)", "Первая"]);
});

test("незнакомая школа после известных, без школы — последней; название вместо ключа", () => {
    const actor = makeActor([spell("Пусто", []), spell("Болото", "Mòna's Marsh Magic"), spell("Старое", "Металл"), spell("Тзинч-1", "tzeentch"), spell("Звери-1", "beasts")]);
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(layout(root), ["## Звери (1)", "Звери-1", "## Металл (1)", "Старое", "## Тзинч (1)", "Тзинч-1", "## Mòna's Marsh Magic (1)", "Болото", "## Без школы (1)", "Пусто"]);
    const custom = content(root, "spells").children.find(c => c.dataset.lore === "Mòna's Marsh Magic");
    assert.strictEqual(custom.querySelector(".homerule-lore-swatch").classList.toString(), "homerule-lore-swatch", "незнакомой школе системный цвет не вешаем");
    noJunk(root);
});

test("повторный вызов хука на том же DOM ничего не задваивает", () => {
    const actor = makeActor(telira());
    const root = makeSheet(actor);
    render({ document: actor }, root);
    const first = layout(root);
    render({ document: actor }, root);
    render({ document: actor }, root);
    assert.deepStrictEqual(layout(root), first);
    assert.deepStrictEqual(layout(root, "petty"), ["Дротик", "Замок", "Звук", "Огонёк", "Свет", "Сон"]);
});

test("сворачивание: строки прячутся, выбор переживает перерисовку, разворот чистит запись", () => {
    const actor = makeActor(telira());
    let root = makeSheet(actor);
    render({ document: actor }, root);
    const metal = content(root, "spells").children.find(c => c.dataset.lore === "metal");
    assert.strictEqual(metal.dataset.tooltip, "Свернуть");
    metal.click();
    assert.deepStrictEqual(settingsVals.spellsByLoreCollapsed, { "Actor.A1": ["metal"] });
    assert.strictEqual(metal.dataset.tooltip, "Развернуть");
    let l = layout(root);
    assert.strictEqual(l.filter(x => x.endsWith("[скрыто]")).length, 8);
    assert(l.includes("## Металл (8) [свёрнуто]"));
    assert(l.filter(x => !x.startsWith("##")).every(x => x.endsWith("[скрыто]") === (actor.spells.find(s => s.name === x.replace(" [скрыто]", "")).system.lore.value[0] === "metal")));

    // перерисовка — новый DOM
    root = makeSheet(actor);
    render({ document: actor }, root);
    l = layout(root);
    assert(l.includes("## Металл (8) [свёрнуто]"));
    assert.strictEqual(l.filter(x => x.endsWith("[скрыто]")).length, 8);

    const metal2 = content(root, "spells").children.find(c => c.dataset.lore === "metal");
    metal2.click();
    assert.deepStrictEqual(settingsVals.spellsByLoreCollapsed, {});
    assert.strictEqual(layout(root).filter(x => x.endsWith("[скрыто]")).length, 0);
});

test("свёрнутое у одного актёра не трогает другого", () => {
    settingsVals.spellsByLoreCollapsed = { "Actor.OTHER": ["metal"] };
    const actor = makeActor(telira());
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.strictEqual(layout(root).filter(x => x.endsWith("[скрыто]")).length, 0);
    content(root, "spells").children.find(c => c.dataset.lore === "fire").click();
    assert.deepStrictEqual(settingsVals.spellsByLoreCollapsed, { "Actor.OTHER": ["metal"], "Actor.A1": ["fire"] });
});

test("выключенная настройка: лист как у системы", () => {
    settingsVals.spellsByLore = false;
    const actor = makeActor(telira());
    const root = makeSheet(actor);
    const before = layout(root);
    render({ document: actor }, root);
    assert.deepStrictEqual(layout(root), before);
});

test("лист без вкладки магии, пустые списки, jQuery вместо элемента", () => {
    const actor = makeActor([]);
    render({ document: actor }, el("div"));
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(layout(root), []);
    const actor2 = makeActor([spell("А", "fire")]);
    const root2 = makeSheet(actor2);
    render({ document: actor2 }, [root2]);
    assert.deepStrictEqual(layout(root2), ["## Огонь (1)", "А"]);
    render({ document: null }, root2);
    assert.strictEqual(errors.length, 0);
});

test("строка без предмета в актёре уходит в «Без школы», не роняет лист", () => {
    const actor = makeActor([spell("А", "fire")]);
    const root = makeSheet(actor);
    const ghost = el("div", ["list-row"], { uuid: "Actor.A1.Item.GONE" });
    const lbl = el("a", ["label"]); lbl.textContent = "Призрак"; ghost.append(lbl);
    content(root, "spells").append(ghost);
    render({ document: actor }, root);
    assert.deepStrictEqual(layout(root), ["## Огонь (1)", "А", "## Без школы (1)", "Призрак"]);
});

test("ошибка внутри раскладки ловится и пишется в консоль", () => {
    const actor = { uuid: "Actor.X", items: { get: () => { throw new Error("бум"); } } };
    const root = makeSheet(makeActor([spell("А", "fire")]));
    render({ document: actor }, root);
    assert.strictEqual(errors.length, 1);
    assert(String(errors[0][0]).includes("не удалось разложить"));
});

test("смена настройки перерисовывает только листы актёров", () => {
    const a = new ActorSheetV2(), b = new OtherApp(), c = new ActorSheetV2(); c.rendered = false;
    instances.set("a", a); instances.set("b", b); instances.set("c", c);
    settingsDefs.spellsByLoreOrder.onChange("cn");
    settingsDefs.spellsByLore.onChange(false);
    assert.deepStrictEqual([a.renders, b.renders, c.renders], [2, 0, 0]);
    assert.strictEqual(settingsDefs.spellsByLoreCollapsed.config, false);
    assert.strictEqual(settingsDefs.spellsByLore.scope, "client");
});

test("настоящий набор Тэлиры: школа то строкой, то массивом", () => {
    const raw = [
        ["metal", 7, 800000, "Горн Шамона"], [["shadow"], 4, 600000, "Стрела (Тень)"], ["petty", 0, 0, "Испивание"],
        [["metal"], 6, 1250000, "Зачарование оружия"], [["metal"], 4, 725000, "Познание неведомого"], [["light"], 9, 125000, "Мерцающий покров"],
        ["fire", 6, 1700000, "Горящая голова"], ["shadow", 4, 400000, "Изменчивый облик"], ["metal", 4, 1200000, "Проклятье ржавчины"],
        ["metal", 9, 700000, "Золочёная клетка"], ["fire", 4, 1500000, "Стрела (Огонь)"], [["light"], 9, 100000, "Целительный свет"],
        ["metal", 3, 900000, "Метод проб и ошибок"], ["petty", 0, 0, "Очищение воды"], [["light"], 8, 137500, "Сеть Аминтока"],
        ["shadow", 6, 200000, "Серые крылья"], [["light"], 5, 150000, "Безупречное понимание"], ["petty", 0, 0, "Дротик"],
        [["fire"], 13, 1400000, "Магмовый шторм"], ["fire", 10, 1750000, "Великое пламя У'Зула"], ["petty", 0, -350000, "Ловкие руки"],
        [["shadow"], 9, 175000, "Сущность тени"], [["shadow"], 6, 300000, "Мистический туман"], [["metal"], 12, 1100000, "Трансмутация Шамона"],
        [["petty"], 0, 0, "Магическая отмычка"], ["petty", 0, 0, "Магический огонёк"], ["fire", 8, 1300000, "Огненный шторм"],
        [["metal"], 5, 750000, "Блистающая мантия"], ["fire", 8, 1800000, "Пылающий меч Рюина"], ["fire", 10, 1600000, "Очищение огнём"],
        [["shadow"], 6, 500000, "Мост теней"]
    ];
    // лист отдаёт строки в порядке sort
    const spells = raw.sort((a, b) => a[2] - b[2]).map(([lore, cn, sort, name]) => {
        const s = spell(name, "fire", { cn }); s.system.lore.value = lore; return s;
    });
    const actor = makeActor(spells);
    // разметка: простейшие — те, у кого lore.value == "petty" (как в системе)
    const sheetView = { spells: spells.map(s => ({ ...s, system: { ...s.system, lore: { value: [].concat(s.system.lore.value) } } })) };
    let root;
    for (const order of ["name", "cn", "sheet"]) {
        settingsVals.spellsByLoreOrder = order;
        root = makeSheet(sheetView);   // каждая отрисовка системы даёт свежий DOM
        render({ document: actor }, root);
        const l = layout(root);
        assert.deepStrictEqual(l.filter(x => x.startsWith("##")), ["## Огонь (7)", "## Металл (8)", "## Свет (4)", "## Тень (6)"]);
        noJunk(root);
        console.log(`    [${order}] ` + l.join(" | "));
    }
    assert.strictEqual(layout(root, "petty").length, 6);
});

console.log(`\nпрошло ${passed} сценариев`);

// Соседние секции модуля живы и настройки не перепутаны
assert.deepStrictEqual(Object.keys(settingsDefs).sort(), ["armourTraitSheet", "critTraitDeflect", "guardChatMenu", "hackArmourTrait", "libraryLookup", "libraryUrl", "partyOverview", "sheetSearch", "slayerDeflect", "spellsByLore", "spellsByLoreCollapsed", "spellsByLoreOrder", "spellsByLoreOrderBase", "spellsByLoreSearchText", "sprintButton", "volansPalm"]);
assert.strictEqual(settingsDefs.slayerDeflect.scope, "world");
assert.strictEqual(settingsDefs.slayerDeflect.default, false, "отвод травмы убийцей чудовищ — домашнее правило, по умолчанию выключено");
assert.strictEqual(settingsDefs.guardChatMenu.scope, "world");
assert.strictEqual(settingsDefs.guardChatMenu.default, false, "заплатка меню — по умолчанию выключена: в 10.0.3 дефект починен");
assert.strictEqual(settingsDefs.libraryLookup.default, false, "справка /правило — по желанию: без своей службы поиска бесполезна");
assert.strictEqual(settingsDefs.spellsByLoreOrder.scope, "client");
assert(hooks.on.getChatMessageContextOptions?.length === 1, "заплатка меню зарегистрирована");
assert(hooks.on.renderChatMessageHTML?.length === 5 && hooks.on.renderChatMessage?.length === 5, "хуки чата: убийца чудовищ, справка, Разрубающее, отвод травмы чертой, рывок");
assert(hooks.on.chatMessage?.length === 1, "команда /правило");
assert(hooks.once.ready?.length === 3, "на ready: сокет, api сводки, api рывка");
assert(hooks.on.renderActorSheetV2?.length === 3, "три хука листа: магия, поиск, черта «Броня»");
console.log("ok  соседние секции регистрируются как прежде");

// ================= Папки =================
const flush = () => new Promise(r => setTimeout(r, 0));
const FKEY = "flags.wfrp4e-homerules.spellFolders";
const folderHeader = (root, id) => content(root, "spells").children.find(c => c.dataset.folder === id);
const loreHeader = (root, lore) => content(root, "spells").children.find(c => c.dataset.lore === lore);
const control = (header, op) => header.querySelector(".homerule-folder-controls").children.find(b => b.dataset.op === op);
function dragEvent(data) {
    const ev = { stopped: false, prevented: false, dataTransfer: { getData: () => JSON.stringify(data) },
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    return ev;
}
function kit() {
    idc = 0;
    const fire = ["Огненный шар", "Жаровня", "Искра"].map(n => spell(n, "fire"));
    const metal = ["Позолота", "Удар молота"].map(n => spell(n, "metal"));
    const petty = [spell("Дротик", "petty")];
    const actor = makeActor([...fire, ...metal, ...petty]);
    return { actor, fire, metal, petty };
}
const editableApp = actor => ({ document: actor, isEditable: true });
const folders = actor => actor.flags["wfrp4e-homerules"]?.spellFolders;

let fpassed = 0;
async function ftest(name, f) {
    errors.length = 0; notes.length = 0; dialogs.length = 0; dialogQueue.length = 0; rid = 0;
    settingsVals.spellsByLore = true; settingsVals.spellsByLoreOrder = "name"; settingsVals.spellsByLoreCollapsed = {}; settingsVals.spellsByLoreOrderBase = "name"; settingsVals.spellsByLoreSearchText = false; settingsVals.sheetSearch = true; settingsVals.libraryLookup = true; settingsVals.hackArmourTrait = true; settingsVals.critTraitDeflect = true; settingsVals.armourTraitSheet = true; settingsVals.libraryUrl = "http://127.0.0.1:8765";
    await f();
    assert.strictEqual(errors.length, 0, "ошибки: " + JSON.stringify(errors));
    fpassed++; console.log("ok  " + name);
}

(async () => {
await ftest("папки идут первыми в своём порядке, пустая видна, остальное по школам", () => {
    const { actor, fire, metal } = kit();
    actor.flags["wfrp4e-homerules"] = { spellFolders: [
        { id: "F1", name: "Боевые", spells: [fire[0].id, metal[1].id, fire[2].id] },
        { id: "F2", name: "Пустая", spells: [] }
    ] };
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(layout(root), ["## Боевые (3)", "Искра", "Огненный шар", "Удар молота", "## Пустая (0)", "## Огонь (1)", "Жаровня", "## Металл (1)", "Позолота"]);
    assert.deepStrictEqual(layout(root, "petty"), ["Дротик"]);
    const h = folderHeader(root, "F1");
    assert(h.querySelector(".homerule-folder-icon").classList.contains("fa-folder-open"));
    assert.strictEqual(h.querySelector(".homerule-folder-controls"), null, "без прав на правку — без кнопок");
    assert.strictEqual(root.querySelector(".homerule-folder-add"), null);
    noJunk(root);
});

await ftest("заклинание в двух папках (правка руками) показывается один раз, в первой", () => {
    const { actor, fire } = kit();
    actor.flags["wfrp4e-homerules"] = { spellFolders: [
        { id: "F1", name: "А", spells: [fire[0].id] }, { id: "F2", name: "Б", spells: [fire[0].id] }] };
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(layout(root).slice(0, 3), ["## А (1)", "Огненный шар", "## Б (0)"]);
});

await ftest("испорченный флаг не роняет лист", () => {
    const { actor } = kit();
    for (const bad of ["строка", { a: 1 }, [null, { id: 5, name: "x" }, { id: "ok", name: "Живая", spells: "не массив" }]]) {
        actor.flags["wfrp4e-homerules"] = { spellFolders: bad };
        const root = makeSheet(actor);
        render({ document: actor }, root);
        const heads = layout(root).filter(x => x.startsWith("##"));
        assert.deepStrictEqual(heads.filter(x => !x.includes("Огонь") && !x.includes("Металл")), Array.isArray(bad) ? ["## Живая (0)"] : []);
    }
});

await ftest("владелец видит кнопки; «выше» у первой и «ниже» у последней погашены; кнопка «Новая папка» одна", async () => {
    const { actor } = kit();
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "А", spells: [] }, { id: "F2", name: "Б", spells: [] }] };
    const root = makeSheet(actor);
    root.querySelector(".sheet-list.spells > .list-header").append(el("div", ["list-name"]));
    render(editableApp(actor), root);
    render(editableApp(actor), root);
    assert.strictEqual(root.querySelectorAll(".homerule-folder-add").length, 1);
    const ops = h => h.querySelector(".homerule-folder-controls").children.map(b => b.dataset.op + (b.classList.contains("disabled") ? "×" : ""));
    assert.deepStrictEqual(ops(folderHeader(root, "F1")), ["pick", "rename", "up×", "down", "delete"]);
    assert.deepStrictEqual(ops(folderHeader(root, "F2")), ["pick", "rename", "up", "down×", "delete"]);
    control(folderHeader(root, "F1"), "up").click();
    await flush();
    assert.strictEqual(actor.updates.length, 0, "погашенная кнопка ничего не пишет");
});

await ftest("чужой лист (не владелец) при isEditable — без кнопок и без перетаскивания", () => {
    const { actor } = kit();
    actor.isOwner = false;
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "А", spells: [] }] };
    const root = makeSheet(actor);
    root.querySelector(".sheet-list.spells > .list-header").append(el("div", ["list-name"]));
    render(editableApp(actor), root);
    assert.strictEqual(folderHeader(root, "F1").querySelector(".homerule-folder-controls"), null);
    assert.strictEqual(root.querySelector(".homerule-folder-add"), null);
    assert(!folderHeader(root, "F1").listeners.drop, "без прав не принимаем бросок");
});

await ftest("новая папка: имя обрезается, пустое имя и отмена ничего не пишут", async () => {
    const { actor } = kit();
    const root = makeSheet(actor);
    root.querySelector(".sheet-list.spells > .list-header").append(el("div", ["list-name"]));
    render(editableApp(actor), root);
    const add = root.querySelector(".homerule-folder-add");
    dialogQueue.push({ elements: { name: { value: "  Защита  " } } });
    add.click(); await flush();
    assert.deepStrictEqual(folders(actor), [{ id: "NEW1", name: "Защита", spells: [] }]);
    assert(dialogs[0].content.includes('name="name"'));
    dialogQueue.push({ elements: { name: { value: "   " } } });
    add.click(); await flush();
    dialogQueue.push(null);
    add.click(); await flush();
    assert.strictEqual(actor.updates.length, 1);
});

await ftest("переименование: новое имя пишется, то же имя и пустое — нет, имя экранируется в поле ввода", async () => {
    const { actor } = kit();
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: 'Бой "<b>"', spells: [] }] };
    const root = makeSheet(actor);
    render(editableApp(actor), root);
    const rename = control(folderHeader(root, "F1"), "rename");
    dialogQueue.push({ elements: { name: { value: 'Бой "<b>"' } } });
    rename.click(); await flush();
    assert.strictEqual(actor.updates.length, 0);
    assert(dialogs[0].content.includes("Бой &quot;&lt;b&gt;&quot;"), "значение поля экранировано");
    dialogQueue.push({ elements: { name: { value: "Атака" } } });
    rename.click(); await flush();
    assert.strictEqual(folders(actor)[0].name, "Атака");
});

await ftest("переименование папки, которую удалили, пока был открыт диалог, ничего не пишет", async () => {
    const { actor } = kit();
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "А", spells: [] }] };
    const root = makeSheet(actor);
    render(editableApp(actor), root);
    dialogQueue.push(cfg => { actor.flags["wfrp4e-homerules"].spellFolders = []; return "Б"; });
    control(folderHeader(root, "F1"), "rename").click(); await flush();
    assert.strictEqual(actor.updates.length, 0);
});

await ftest("порядок папок: ниже и выше", async () => {
    const { actor } = kit();
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "А", spells: [] }, { id: "F2", name: "Б", spells: [] }, { id: "F3", name: "В", spells: [] }] };
    let root = makeSheet(actor);
    render(editableApp(actor), root);
    control(folderHeader(root, "F1"), "down").click(); await flush();
    assert.deepStrictEqual(folders(actor).map(f => f.id), ["F2", "F1", "F3"]);
    root = makeSheet(actor);
    render(editableApp(actor), root);
    control(folderHeader(root, "F3"), "up").click(); await flush();
    assert.deepStrictEqual(folders(actor).map(f => f.id), ["F2", "F3", "F1"]);
    root = makeSheet(actor);
    render(editableApp(actor), root);
    assert.deepStrictEqual(layout(root).filter(x => x.startsWith("##")).slice(0, 3), ["## Б (0)", "## В (0)", "## А (0)"]);
});

await ftest("удаление: с подтверждением папка уходит, заклинания возвращаются в школы; отказ ничего не трогает", async () => {
    const { actor, fire } = kit();
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "Боевые", spells: [fire[0].id] }] };
    let root = makeSheet(actor);
    render(editableApp(actor), root);
    dialogQueue.push(false);
    control(folderHeader(root, "F1"), "delete").click(); await flush();
    assert.strictEqual(actor.updates.length, 0);
    assert(dialogs[0].content.includes("«Боевые»"));
    dialogQueue.push(true);
    control(folderHeader(root, "F1"), "delete").click(); await flush();
    assert.deepStrictEqual(folders(actor), []);
    root = makeSheet(actor);
    render(editableApp(actor), root);
    assert.deepStrictEqual(layout(root), ["## Огонь (3)", "Жаровня", "Искра", "Огненный шар", "## Металл (2)", "Позолота", "Удар молота"]);
});

await ftest("выбор заклинаний: галочки текущих, пометка «сейчас в», простейших нет, отмеченное переезжает из другой папки", async () => {
    const { actor, fire, metal, petty } = kit();
    fire[1].name = "<i>Жаровня</i>";
    actor.flags["wfrp4e-homerules"] = { spellFolders: [
        { id: "F1", name: "Боевые", spells: [fire[0].id, fire[1].id] },
        { id: "F2", name: "Защита", spells: [metal[0].id] }] };
    const root = makeSheet(actor);
    render(editableApp(actor), root);
    dialogQueue.push({ querySelectorAll: sel => { assert.strictEqual(sel, 'input[name="spell"]:checked'); return [{ value: metal[0].id }, { value: fire[0].id }]; } });
    control(folderHeader(root, "F2"), "pick").click(); await flush();
    const html = dialogs[0].content;
    assert(!html.includes(petty[0].id), "простейших в списке нет");
    assert(html.includes('value="' + metal[0].id + '" checked'), "текущее отмечено");
    assert(!html.includes('value="' + fire[0].id + '" checked'), "чужое не отмечено");
    assert(html.includes("сейчас в «Боевые»"));
    assert(html.includes("&lt;i&gt;Жаровня&lt;/i&gt;") && !html.includes("<i>Жаровня"), "имя экранировано");
    assert.strictEqual(dialogs[0].window.title, "Папка «Защита»");
    assert.deepStrictEqual(folders(actor), [
        { id: "F1", name: "Боевые", spells: [fire[1].id] },
        { id: "F2", name: "Защита", spells: [metal[0].id, fire[0].id] }]);
    dialogQueue.push(null);
    control(folderHeader(root, "F2"), "pick").click(); await flush();
    assert.strictEqual(actor.updates.length, 1, "отмена диалога ничего не пишет");
});

await ftest("выбор заклинаний на листе без заклинаний школ — сообщение, без диалога", async () => {
    idc = 0;
    const actor = makeActor([spell("Дротик", "petty")]);
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "А", spells: [] }] };
    const root = makeSheet(actor);
    render(editableApp(actor), root);
    control(folderHeader(root, "F1"), "pick").click(); await flush();
    assert.strictEqual(dialogs.length, 0);
    assert.deepStrictEqual(notes, ["На листе нет заклинаний школ."]);
});

await ftest("перетаскивание: на папку — в папку, на школу — из папки; чужое уходит системе", async () => {
    const { actor, fire, petty } = kit();
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "Боевые", spells: [] }] };
    let root = makeSheet(actor);
    render(editableApp(actor), root);
    const fh = folderHeader(root, "F1");
    const over = fh.dispatch("dragover", dragEvent({}));
    assert(over.prevented && fh.classList.contains("drop-target"));
    fh.dispatch("dragleave", {});
    assert(!fh.classList.contains("drop-target"));

    const ev = fh.dispatch("drop", dragEvent({ type: "Item", uuid: fire[1].uuid }));
    await flush();
    assert(ev.stopped && ev.prevented, "свой бросок до системы не доходит");
    assert.deepStrictEqual(folders(actor)[0].spells, [fire[1].id]);

    for (const data of [{ type: "Item", uuid: petty[0].uuid }, { type: "Item", uuid: "Compendium.wfrp4e-core.items.Item.X" }, { type: "Actor", uuid: "Actor.B" }]) {
        const e = fh.dispatch("drop", dragEvent(data));
        assert(!e.stopped, "чужое пропускаем: " + data.uuid);
    }
    const broken = { dataTransfer: { getData: () => "не json" }, preventDefault() {}, stopPropagation() { throw new Error("не должно"); } };
    fh.dispatch("drop", broken);
    await flush();
    assert.strictEqual(actor.updates.length, 1);

    root = makeSheet(actor);
    render(editableApp(actor), root);
    assert.deepStrictEqual(layout(root).slice(0, 2), ["## Боевые (1)", "Жаровня"]);
    const e2 = loreHeader(root, "fire").dispatch("drop", dragEvent({ type: "Item", uuid: fire[1].uuid }));
    await flush();
    assert(e2.stopped);
    assert.deepStrictEqual(folders(actor)[0].spells, []);
    // Бросок на ту же папку, где заклинание уже лежит, ничего не пишет
    const before = actor.updates.length;
    loreHeader(root, "metal").dispatch("drop", dragEvent({ type: "Item", uuid: fire[0].uuid }));
    await flush();
    assert.strictEqual(actor.updates.length, before);
});

await ftest("запись выбрасывает удалённые с листа заклинания и повторы", async () => {
    const { actor, fire } = kit();
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "А", spells: ["GONE", fire[0].id, fire[0].id] }, { id: "F2", name: "Б", spells: [] }] };
    const root = makeSheet(actor);
    render(editableApp(actor), root);
    control(folderHeader(root, "F2"), "up").click(); await flush();
    assert.deepStrictEqual(folders(actor), [{ id: "F2", name: "Б", spells: [] }, { id: "F1", name: "А", spells: [fire[0].id] }]);
    assert.deepStrictEqual(Object.keys(actor.updates[0]), [FKEY]);
});

await ftest("сворачивание папки: свой ключ, значок закрытой папки, переживает перерисовку", async () => {
    const { actor, fire } = kit();
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "Боевые", spells: [fire[0].id, fire[1].id] }] };
    let root = makeSheet(actor);
    render({ document: actor }, root);
    folderHeader(root, "F1").click();
    assert.deepStrictEqual(settingsVals.spellsByLoreCollapsed, { "Actor.A1": ["folder:F1"] });
    root = makeSheet(actor);
    render({ document: actor }, root);
    const h = folderHeader(root, "F1");
    assert(h.querySelector(".homerule-folder-icon").classList.contains("fa-folder"));
    assert(!h.querySelector(".homerule-folder-icon").classList.contains("fa-folder-open"));
    assert.deepStrictEqual(layout(root).slice(0, 3), ["## Боевые (2) [свёрнуто]", "Жаровня [скрыто]", "Огненный шар [скрыто]"]);
    assert(!layout(root).some(x => x.startsWith("Искра") && x.endsWith("[скрыто]")), "школа не свёрнута");
});

await ftest("щелчок по кнопке папки не сворачивает её", async () => {
    const { actor } = kit();
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "А", spells: [] }] };
    const root = makeSheet(actor);
    render(editableApp(actor), root);
    let stopped = false;
    const btn = control(folderHeader(root, "F1"), "up");
    (btn.listeners.click || []).forEach(f => f({ preventDefault() {}, stopPropagation() { stopped = true; } }));
    assert(stopped, "всплытие до заголовка остановлено");
});

await ftest("выключенная раскладка: папки не показываются, но и не теряются", () => {
    settingsVals.spellsByLore = false;
    const { actor, fire } = kit();
    const stored = [{ id: "F1", name: "А", spells: [fire[0].id] }];
    actor.flags["wfrp4e-homerules"] = { spellFolders: structuredClone(stored) };
    const root = makeSheet(actor);
    render(editableApp(actor), root);
    assert(!layout(root).some(x => x.startsWith("##")));
    assert.deepStrictEqual(folders(actor), stored);
    assert.strictEqual(actor.updates.length, 0);
});


// ================= Сортировка по порогу сотворения =================
function addHeaderCells(root, { withTooltip = true } = {}) {
    const header = root.querySelector(".sheet-list.spells > .list-header");
    const name = el("div", ["list-name"]); name.textContent = "Заклинания школ";
    const ing = el("div", ["flex"]);
    const cn = el("div", ["tiny"], withTooltip ? { tooltip: "SHEET.CN" } : {}); cn.textContent = "ПС";
    const sl = el("div", ["tiny"], { tooltip: "SHEET.SL" }); sl.textContent = "УУ";
    const m = el("div", ["tiny"], { tooltip: "Memorized" }); m.textContent = "M";
    header.append(name, ing, cn, sl, m);
    return cn;
}
function cnKit() {
    idc = 0;
    const s = [
        spell("Стрела", "fire", { cn: 4 }), spell("Шторм", "fire", { cn: 13 }), spell("Голова", "fire", { cn: 6 }), spell("Аура", "fire", { cn: 6 }),
        spell("Клетка", "metal", { cn: 9 }), spell("Метод", "metal", { cn: 3 }), spell("Мантия", "metal", { cn: 5 })
    ];
    const actor = makeActor(s);
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "Боевые", spells: [s[0].id, s[1].id, s[4].id, s[5].id] }] };
    return actor;
}

await ftest("по убыванию: внутри папки и внутри школы, равный порог — по алфавиту", () => {
    settingsVals.spellsByLoreOrder = "cnDesc";
    const actor = cnKit();
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(layout(root), ["## Боевые (4)", "Шторм", "Клетка", "Стрела", "Метод", "## Огонь (2)", "Аура", "Голова", "## Металл (1)", "Мантия"]);
    settingsVals.spellsByLoreOrder = "cn";
    const root2 = makeSheet(actor);
    render({ document: actor }, root2);
    assert.deepStrictEqual(layout(root2), ["## Боевые (4)", "Метод", "Стрела", "Клетка", "Шторм", "## Огонь (2)", "Аура", "Голова", "## Металл (1)", "Мантия"]);
});

await ftest("графа «ПС» размечается: класс, подсказка со следующим шагом, стрелки нет", () => {
    const actor = cnKit();
    const root = makeSheet(actor);
    const cell = addHeaderCells(root);
    render({ document: actor }, root);
    assert(cell.classList.contains("homerule-cn-sort"));
    assert(!cell.classList.contains("asc") && !cell.classList.contains("desc"));
    assert.strictEqual(cell.dataset.tooltip, "SHEET.CN · щелчок: по возрастанию");
    const others = root.querySelectorAll(".sheet-list.spells > .list-header .tiny").filter(c => c !== cell);
    assert(others.every(c => !c.classList.contains("homerule-cn-sort")), "соседние графы не трогаем");
});

await ftest("щелчки: по названию → по возрастанию → по убыванию → по названию", async () => {
    const actor = cnKit();
    const steps = [];
    for (let i = 0; i < 3; i++) {
        const root = makeSheet(actor);
        const cell = addHeaderCells(root);
        render({ document: actor }, root);
        steps.push([settingsVals.spellsByLoreOrder, [...["asc", "desc"]].filter(c => cell.classList.contains(c)).join(""), cell.dataset.tooltip.split(" · ")[1]]);
        cell.click(); await flush();
    }
    assert.deepStrictEqual(steps, [
        ["name", "", "щелчок: по возрастанию"],
        ["cn", "asc", "щелчок: по убыванию"],
        ["cnDesc", "desc", "щелчок: вернуть прежний порядок"]]);
    assert.strictEqual(settingsVals.spellsByLoreOrder, "name");
    assert.strictEqual(settingsVals.spellsByLoreOrderBase, "name");
});

await ftest("из «как в листе» щелчки возвращают «как в листе», а не алфавит", async () => {
    settingsVals.spellsByLoreOrder = "sheet";
    const actor = cnKit();
    const root = makeSheet(actor);
    const cell = addHeaderCells(root);
    render({ document: actor }, root);
    for (let i = 0; i < 3; i++) { cell.click(); await flush(); }
    assert.strictEqual(settingsVals.spellsByLoreOrder, "sheet");
    assert.strictEqual(settingsVals.spellsByLoreOrderBase, "sheet");
});

await ftest("испорченный «прежний порядок» — возврат к алфавиту", async () => {
    for (const bad of ["cn", "cnDesc", "мусор", ""]) {
        settingsVals.spellsByLoreOrder = "cnDesc";
        settingsVals.spellsByLoreOrderBase = bad;
        const actor = cnKit();
        const root = makeSheet(actor);
        const cell = addHeaderCells(root);
        render({ document: actor }, root);
        cell.click(); await flush();
        assert.strictEqual(settingsVals.spellsByLoreOrder, "name", "база " + JSON.stringify(bad));
    }
});

await ftest("повторная отрисовка того же DOM: один обработчик, подсказка не нарастает", () => {
    settingsVals.spellsByLoreOrder = "cn";
    const actor = cnKit();
    const root = makeSheet(actor);
    const cell = addHeaderCells(root);
    render({ document: actor }, root);
    render({ document: actor }, root);
    render({ document: actor }, root);
    assert.strictEqual(cell.listeners.click.length, 1);
    assert.strictEqual(cell.dataset.tooltip, "SHEET.CN · щелчок: по убыванию");
});

await ftest("щёлкает и тот, кто лист только смотрит; без раскладки графа не трогается", async () => {
    const actor = cnKit();
    actor.isOwner = false;
    const root = makeSheet(actor);
    const cell = addHeaderCells(root);
    render({ document: actor, isEditable: false }, root);
    cell.click(); await flush();
    assert.strictEqual(settingsVals.spellsByLoreOrder, "cn");
    assert.strictEqual(actor.updates.length, 0, "в актёра ничего не пишется");

    settingsVals.spellsByLore = false;
    const root2 = makeSheet(actor);
    const cell2 = addHeaderCells(root2);
    render({ document: actor }, root2);
    assert(!cell2.classList.contains("homerule-cn-sort") && !cell2.listeners.click);
});

await ftest("без подсказки у графы — берём первую узкую; без узких граф — ничего не падает", () => {
    const actor = cnKit();
    const root = makeSheet(actor);
    const cell = addHeaderCells(root, { withTooltip: false });
    render({ document: actor }, root);
    assert(cell.classList.contains("homerule-cn-sort"));
    assert.strictEqual(cell.dataset.tooltip, "Порог сотворения · щелчок: по возрастанию");
    const bare = makeSheet(actor);
    render({ document: actor }, bare);
});

await ftest("настройка порядка знает оба направления, прежний порядок скрыт", () => {
    assert.deepStrictEqual(Object.keys(settingsDefs.spellsByLoreOrder.choices), ["name", "cn", "cnDesc", "sheet"]);
    assert.strictEqual(settingsDefs.spellsByLoreOrderBase.config, false);
    assert.strictEqual(settingsDefs.spellsByLoreOrderBase.scope, "client");
    assert.strictEqual(typeof settingsDefs.spellsByLoreOrder.onChange, "function", "смена порядка перерисует листы");
});

// ================= Поиск =================
const searchInput = root => root.querySelector(".homerule-search input");
function typeInto(input, text) {
    input.value = text;
    return input.dispatch("input", { stopped: false, stopPropagation() { this.stopped = true; } });
}
function keyEv(key) { return { key, stopped: false, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; }
// Что видно: заголовки со счётчиком и строки, без спрятанного
function visible(root, kind = "spells") {
    return content(root, kind).children
        .filter(c => !c.classList.contains("homerule-search-hidden") && !c.classList.contains("homerule-lore-collapsed"))
        .map(c => c.classList.contains("homerule-lore-header")
            ? `## ${c.querySelector(".homerule-lore-name").textContent} (${c.querySelector(".homerule-lore-count").textContent})`
            : c.querySelector(".label").textContent);
}
function searchKit() {
    idc = 0;
    const s = [
        spell("Огненный шар", "fire"), spell("Жаровня", "fire"), spell("Огненная стена", "fire"),
        spell("Позолота", "metal"), spell("Удар молота", "metal"), spell("Ёжистый покров", "shadow"),
        spell("Огонёк", "petty"), spell("Дротик", "petty")
    ];
    const actor = makeActor(s);
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "Боевые", spells: [s[4].id] }, { id: "F2", name: "Пустая", spells: [] }] };
    return actor;
}

await ftest("строка поиска: одна, в самом верху вкладки, пустая", () => {
    const actor = searchKit();
    const app = { document: actor };
    const root = makeSheet(actor);
    render(app, root); render(app, root);
    const tab = root.querySelector("section[data-tab='magic']");
    assert.strictEqual(tab.children[0].classList.contains("homerule-search"), true);
    assert.strictEqual(root.querySelectorAll(".homerule-search").length, 1);
    const input = searchInput(root);
    assert.strictEqual(input.type, "search");
    assert.strictEqual(input.placeholder, "Поиск заклинания");
    assert.strictEqual(input.value, "");
    assert.strictEqual(input.listeners.input.length, 1, "обработчик один после двух отрисовок");
});

await ftest("фильтр по названию в обоих списках: регистр и «ё» не важны, пустые группы прячутся, счётчик «найдено/всего»", () => {
    const actor = searchKit();
    const app = { document: actor };
    const root = makeSheet(actor);
    render(app, root);
    const ev = typeInto(searchInput(root), "  ОГ ");
    assert(ev.stopped, "input не всплывает к форме листа");
    assert.deepStrictEqual(visible(root), ["## Огонь (2/3)", "Огненная стена", "Огненный шар"]);
    assert.deepStrictEqual(visible(root, "petty"), ["Огонёк"]);
    typeInto(searchInput(root), "ежист");
    assert.deepStrictEqual(visible(root), ["## Тень (1/1)", "Ёжистый покров"]);
    typeInto(searchInput(root), "молот");
    assert.deepStrictEqual(visible(root), ["## Боевые (1/1)", "Удар молота"]);
    typeInto(searchInput(root), "нет такого");
    assert.deepStrictEqual(visible(root), []);
    assert.deepStrictEqual(visible(root, "petty"), []);
    typeInto(searchInput(root), "");
    assert.deepStrictEqual(visible(root), ["## Боевые (1)", "Удар молота", "## Пустая (0)", "## Огонь (3)", "Жаровня", "Огненная стена", "Огненный шар", "## Металл (1)", "Позолота", "## Тень (1)", "Ёжистый покров"]);
    assert.deepStrictEqual(visible(root, "petty"), ["Дротик", "Огонёк"]);
});

await ftest("поиск раскрывает свёрнутое, не трогая запомненного; свернуть во время поиска — применится после", () => {
    const actor = searchKit();
    settingsVals.spellsByLoreCollapsed = { "Actor.A1": ["fire"] };
    const app = { document: actor };
    const root = makeSheet(actor);
    render(app, root);
    assert(!visible(root).includes("Огненный шар"), "без поиска свёрнутое скрыто");
    typeInto(searchInput(root), "огнен");
    assert.deepStrictEqual(visible(root), ["## Огонь (2/3)", "Огненная стена", "Огненный шар"]);
    assert(loreHeader(root, "fire").classList.contains("collapsed"), "заголовок остаётся свёрнутым");
    loreHeader(root, "metal").click(); // свернуть металл во время поиска
    assert.deepStrictEqual(settingsVals.spellsByLoreCollapsed, { "Actor.A1": ["fire", "metal"] });
    loreHeader(root, "fire").click(); // развернуть огонь во время поиска
    assert.deepStrictEqual(visible(root), ["## Огонь (2/3)", "Огненная стена", "Огненный шар"], "найденное видно при любом щелчке");
    typeInto(searchInput(root), "");
    const v = visible(root);
    assert(v.includes("Огненный шар") && v.includes("Жаровня"), "огонь развёрнут");
    assert(!v.includes("Позолота") && v.includes("## Металл (1)"), "металл свернулся");
});

await ftest("запрос переживает перерисовку листа и возвращает курсор; закрытый лист поиск забывает", () => {
    const actor = searchKit();
    const app = { document: actor };
    let root = makeSheet(actor);
    render(app, root);
    const input = searchInput(root);
    input.dispatch("focus", {});
    typeInto(input, "огон");
    root = makeSheet(actor); // система перерисовала лист
    render(app, root);
    const again = searchInput(root);
    assert.strictEqual(again.value, "огон");
    assert(again.focused, "фокус вернулся");
    assert.deepStrictEqual(again.selection, [4, 4]);
    assert.deepStrictEqual(visible(root, "petty"), ["Огонёк"]);
    again.dispatch("blur", {});
    root = makeSheet(actor);
    render(app, root);
    assert(!searchInput(root).focused, "после ухода из поля фокус не навязываем");

    hooks.on.closeActorSheetV2.forEach(f => f(app));
    root = makeSheet(actor);
    render(app, root);
    assert.strictEqual(searchInput(root).value, "");
    assert(visible(root, "petty").includes("Дротик"));

    const other = { document: actor };
    const root2 = makeSheet(actor);
    render(other, root2);
    assert.strictEqual(searchInput(root2).value, "", "у другого окна свой поиск");
});

await ftest("клавиши: Enter не отправляет форму, первый Escape чистит поиск, второй уходит дальше; change не всплывает", () => {
    const actor = searchKit();
    const app = { document: actor };
    const root = makeSheet(actor);
    render(app, root);
    const input = searchInput(root);
    typeInto(input, "огон");
    const enter = input.dispatch("keydown", keyEv("Enter"));
    assert(enter.prevented && enter.stopped);
    const esc1 = input.dispatch("keydown", keyEv("Escape"));
    assert(esc1.prevented && esc1.stopped);
    assert.strictEqual(input.value, "");
    assert(visible(root, "petty").includes("Дротик"));
    const esc2 = input.dispatch("keydown", keyEv("Escape"));
    assert(!esc2.stopped && !esc2.prevented, "пустое поле Escape не держит");
    const ch = input.dispatch("change", keyEv());
    assert(ch.stopped);
    const letter = input.dispatch("keydown", keyEv("а"));
    assert(!letter.stopped);
});

await ftest("поиск у того, кто лист только смотрит, и при «как в листе»", () => {
    settingsVals.spellsByLoreOrder = "sheet";
    const actor = searchKit();
    actor.isOwner = false;
    const app = { document: actor, isEditable: false };
    const root = makeSheet(actor);
    render(app, root);
    typeInto(searchInput(root), "поз");
    assert.deepStrictEqual(visible(root), ["## Металл (1/1)", "Позолота"]);
    assert.strictEqual(actor.updates.length, 0);
});

await ftest("без раскладки строки поиска нет", () => {
    settingsVals.spellsByLore = false;
    const actor = searchKit();
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.strictEqual(searchInput(root), null);
});

// ================= Подсказка со свойством школы =================
const RU_DESC = {
    metal: "Шамон — очень густой Ветер.<br /><br />Заклинания Школы Металла игнорируют класс брони металла.",
    fire: "Цель будет @Condition[охвачен огнём]. Против @UUID[Compendium.wfrp4e-core.items.Item.v3uz]{демон} и @UUID[Compendium.x.y.Item.z] сильнее.",
    light: "",
    petty: "None",
    hedgecraft: "WFRP4E.LoreDescription.Hedgecraft"
};
const RU_WIND = { metal: "Шамон", fire: "Акши", light: "Хиш", shadow: "WFRP4E.MagicWind.shadow", hedgecraft: "None" };
function withLoreConfig(f) {
    const cfg = ctx.game.wfrp4e.config;
    cfg.loreEffectDescriptions = { ...RU_DESC };
    cfg.magicWind = { ...RU_WIND };
    try { return f(); } finally { delete cfg.loreEffectDescriptions; delete cfg.magicWind; delete ctx.game.i18n.has; }
}
const info = h => h.querySelector(".homerule-lore-info");

await ftest("значок ⓘ со свойством школы: название, ветер, текст; вставки системы — подписью", () => withLoreConfig(() => {
    idc = 0;
    const actor = makeActor([spell("А", "metal"), spell("Б", "fire"), spell("В", "light"), spell("Г", "hedgecraft"), spell("Д", "shadow"), spell("Е", "Своя школа"), spell("Ж", [])]);
    actor.flags["wfrp4e-homerules"] = { spellFolders: [{ id: "F1", name: "Папка", spells: [] }] };
    const root = makeSheet(actor);
    render({ document: actor }, root);
    const metal = info(loreHeader(root, "metal"));
    assert.strictEqual(metal.dataset.tooltip, "<strong>Металл</strong> · ветер Шамон<br><br>" + RU_DESC.metal);
    assert.strictEqual(metal.dataset.tooltipClass, "homerule-lore-tooltip");
    const fire = info(loreHeader(root, "fire")).dataset.tooltip;
    assert(fire.endsWith("Цель будет охвачен огнём. Против демон и  сильнее."), fire);
    assert(!fire.includes("@"), "вставок не осталось");
    for (const lore of ["light", "hedgecraft", "Своя школа", ""]) {
        assert.strictEqual(info(loreHeader(root, lore)), null, "без текста значка нет: " + JSON.stringify(lore));
    }
    assert.strictEqual(info(folderHeader(root, "F1")), null, "у папки значка нет");
    // shadow: текста нет вовсе в настройке
    assert.strictEqual(info(loreHeader(root, "shadow")), null);
    // значок стоит между названием и счётчиком
    const kids = loreHeader(root, "metal").children.map(c => [...c.classList.s].find(x => x.startsWith("homerule-")));
    assert.deepStrictEqual(kids, ["homerule-lore-chevron", "homerule-lore-swatch", "homerule-lore-name", "homerule-lore-info", "homerule-lore-count"]);
}));

await ftest("ветра нет или он не переведён — строка без «ветер»", () => withLoreConfig(() => {
    ctx.game.wfrp4e.config.loreEffectDescriptions.shadow = "Тени обманчивы.";
    ctx.game.wfrp4e.config.loreEffectDescriptions.hedgecraft = "Травы.";
    idc = 0;
    const actor = makeActor([spell("Д", "shadow"), spell("Г", "hedgecraft")]);
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.strictEqual(info(loreHeader(root, "shadow")).dataset.tooltip, "<strong>Тень</strong><br><br>Тени обманчивы.");
    assert.strictEqual(info(loreHeader(root, "hedgecraft")).dataset.tooltip, "<strong>Знахарство</strong><br><br>Травы.");
}));

await ftest("если в настройке ещё ключ, а перевод есть — берём перевод", () => withLoreConfig(() => {
    ctx.game.wfrp4e.config.loreEffectDescriptions.metal = "WFRP4E.LoreDescription.Metal";
    ctx.game.wfrp4e.config.magicWind.metal = "WFRP4E.MagicWind.metal";
    const dict = { "WFRP4E.LoreDescription.Metal": "Перевод свойства.", "WFRP4E.MagicWind.metal": "Шамон" };
    ctx.game.i18n.has = k => k in dict;
    const plainLocalize = ctx.game.i18n.localize;
    ctx.game.i18n.localize = k => dict[k] ?? plainLocalize(k);
    try {
        idc = 0;
        const actor = makeActor([spell("А", "metal")]);
        const root = makeSheet(actor);
        render({ document: actor }, root);
        assert.strictEqual(info(loreHeader(root, "metal")).dataset.tooltip, "<strong>Металл</strong> · ветер Шамон<br><br>Перевод свойства.");
    } finally { ctx.game.i18n.localize = plainLocalize; }
}));

await ftest("щелчок по значку не сворачивает группу", () => withLoreConfig(() => {
    idc = 0;
    const actor = makeActor([spell("А", "metal")]);
    const root = makeSheet(actor);
    render({ document: actor }, root);
    let stopped = false;
    info(loreHeader(root, "metal")).listeners.click.forEach(f => f({ stopPropagation() { stopped = true; } }));
    assert(stopped);
}));

// ================= Нечёткий поиск и поиск по описанию =================
function fuzzyKit() {
    const actor = searchKit();
    return actor;
}
function find(root, q) {
    typeInto(searchInput(root), q);
    return visible(root).filter(x => !x.startsWith("##")).concat(visible(root, "petty"));
}

await ftest("начала слов в любом порядке", () => {
    const actor = fuzzyKit();
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(find(root, "шар огн"), ["Огненный шар"]);
    assert.deepStrictEqual(find(root, "огн ша"), ["Огненный шар"]);
    assert.deepStrictEqual(find(root, "ст огн"), ["Огненная стена"]);
    assert.deepStrictEqual(find(root, "уд мол"), ["Удар молота"]);
});

await ftest("опечатки: 4–6 букв — одна, длиннее — две; перестановка соседних — одна", () => {
    const actor = fuzzyKit();
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(find(root, "огенный"), ["Огненный шар"], "перестановка е/н");
    assert.deepStrictEqual(find(root, "молто"), ["Удар молота"]);
    assert.deepStrictEqual(find(root, "позалота"), ["Позолота"]);
    assert.deepStrictEqual(find(root, "дортик"), ["Дротик"], "простейшие тоже");
    assert.deepStrictEqual(find(root, "пзлта"), [], "три ошибки на пять букв — мимо");
});

await ftest("первая буква должна совпасть, короткие слова — только по началу", () => {
    const actor = fuzzyKit();
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(find(root, "шаровня"), [], "ж→ш в первой букве не прощаем");
    assert.deepStrictEqual(find(root, "шр"), []);
    assert.deepStrictEqual(find(root, "жр"), [], "короткое слово без опечаток");
    assert.deepStrictEqual(find(root, "жа"), ["Жаровня"]);
});

await ftest("латиница в русской раскладке; настоящая латиница ищется как есть", () => {
    idc = 0;
    const actor = makeActor([spell("Огненный шар", "fire"), spell("Позолота", "metal"), spell("Mòna's Mire", "Mòna's Marsh Magic"), spell("Огонёк", "petty")]);
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(find(root, "juytyysq"), ["Огненный шар"]);
    assert.deepStrictEqual(find(root, "GJPJ"), ["Позолота"], "регистр не важен");
    assert.deepStrictEqual(find(root, "jujyt`r"), ["Огонёк"], "` — это ё");
    assert.deepStrictEqual(find(root, "mire"), ["Mòna's Mire"]);
});

function describe(s, html, { range = "", target = "", duration = "", prepared } = {}) {
    s.system.description = { value: prepared ?? html };
    s.system.range = { value: range }; s.system.target = { value: target }; s.system.duration = { value: duration };
    s._source = { system: { description: { value: html }, range: { value: range }, target: { value: target }, duration: { value: duration } } };
    return s;
}
function textKit() {
    idc = 0;
    const s = [
        describe(spell("Стрела (Тень)", "shadow"), "<p>Персонаж выстреливает во врага. Считается магическим снарядом с уроном&nbsp;+4.</p>\n\n<p><b>Школа:</b> Атакующие заклинания Школы Теней игнорируют класс брони.</p>", { range: "Сила воли ярдов", target: "1", duration: "мгновенная" }),
        describe(spell("Горн Шамона", "metal"), "<p>Персонаж насыщает Шамоном металлический предмет. Цель будет @Condition[охвачен огнём]; 5 &lt; 6.</p>", { range: "касание", target: "1 объект", duration: "мгновенная" },),
        describe(spell("Проклятье ржавчины", "metal"), "<p>Металл ржавеет.</p>", { range: "касание", prepared: "<p>Металл ржавеет.</p><p>\n\n <b>Школа:</b> игнорируют класс брони металла<p>" }),
        describe(spell("Испивание", "petty"), "<p>Вытягивает жизненную силу.</p>", { range: "касание" })
    ];
    return makeActor(s);
}
function withLoreMarker(f) {
    const plain = ctx.game.i18n.localize;
    ctx.game.i18n.localize = k => k === "SPELL.Lore" ? "Школа:" : plain(k);
    try { return f(); } finally { ctx.game.i18n.localize = plain; }
}
const hits = root => root.querySelectorAll(".homerule-search-hit");
const toggleOf = root => root.querySelector(".homerule-search-text");

await ftest("кнопка «и в описании»: выключена по умолчанию, щелчок включает, подсказка и класс меняются, выбор помнится", async () => withLoreMarker(async () => {
    const actor = textKit();
    const app = { document: actor };
    let root = makeSheet(actor);
    render(app, root);
    const t = toggleOf(root);
    assert(!t.classList.contains("active"));
    assert(t.dataset.tooltip.startsWith("Ищу только по названию"));
    assert.deepStrictEqual(find(root, "касание"), [], "по описанию не ищем, пока не просили");
    t.click(); await flush();
    assert.strictEqual(settingsVals.spellsByLoreSearchText, true);
    assert(t.classList.contains("active") && t.dataset.tooltip.startsWith("Ищу и в описании"));
    assert.deepStrictEqual(visible(root).filter(x => !x.startsWith("##")).concat(visible(root, "petty")), ["Горн Шамона", "Проклятье ржавчины", "Испивание"], "применилось сразу, без перепечатки");
    root = makeSheet(actor);
    render(app, root);
    assert(toggleOf(root).classList.contains("active"), "после перерисовки кнопка включена");
    assert.strictEqual(toggleOf(root).listeners.click.length, 1);
    assert.strictEqual(searchInput(root).value, "касание");
    toggleOf(root).click(); await flush();
    assert.strictEqual(settingsVals.spellsByLoreSearchText, false);
    assert.deepStrictEqual(find(root, "касание"), []);
}));

await ftest("свойство школы в описании не ищется: ни сохранённое, ни дописанное системой", () => withLoreMarker(() => {
    settingsVals.spellsByLoreSearchText = true;
    const actor = textKit();
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(find(root, "брони"), [], "«Школа:» отрезано, подготовленное описание не берём");
    assert.deepStrictEqual(find(root, "игнорир"), []);
    assert.deepStrictEqual(find(root, "снаряд"), ["Стрела (Тень)"], "то, что до «Школа:», ищется");
}));

await ftest("в описании — только начала слов и подстрока, без опечаток; сущности и вставки разобраны", () => withLoreMarker(() => {
    settingsVals.spellsByLoreSearchText = true;
    const actor = textKit();
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(find(root, "снарядм"), [], "опечатка в описании не прощается");
    assert.deepStrictEqual(find(root, "урон +4"), ["Стрела (Тень)"], "&nbsp; стал пробелом");
    assert.deepStrictEqual(find(root, "охвачен"), ["Горн Шамона"], "из @Condition осталась подпись");
    assert.deepStrictEqual(find(root, "condition"), [], "сама вставка не ищется");
    assert.deepStrictEqual(find(root, "мгновен сила"), ["Стрела (Тень)"], "дальность и длительность в поиске, слова в любом порядке");
    assert.deepStrictEqual(find(root, "шамон"), ["Горн Шамона"]);
}));

await ftest("пометка «найдено в описании»: только у найденного не по названию, с куском текста; снимается", () => withLoreMarker(() => {
    settingsVals.spellsByLoreSearchText = true;
    const actor = textKit();
    const root = makeSheet(actor);
    render({ document: actor }, root);
    find(root, "шамон");
    assert.strictEqual(hits(root).length, 0, "нашлось по названию — без пометки");
    find(root, "насыщает");
    const marks = hits(root);
    assert.strictEqual(marks.length, 1);
    const tip = marks[0].dataset.tooltip;
    assert(tip.startsWith("Найдено в описании:<br>"), tip);
    assert(tip.includes("<strong>насыщает</strong>"), tip);
    assert(tip.includes("5 &lt; 6"), "текст экранирован: " + tip);
    assert.strictEqual(marks[0].parentElement.classList.contains("list-name"), true);
    find(root, "насыщает");
    assert.strictEqual(hits(root).length, 1, "повторный поиск не плодит значки");
    find(root, "");
    assert.strictEqual(hits(root).length, 0, "очистили поиск — значков нет");
}));

await ftest("кусок описания: многоточия по краям, найденное начало слова жирным", () => withLoreMarker(() => {
    settingsVals.spellsByLoreSearchText = true;
    idc = 0;
    const long = "Начало. " + "очень длинная фраза ".repeat(10) + "ИСКОМОЕ слово " + "и хвост ".repeat(20);
    const actor = makeActor([describe(spell("Длинное", "fire"), "<p>" + long + "</p>")]);
    const root = makeSheet(actor);
    render({ document: actor }, root);
    find(root, "иском");
    const tip = hits(root)[0].dataset.tooltip;
    assert(tip.includes("<br>…") && tip.endsWith("…"), tip);
    assert(tip.includes("<strong>ИСКОМ</strong>ОЕ"), "найденное начало слова, в исходном регистре: " + tip);
}));

await ftest("заклинание без описания и без _source не роняет поиск по тексту", () => withLoreMarker(() => {
    settingsVals.spellsByLoreSearchText = true;
    idc = 0;
    const actor = makeActor([spell("Пустое", "fire")]);
    const root = makeSheet(actor);
    render({ document: actor }, root);
    assert.deepStrictEqual(find(root, "что-то"), []);
    assert.deepStrictEqual(find(root, "пуст"), ["Пустое"]);
}));

// ================= Поиск на навыках и талантах =================
function item(type, name, extra = {}) {
    const id = "i" + (++idc);
    const it = { id, type, name, uuid: "Actor.A1.Item." + id, system: { ...extra } };
    it._source = { system: structuredClone(extra) };
    return it;
}
function listRow(it, { indicator = false, label } = {}) {
    const row = el("div", ["list-row"], it ? { uuid: it.uuid } : {});
    if (!it) row.classList.add("inactive", "nocontext");
    const rc = el("div", ["row-content"]);
    const nm = el("div", ["list-name"]);
    const a = el("a", ["label"]); a.textContent = label ?? it.name;
    if (indicator) { const ind = el("a", ["advancement-indicator"]); ind.textContent = "+"; a.append(ind); }
    nm.append(a); rc.append(nm); row.append(rc);
    return row;
}
function sheetList(classes, rows, tail) {
    const list = el("div", ["sheet-list", ...classes]);
    const content = el("div", ["list-content"]);
    content.append(...rows);
    if (tail) content.append(tail);
    list.append(el("div", ["list-header", "row-content"]), content);
    return list;
}
// Разметка вкладок как в actor-skills.hbs и actor-talents.hbs 10.0.0
function skillsSection(tabName, basic, advanced, untrained, extended = []) {
    const sec = el("section", ["tab"], { tab: tabName });
    const newSkill = () => el("div", ["new-skill"]);
    const lists = el("div", ["skill-lists"]);
    lists.append(
        sheetList(["condensed", "basic"], basic.map(s => listRow(s)), newSkill()),
        sheetList(["condensed", "advanced"], [...advanced.map(s => listRow(s, { indicator: true })), ...untrained.map(n => listRow(null, { label: n }))], newSkill()));
    sec.append(sheetList(["extended-tests", "condensed", "hidden"], extended.map(s => listRow(s))), lists, el("div", ["sheet-list", "extended-toggle"]));
    return sec;
}
function talentsSection(traits, talents, untrained) {
    const sec = el("section", ["tab"], { tab: "talents" });
    sec.append(sheetList(["traits"], traits.map(t => listRow(t))), sheetList(["talent"], [...talents.map(t => listRow(t)), ...untrained.map(n => listRow(null, { label: n }))]));
    return sec;
}
function skKit({ tabName = "skills", withMagic = false } = {}) {
    idc = 0;
    const basic = ["Атлетика", "Уклонение", "Восприятие", "Рукопашный бой (Основное)"].map(n => item("skill", n));
    const advanced = ["Язык (Магический)", "Концентрация (Шамон)"].map(n => item("skill", n));
    const ext = [item("extendedTest", "Изучение гримуара")];
    const talents = [
        item("talent", "Меткий стрелок", { tests: { value: "" }, description: { value: "<p>Лучше стреляет.</p>" } }),
        item("talent", "Бесшумный", { tests: { value: "Скрытность (Город)" }, description: { value: "<p>Тихо ходит.</p>" } }),
        item("talent", "Чувство магии", { tests: { value: "" }, description: { value: "<p>Чует @Condition[ослеплён] ветра.</p>" } })
    ];
    const traits = [item("trait", "Оружие")];
    const spells = withMagic ? [spell("Огненный шар", "fire")] : [];
    const actor = makeActor([...basic, ...advanced, ...ext, ...talents, ...traits, ...spells]);
    const root = withMagic ? makeSheet({ spells }) : el("div", ["wfrp4e", "actor", "sheet"]);
    root.append(skillsSection(tabName, basic, advanced, ["Выслеживание"], ext), talentsSection(traits, talents, ["Сильные ноги"]));
    return { actor, root };
}
const sec = (root, tab) => root.querySelectorAll("section").find(s => s.dataset.tab === tab);
const barIn = (root, tab) => childrenWithClassT(sec(root, tab), "homerule-search")[0];
function childrenWithClassT(parent, cls) { return parent.children.filter(c => c.classList.contains(cls)); }
const inputIn = (root, tab) => barIn(root, tab)?.querySelector("input");
function shownIn(root, tab) {
    return sec(root, tab).querySelectorAll(".sheet-list > .list-content > .list-row")
        .filter(r => !r.classList.contains("homerule-search-hidden"))
        .map(r => rowName(r));
}
function rowName(r) { const a = r.querySelector(".label"); return a._text; }

await ftest("строки поиска у навыков и талантов: в самом верху, свои подписи, ¶ только у талантов, по одной после двух отрисовок", () => {
    const { actor, root } = skKit({ withMagic: true });
    const app = { document: actor };
    render(app, root); render(app, root);
    assert(sec(root, "skills").children[0].classList.contains("homerule-search"));
    assert(sec(root, "talents").children[0].classList.contains("homerule-search"));
    assert.strictEqual(inputIn(root, "skills").placeholder, "Поиск навыка");
    assert.strictEqual(inputIn(root, "talents").placeholder, "Поиск таланта или черты");
    assert.strictEqual(barIn(root, "skills").querySelector(".homerule-search-text"), null, "у навыков ¶ нет");
    assert(barIn(root, "talents").querySelector(".homerule-search-text"), "у талантов ¶ есть");
    assert.strictEqual(root.querySelectorAll(".homerule-search").length, 3, "магия, навыки, таланты — по одной");
    assert.strictEqual(barIn(root, "magic").dataset.kind, "magic");
    assert.strictEqual(inputIn(root, "skills").listeners.input.length, 1);
});

await ftest("навыки: нечёткий поиск в обоих столбцах, неизученные по подписи, значок «+» в подписи не мешает", () => {
    const { actor, root } = skKit();
    render({ document: actor }, root);
    const i = inputIn(root, "skills");
    typeInto(i, "уклон");
    assert.deepStrictEqual(shownIn(root, "skills"), ["Уклонение"]);
    typeInto(i, "концетрация");
    assert.deepStrictEqual(shownIn(root, "skills"), ["Концентрация (Шамон)"], "опечатка");
    typeInto(i, "шамон");
    assert.deepStrictEqual(shownIn(root, "skills"), ["Концентрация (Шамон)"], "слово в скобках");
    typeInto(i, "бой рук");
    assert.deepStrictEqual(shownIn(root, "skills"), ["Рукопашный бой (Основное)"]);
    typeInto(i, "высл");
    assert.deepStrictEqual(shownIn(root, "skills"), ["Выслеживание"], "неизученный карьерный навык");
    typeInto(i, "+");
    assert.deepStrictEqual(shownIn(root, "skills"), [], "значок продвижения в поиск не идёт");
    typeInto(i, "bpextybt");
    assert.deepStrictEqual(shownIn(root, "skills"), ["Изучение гримуара"], "раскладка; продолжительные проверки тоже фильтруются");
    typeInto(i, "");
    assert.strictEqual(shownIn(root, "skills").length, 8);
    assert(sec(root, "skills").querySelectorAll(".new-skill").every(n => !n.classList.contains("homerule-search-hidden")), "поле «добавить навык» не прячем");
});

await ftest("таланты: по названию, черты тоже; ¶ добавляет описание и графу «Тесты» с пометкой", async () => {
    const { actor, root } = skKit();
    const app = { document: actor };
    render(app, root);
    const i = inputIn(root, "talents");
    typeInto(i, "меткий");
    assert.deepStrictEqual(shownIn(root, "talents"), ["Меткий стрелок"]);
    typeInto(i, "оруж");
    assert.deepStrictEqual(shownIn(root, "talents"), ["Оружие"]);
    typeInto(i, "сильн");
    assert.deepStrictEqual(shownIn(root, "talents"), ["Сильные ноги"], "неизученный карьерный талант");
    typeInto(i, "скрытн");
    assert.deepStrictEqual(shownIn(root, "talents"), [], "без ¶ графа «Тесты» не ищется");
    const t = barIn(root, "talents").querySelector(".homerule-search-text");
    assert(t.dataset.tooltip.includes("описании и графе «Тесты»"));
    t.click(); await flush();
    assert.deepStrictEqual(shownIn(root, "talents"), ["Бесшумный"]);
    const hit = sec(root, "talents").querySelectorAll(".homerule-search-hit");
    assert.strictEqual(hit.length, 1);
    assert(hit[0].dataset.tooltip.includes("<strong>Скрытн</strong>ость (Город)"), hit[0].dataset.tooltip);
    typeInto(i, "ослеп");
    assert.deepStrictEqual(shownIn(root, "talents"), ["Чувство магии"], "вставка системы подписью");
});

await ftest("лист НПС: навыки на главной вкладке тоже получают поиск", () => {
    const { actor, root } = skKit({ tabName: "main" });
    render({ document: actor }, root);
    assert.strictEqual(barIn(root, "main").dataset.kind, "skills");
    typeInto(inputIn(root, "main"), "атл");
    assert.deepStrictEqual(shownIn(root, "main"), ["Атлетика"]);
});

await ftest("у каждой вкладки свой запрос; перерисовка сохраняет оба, закрытие листа забывает все", () => {
    const { actor, root } = skKit({ withMagic: true });
    const app = { document: actor };
    render(app, root);
    typeInto(inputIn(root, "skills"), "атл");
    typeInto(inputIn(root, "talents"), "меткий");
    assert.strictEqual(shownIn(root, "talents").length, 1);
    assert.strictEqual(inputIn(root, "magic").value, "", "магия своя");
    const again = skKit({ withMagic: true });
    render(app, again.root);
    assert.strictEqual(inputIn(again.root, "skills").value, "атл");
    assert.strictEqual(inputIn(again.root, "talents").value, "меткий");
    assert.deepStrictEqual(shownIn(again.root, "skills"), ["Атлетика"]);
    hooks.on.closeActorSheetV2.forEach(f => f(app));
    const third = skKit({ withMagic: true });
    render(app, third.root);
    assert.strictEqual(inputIn(third.root, "skills").value, "");
    assert.strictEqual(inputIn(third.root, "talents").value, "");
});

await ftest("выключенная настройка убирает поиск с навыков и талантов, магию не трогает", () => {
    settingsVals.sheetSearch = false;
    const { actor, root } = skKit({ withMagic: true });
    render({ document: actor }, root);
    assert.strictEqual(barIn(root, "skills"), undefined);
    assert.strictEqual(barIn(root, "talents"), undefined);
    assert(barIn(root, "magic"), "у магии поиск свой, по своей настройке");
    settingsVals.sheetSearch = true;
    settingsVals.spellsByLore = false;
    const b = skKit({ withMagic: true });
    render({ document: b.actor }, b.root);
    assert(barIn(b.root, "skills") && barIn(b.root, "talents"));
    assert.strictEqual(barIn(b.root, "magic"), undefined);
});

await ftest("кнопка ¶ одна на все вкладки", async () => {
    const { actor, root } = skKit({ withMagic: true });
    const app = { document: actor };
    render(app, root);
    barIn(root, "talents").querySelector(".homerule-search-text").click(); await flush();
    const again = skKit({ withMagic: true });
    render(app, again.root);
    assert(barIn(again.root, "magic").querySelector(".homerule-search-text").classList.contains("active"));
    assert(barIn(again.root, "magic").querySelector(".homerule-search-text").dataset.tooltip.includes("дальности"));
});

await ftest("на вкладке навыков ¶ не действует, даже если включена", () => {
    settingsVals.spellsByLoreSearchText = true;
    idc = 0;
    const sk = item("skill", "Атлетика", { description: { value: "<p>Прыжки и бег.</p>" } });
    const actor = makeActor([sk]);
    const root = el("div", ["wfrp4e", "actor", "sheet"]);
    root.append(skillsSection("skills", [sk], [], []));
    render({ document: actor }, root);
    typeInto(inputIn(root, "skills"), "прыжки");
    assert.deepStrictEqual(shownIn(root, "skills"), []);
});

await ftest("лист без навыков и талантов и пустой актёр — без строк и без ошибок", () => {
    idc = 0;
    const actor = makeActor([]);
    const root = el("div", ["wfrp4e", "actor", "sheet"]);
    root.append(el("section", ["tab"], { tab: "notes" }), skillsSection("skills", [], [], []));
    render({ document: actor }, root);
    assert.strictEqual(barIn(root, "notes"), undefined);
    assert(barIn(root, "skills"));
    typeInto(inputIn(root, "skills"), "что-то");
});

// ================= Справка из библиотеки =================
const fetchCalls = [];
let fetchImpl = null;
const created = [];
ctx.fetch = async (url, opts) => { fetchCalls.push({ url, opts }); return fetchImpl(url, opts); };
ctx.ChatMessage = { create: async data => { created.push(structuredClone(data)); return data; } };
ctx.game.user = { id: "GM1", isGM: true };
const chat = msg => hooks.on.chatMessage.map(f => f({}, msg, {}))[0];
const okJson = json => ({ ok: true, status: 200, json: async () => json });
const HITS = {
    query: "скрытность", count: 3, hits: [
        { rank: 1, type: "rules", name: "Скрытность (Пр), группа общих навыков", source: "WFRP 4e — Книга правил (RUS)", pages: "117-147",
          section_path: "НАВЫКИ > Скрытность (Пр), группа общих навыков", metadata: { language: "ru" },
          text: "### **Скрытность (Пр),** *группа общих навыков*\n\nЭтот навык позволяет персонажу тише перемещаться.\n\n| Условие | Модификатор |\n|---|---|\n| Темнота | +20 |" },
        { rank: 2, type: "rules", name: "Stealth", source: "The Imperial Zoo", pages: "10", section_path: "", metadata: { language: "en" }, text: "Stealth text." },
        { rank: 3, type: "campaign", name: "Склад 13", source: "Враг в тени (v1-0)", pages: "100-115", section_path: "Склад 13", metadata: { language: "ru" }, text: "Сюжет: <b>спойлер</b>" }
    ]
};
function lreset() { fetchCalls.length = 0; created.length = 0; fetchImpl = async () => okJson(HITS); }

await ftest("чужие сообщения и команды не трогаем; выключенная справка отдаёт команду Foundry", () => {
    lreset();
    for (const m of ["привет", "/r 1d10", "/правила скрытность", "правило скрытность", "/rules x"]) {
        assert.strictEqual(chat(m), undefined, m);
    }
    settingsVals.libraryLookup = false;
    assert.strictEqual(chat("/правило скрытность"), undefined);
    assert.strictEqual(fetchCalls.length, 0);
});

await ftest("v14: сообщение приходит HTML из ProseMirror — <p>, &nbsp;, &amp;, разметка внутри", async () => {
    lreset();
    assert.strictEqual(chat("<p>привет</p>"), undefined);
    assert.strictEqual(chat("<p>/r 1d10</p>"), undefined);
    assert.strictEqual(chat("<p>/правило</p>"), false, "пустой запрос в обёртке");
    assert.strictEqual(fetchCalls.length, 0);
    const cases = [
        ["<p>/правило скрытность в городе</p>", "скрытность в городе"],
        ["<p>/правило огненный&nbsp;шар</p>", "огненный шар"],
        ["<p>/rule a &amp; b</p>", "a & b"],
        ["<p>/правило <strong>огр</strong></p>", "огр"],
        ["<p>/правило раз<br>два</p>", "раз два"]
    ];
    for (const [msg] of cases) { assert.strictEqual(chat(msg), false, msg); await flush(); await flush(); }
    assert.deepStrictEqual(fetchCalls.map(c => decodeURIComponent(c.url.split("q=")[1].split("&top_k")[0])), cases.map(c => c[1]));
});

await ftest("пустой запрос — подсказка, без обращения к демону", () => {
    lreset();
    assert.strictEqual(chat("/правило"), false);
    assert.strictEqual(chat("/правило    "), false);
    assert.strictEqual(fetchCalls.length, 0);
    assert(notes.every(n => n.startsWith("Что искать?")));
});

await ftest("запрос: адрес, кодировка, шёпот себе, данные в флагах; /rule и регистр", async () => {
    lreset();
    assert.strictEqual(chat("  /Правило   скрытность в городе  "), false);
    await flush(); await flush();
    assert.strictEqual(fetchCalls[0].url, "http://127.0.0.1:8765/search?q=" + encodeURIComponent("скрытность в городе") + "&top_k=3");
    assert(fetchCalls[0].opts.signal, "запрос можно прервать по таймауту");
    const msg = created[0];
    assert.deepStrictEqual(msg.whisper, ["GM1"]);
    assert.strictEqual(msg.speaker.alias, "Библиотека");
    const lib = msg.flags["wfrp4e-homerules"].library;
    assert.strictEqual(lib.query, "скрытность в городе");
    assert.strictEqual(lib.hits.length, 3);
    assert.deepStrictEqual(Object.keys(lib.hits[0]).sort(), ["language", "name", "pages", "section", "source", "text", "type"]);
    assert.strictEqual(lib.hits[0].text, HITS.hits[0].text, "текст целиком, для «Показать всем»");
    chat("/RULE stealth"); await flush(); await flush();
    assert(fetchCalls[1].url.includes("q=stealth"));
});

await ftest("карточка: первый фрагмент раскрыт, книга и страницы, тип и язык по-русски, у приключения нет «Показать всем»", async () => {
    lreset();
    chat("/правило скрытность"); await flush(); await flush();
    const html = created[0].content;
    assert(html.startsWith('<div class="wfrp4e chat-card homerule-library"><div class="test-title">Библиотека: «скрытность»</div>'), html.slice(0, 120));
    const blocks = html.split('<details class="homerule-library-hit"').slice(1);
    assert.strictEqual(blocks.length, 3);
    assert(blocks[0].startsWith(" open>") && !blocks[1].startsWith(" open") && !blocks[2].startsWith(" open"));
    assert(blocks[0].includes("WFRP 4e — Книга правил (RUS), с. 117–147 · правила"), blocks[0]);
    assert(!blocks[0].includes("homerule-library-section"), "раздел, повторяющий название, не дублируем");
    assert(blocks[1].includes("The Imperial Zoo, с. 10 · правила · англ."));
    assert(blocks[0].includes("homerule-library-reveal") && blocks[1].includes("homerule-library-reveal"));
    assert(!blocks[2].includes("homerule-library-reveal"), "сюжет игрокам не показываем");
    assert(blocks[2].includes("приключение"));
    assert(blocks[2].includes("&lt;b&gt;спойлер&lt;/b&gt;") && !blocks[2].includes("<b>спойлер"), "текст экранирован");
});

await ftest("адрес демона из настройки: пробелы и хвостовой слэш убираются, свой порт", async () => {
    lreset();
    settingsVals.libraryUrl = "  http://127.0.0.1:9999/  ";
    chat("/правило огр"); await flush(); await flush();
    assert(fetchCalls[0].url.startsWith("http://127.0.0.1:9999/search?q="), fetchCalls[0].url);
    settingsVals.libraryUrl = "";
    chat("/правило огр"); await flush(); await flush();
    assert(fetchCalls[1].url.startsWith("http://127.0.0.1:8765/search?q="), "пустая настройка — адрес по умолчанию");
});

await ftest("ошибки: демон не запущен, модели грузятся, ошибка сервера, долгий ответ — предупреждение, карточки нет", async () => {
    lreset();
    fetchImpl = async () => { throw new TypeError("Failed to fetch"); };
    chat("/правило огр"); await flush(); await flush();
    assert(notes.some(n => n.includes("не отвечает по адресу http://127.0.0.1:8765") && n.includes("Проверь, что служба поиска запущена")), notes.join(" | "));
    fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
    chat("/правило огр"); await flush(); await flush();
    assert(notes.some(n => n.includes("загружает модели")));
    fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
    chat("/правило огр"); await flush(); await flush();
    assert(notes.some(n => n.includes("ошибкой 500")));
    const realTimeout = ctx.setTimeout;
    ctx.setTimeout = fn => { fn(); return 0; };
    fetchImpl = async (url, opts) => { if (opts.signal.aborted) throw new DOMException("aborted", "AbortError"); return okJson(HITS); };
    try { chat("/правило огр"); await flush(); await flush(); } finally { ctx.setTimeout = realTimeout; }
    assert(notes.some(n => n.includes("дольше 30 секунд")), notes.join(" | "));
    assert.strictEqual(created.length, 0);
});

await ftest("ничего не нашлось — карточка об этом", async () => {
    lreset();
    fetchImpl = async () => okJson({ query: "x", count: 0, hits: [] });
    chat("/правило абракадабра"); await flush(); await flush();
    assert(created[0].content.includes("Ничего не нашлось"));
    assert(!created[0].content.includes("<details"));
});

await ftest("Markdown → HTML: заголовок, жирный, курсив, список, таблица с шапкой, экранирование, звёздочки в арифметике", () => {
    const md = "### **Навык (Пр),** *группа*\n\nТекст <script>x</script> строка\nвторая строка\n\n- пункт\n\n| Травма                | Урон |\n|-----------------------|------|\n| Сломанный нос         | 2    |\n|                       |      |\n\n5 * 3 * 2 = 30";
    const html = ctx.renderLibraryMarkdown(md);
    assert(html.includes("<p><strong><strong>Навык (Пр),</strong> <em>группа</em></strong></p>"), html);
    assert(html.includes("<p>Текст &lt;script&gt;x&lt;/script&gt; строка<br>вторая строка</p>"), html);
    assert(html.includes("<p>• пункт</p>"));
    assert(html.includes('<table class="homerule-library-table"><thead><tr><th>Травма</th><th>Урон</th></tr></thead><tbody><tr><td>Сломанный нос</td><td>2</td></tr></tbody></table>'), html);
    assert(html.includes("<p>5 * 3 * 2 = 30</p>"), "арифметика не курсив: " + html);
    const br = ctx.renderLibraryMarkdown("| x<br>y | z<br/>w | <br onload=alert(1)> |");
    assert(br.includes("<td>x<br>y</td><td>z<br>w</td><td>&lt;br onload=alert(1)&gt;</td>"), "переносы Marker — да, остальное — нет: " + br);
    const noHead = ctx.renderLibraryMarkdown("| a | b |\n| c | d |");
    assert(noHead.includes("<tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody>") && !noHead.includes("<thead>"), noHead);
});

function libraryRoot(hitsCount) {
    const root = el("div");
    for (let i = 0; i < hitsCount; i++) { const a = el("a", ["homerule-library-reveal"], { index: String(i) }); root.append(a); }
    return root;
}
const libMessage = () => ({ flags: { "wfrp4e-homerules": { library: { query: "скрытность", hits: HITS.hits.map(h => ({ name: h.name, section: h.section_path, source: h.source, pages: h.pages, type: h.type, language: h.metadata.language, text: h.text })) } } } });

await ftest("«Показать всем»: общий фрагмент в чат целиком, без шёпота; привязка одна на два имени хука", async () => {
    lreset();
    const msg = libMessage();
    const root = libraryRoot(3);
    hooks.on.renderChatMessageHTML.forEach(f => f(msg, root));
    hooks.on.renderChatMessage.forEach(f => f(msg, root));
    const btn = root.children[0];
    assert.strictEqual(btn.listeners.click.length, 1);
    btn.click(); await flush();
    assert.strictEqual(created.length, 1);
    assert.strictEqual(created[0].whisper, undefined, "всем");
    assert(created[0].content.includes("<strong>Скрытность (Пр), группа общих навыков</strong>"));
    assert(created[0].content.includes("<table class=\"homerule-library-table\">"), "текст целиком, с таблицей");
});

await ftest("подложенная кнопка к тексту приключения ничего не выкладывает; сообщения без справки не трогаем", async () => {
    lreset();
    const root = libraryRoot(3);
    hooks.on.renderChatMessageHTML.forEach(f => f(libMessage(), root));
    root.children[2].click(); await flush();
    assert.strictEqual(created.length, 0);
    const other = el("div");
    hooks.on.renderChatMessageHTML.forEach(f => f({ flags: {} }, other));
    assert.strictEqual(other.dataset.homeruleLibrary, undefined);
});

// ================= Команды справки по типам и подсказка _chatcommands =================
const hitOf = (name, type, score) => ({ rank: 1, type, name, source: "Книга", pages: "1", section_path: "", metadata: { language: "ru" }, text: name, rerank_score: score });

await ftest("/существо: два запроса (bestiary и creature), выдача склеена по оценке, заголовок с типом", async () => {
    lreset();
    fetchImpl = async url => url.includes("type=bestiary")
        ? okJson({ hits: [hitOf("Огр", "bestiary", 0.9), hitOf("Огр-вожак", "bestiary", 0.4)] })
        : okJson({ hits: [hitOf("Огр-мясник", "creature", 0.7), hitOf("Гноблар", "creature", 0.2)] });
    assert.strictEqual(chat("/существо огр"), false);
    await flush(); await flush(); await flush();
    assert.deepStrictEqual(fetchCalls.map(c => c.url.split("&type=")[1]).sort(), ["bestiary", "creature"]);
    assert(fetchCalls.every(c => c.url.includes("q=" + encodeURIComponent("огр")) && c.url.includes("top_k=3")));
    const msg = created[0];
    assert.deepStrictEqual(msg.flags["wfrp4e-homerules"].library.hits.map(h => h.name), ["Огр", "Огр-мясник", "Огр-вожак"]);
    assert.strictEqual(msg.flags["wfrp4e-homerules"].library.kind, "бестиарий");
    assert(msg.content.includes('<div class="test-title">Библиотека · бестиарий: «огр»</div>'), msg.content.slice(0, 200));
    assert(notes.some(n => n === "Ищу в библиотеке (бестиарий): огр"));
});

await ftest("/заклинание и /карьера — один запрос со своим типом; /правило — без типа", async () => {
    lreset();
    chat("/заклинание огненный шар"); await flush(); await flush();
    chat("<p>/карьера охотник&nbsp;на ведьм</p>"); await flush(); await flush();
    chat("/правило скрытность"); await flush(); await flush();
    chat("/ТРАВМА перелом руки"); await flush(); await flush();
    assert.deepStrictEqual(fetchCalls.map(c => c.url.includes("&type=") ? c.url.split("&type=")[1] : "—"), ["spell", "career", "—", "wound"]);
    assert(decodeURIComponent(fetchCalls[1].url).includes("q=охотник на ведьм"));
    assert(created[0].content.includes("Библиотека · заклинания: «огненный шар»"));
    assert(created[2].content.includes('<div class="test-title">Библиотека: «скрытность»</div>'));
});

await ftest("пустой запрос у команды по типу — подсказка с её примером", () => {
    lreset();
    assert.strictEqual(chat("/травма"), false);
    assert.strictEqual(chat("<p>/существо</p>"), false);
    assert.strictEqual(fetchCalls.length, 0);
    assert.deepStrictEqual(notes, ["Что искать? Например: /травма перелом руки", "Что искать? Например: /существо огр"]);
});

await ftest("один из двух запросов с ошибкой — предупреждение, карточки нет", async () => {
    lreset();
    fetchImpl = async url => url.includes("type=creature") ? ({ ok: false, status: 503, json: async () => ({}) }) : okJson({ hits: [hitOf("Огр", "bestiary", 0.9)] });
    chat("/существо огр"); await flush(); await flush(); await flush();
    assert(notes.some(n => n.includes("загружает модели")));
    assert.strictEqual(created.length, 0);
});

await ftest("похожие, но чужие команды не трогаем", () => {
    lreset();
    for (const m of ["/заклинания огонь", "/существа огр", "/cond оглушён", "/spell x", "/травмы"]) {
        assert.strictEqual(chat(m), undefined, m);
    }
});

function fakeRegistry() { return { registered: [], register(c) { this.registered.push(c); } }; }

await ftest("_chatcommands: ведущему регистрируются пять команд с описанием, /rule — синоним /правило", async () => {
    lreset();
    const reg = fakeRegistry();
    hooks.once.chatCommandsReady.forEach(f => f(reg));
    assert.deepStrictEqual(reg.registered.map(c => c.name), ["/правило", "/заклинание", "/существо", "/травма", "/карьера"]);
    assert.deepStrictEqual([...reg.registered[0].aliases], ["/rule"]);
    assert(reg.registered.slice(1).every(c => c.aliases.length === 0));
    assert(reg.registered.every(c => c.module === "wfrp4e-homerules" && c.icon.includes("fa-book") && c.requiredRole === "NONE"));
    assert.strictEqual(reg.registered[2].description, "поиск в бестиарии: /существо огр");
    const result = reg.registered[2].callback({}, "огр", {});
    assert.strictEqual(JSON.stringify(result), "{}", "пустой объект: сообщение не отправлять");
    await flush(); await flush();
    assert.strictEqual(fetchCalls.length, 2, "запасной путь тоже ищет");
});

await ftest("_chatcommands: игроку и при выключенной справке ничего не регистрируем; кривой реестр не роняет", () => {
    lreset();
    const reg = fakeRegistry();
    ctx.game.user.isGM = false;
    try { hooks.once.chatCommandsReady.forEach(f => f(reg)); } finally { ctx.game.user.isGM = true; }
    settingsVals.libraryLookup = false;
    hooks.once.chatCommandsReady.forEach(f => f(reg));
    settingsVals.libraryLookup = true;
    hooks.once.chatCommandsReady.forEach(f => f({}));
    hooks.once.chatCommandsReady.forEach(f => f(undefined));
    assert.strictEqual(reg.registered.length, 0);
});

await ftest("запасной путь при выключенной справке — сообщение, без запроса", () => {
    lreset();
    const reg = fakeRegistry();
    hooks.once.chatCommandsReady.forEach(f => f(reg));
    settingsVals.libraryLookup = false;
    reg.registered[0].callback({}, "скрытность", {});
    assert.strictEqual(fetchCalls.length, 0);
    assert(notes.includes("Справка из библиотеки выключена в настройках модуля."));
});

// ================= Поиск по снаряжению =================
function invRow(it, { container = false, qty } = {}) {
    const row = el("div", ["list-row", ...(container ? ["container-drop"] : [])], { uuid: it.uuid });
    const rc = el("div", ["row-content"]);
    const nm = el("div", ["list-name"]);
    const a = el("a", ["label"]); a.textContent = it.name;
    nm.append(a);
    if (qty) { const q = el("a", ["prevent-context"]); q.textContent = "(" + qty + ")"; nm.append(q); }
    rc.append(nm); row.append(rc);
    return row;
}
const invIcon = it => el("div", ["collapsed-icon"], { uuid: it.uuid, tooltip: it.name });
function collapsedRows(icons) { const d = el("div", ["collapsed-rows"]); d.append(...icons); return d; }
function packContents(level, children) {
    const lc = el("div", ["list-content"]);
    const cc = el("div", ["container-contents", "level-" + level]);
    cc.append(...children); lc.append(cc);
    return lc;
}
function invKit() {
    idc = 0;
    const I = n => item("trapping", n);
    const m = { gold: I("Золотая крона"), silver: I("Серебряный шиллинг"), sword: I("Меч"), dagger: I("Кинжал"),
        mail: I("Кольчуга"), helm: I("Шлем"), backpack: I("Рюкзак"), rope: I("Верёвка"), torch: I("Факел"),
        purse: I("Кошель"), ring: I("Кольцо"), dice: I("Игральные кости"), bag: I("Сумка"), bandage: I("Бинты"), herbs: I("Травы") };
    const actor = makeActor(Object.values(m));
    const root = el("div", ["wfrp4e", "actor", "sheet"]);
    const sec = el("section", ["tab"], { tab: "trappings" });
    const armour = el("div", ["sheet-list", "inventory", "armour"]);
    const armourContent = el("div", ["list-content"]);
    armourContent.append(collapsedRows([invIcon(m.mail), invIcon(m.helm)]));
    armour.append(el("div", ["list-header"]), armourContent);
    const cont = el("div", ["sheet-list", "inventory", "container"]);
    const contContent = el("div", ["list-content"]);
    contContent.append(
        invRow(m.backpack, { container: true }),
        packContents(1, [invRow(m.rope, { qty: 3 }), invRow(m.torch), invRow(m.purse, { container: true }), packContents(2, [invRow(m.ring), invRow(m.dice)])]),
        invRow(m.bag, { container: true }),
        packContents(1, [collapsedRows([invIcon(m.bandage), invIcon(m.herbs)])]));
    cont.append(el("div", ["list-header"]), contContent);
    sec.append(el("div", ["encumbrance"]), sheetList(["currency"], [invRow(m.gold), invRow(m.silver)]),
        sheetList(["inventory", "weapons"], [invRow(m.sword), invRow(m.dagger)]), armour, cont);
    root.append(sec);
    return { actor, root, m };
}
const isShown = node => { for (let n = node; n; n = n.parentElement) if (n.classList.contains("homerule-search-hidden")) return false; return true; };
function shownItems(root) {
    const sec = root.querySelector("section");
    return [...sec.querySelectorAll(".list-row"), ...sec.querySelectorAll(".collapsed-icon")]
        .filter(e => e.dataset.uuid && isShown(e))
        .map(e => e.classList.contains("collapsed-icon") ? e.dataset.tooltip + "°" : e.querySelector(".label")._text)
        .sort((a, b) => a.localeCompare(b, "ru"));
}
const listShown = (root, cls) => isShown(root.querySelector(".sheet-list." + cls));

await ftest("снаряжение: строка поиска наверху, «Поиск вещи», без ¶", () => {
    const { actor, root } = invKit();
    render({ document: actor }, root); render({ document: actor }, root);
    const sec = root.querySelector("section");
    assert(sec.children[0].classList.contains("homerule-search"));
    assert.strictEqual(sec.children[0].dataset.kind, "inventory");
    assert.strictEqual(sec.querySelectorAll(".homerule-search").length, 1);
    assert.strictEqual(sec.querySelector(".homerule-search input").placeholder, "Поиск вещи");
    assert.strictEqual(sec.querySelector(".homerule-search-text"), null);
    assert.strictEqual(shownItems(root).length, 15, "без запроса видно всё");
});

await ftest("вещь во вложенной сумке: видны обе сумки над ней, соседи спрятаны, пустые списки спрятаны", () => {
    const { actor, root } = invKit();
    render({ document: actor }, root);
    typeInto(root.querySelector(".homerule-search input"), "игральн");
    assert.deepStrictEqual(shownItems(root), ["Игральные кости", "Кошель", "Рюкзак"]);
    assert(!listShown(root, "weapons") && !listShown(root, "currency") && !listShown(root, "armour"), "списки без совпадений спрятаны");
    assert(listShown(root, "container"));
    // Нечёткость как везде: в пяти буквах прощается одна опечатка, «кольч» от «кольц» — одна буква.
    typeInto(root.querySelector(".homerule-search input"), "кольц");
    assert.deepStrictEqual(shownItems(root), ["Кольцо", "Кольчуга°", "Кошель", "Рюкзак"]);
});

await ftest("совпала сама сумка — видно всё её содержимое, включая вложенную сумку", () => {
    const { actor, root } = invKit();
    render({ document: actor }, root);
    typeInto(root.querySelector(".homerule-search input"), "рюкзак");
    assert.deepStrictEqual(shownItems(root), ["Верёвка", "Игральные кости", "Кольцо", "Кошель", "Рюкзак", "Факел"]);
    typeInto(root.querySelector(".homerule-search input"), "кошель");
    assert.deepStrictEqual(shownItems(root), ["Игральные кости", "Кольцо", "Кошель", "Рюкзак"], "видна и внешняя сумка");
});

await ftest("свёрнутая сумка и свёрнутая категория: фильтруются иконки", () => {
    const { actor, root } = invKit();
    render({ document: actor }, root);
    typeInto(root.querySelector(".homerule-search input"), "бинт");
    assert.deepStrictEqual(shownItems(root), ["Бинты°", "Сумка"]);
    typeInto(root.querySelector(".homerule-search input"), "кольчуг");
    assert.deepStrictEqual(shownItems(root), ["Кольчуга°"]);
    assert(listShown(root, "armour") && !listShown(root, "container"));
});

await ftest("деньги, нечёткость и раскладка; количество «(3)» в поиск не идёт; очистка возвращает всё", () => {
    const { actor, root } = invKit();
    render({ document: actor }, root);
    const i = root.querySelector(".homerule-search input");
    typeInto(i, "золот");
    assert.deepStrictEqual(shownItems(root), ["Золотая крона"]);
    typeInto(i, "кинжла");
    assert.deepStrictEqual(shownItems(root), ["Кинжал"], "перестановка букв");
    typeInto(i, "vtx");
    assert.deepStrictEqual(shownItems(root), ["Меч"], "латиница в русской раскладке");
    typeInto(i, "3");
    assert.deepStrictEqual(shownItems(root), [], "число из «(3)» не ищется");
    typeInto(i, "");
    assert.strictEqual(shownItems(root).length, 15);
    assert(root.querySelector("section").querySelectorAll(".homerule-search-hidden").length === 0, "все пометки сняты");
});

await ftest("свой запрос у снаряжения, перерисовка его сохраняет; выключенная настройка — без строки", () => {
    const { actor, root } = invKit();
    const app = { document: actor };
    render(app, root);
    typeInto(root.querySelector(".homerule-search input"), "факел");
    const again = invKit();
    render(app, again.root);
    assert.deepStrictEqual(shownItems(again.root), ["Рюкзак", "Факел"]);
    settingsVals.sheetSearch = false;
    const off = invKit();
    render({ document: off.actor }, off.root);
    assert.strictEqual(off.root.querySelector(".homerule-search"), null);
    assert.strictEqual(shownItems(off.root).length, 15);
});

await ftest("вещь без предмета в актёре ищется по подписи и подсказке", () => {
    const { root } = invKit();
    const empty = makeActor([]);
    render({ document: empty }, root);
    typeInto(root.querySelector(".homerule-search input"), "травы");
    assert.deepStrictEqual(shownItems(root), ["Сумка", "Травы°"]);
});

// ================= Разрубающее и черта «Броня» =================
const setFlagCalls = [];
const uuidRegistry = {};
ctx.fromUuidSync = uuid => uuidRegistry[uuid] ?? null;
ctx.ChatMessage.getSpeaker = ({ actor } = {}) => ({ alias: actor?.name });
ctx.game.wfrp4e.config.locations = { head: "Голова", body: "Корпус" };
ctx.game.messages = { contents: [] };
const renderMsg = (message, root) => { hooks.on.renderChatMessageHTML.forEach(f => f(message, root)); hooks.on.renderChatMessage.forEach(f => f(message, root)); };

function hackKit({ physical = false, damage = null, spec = "2", otherTrait = false, onlyOther = false, owner = true } = {}) {
    const trait = {
        type: "trait", name: "Броня (шкура)", uuid: "Actor.C1.Item.T1", system: { specification: { value: spec } },
        flags: damage ? { wfrp4e: { APdamage: structuredClone(damage) } } : {},
        getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
        async setFlag(scope, key, val) { (this.flags[scope] ||= {})[key] = structuredClone(val); setFlagCalls.push([scope, key, structuredClone(val)]); }
    };
    const effect = { parent: trait, system: { scriptData: [{ script: "[Script.Vb7rgl8T4VRswbnZ]", trigger: "APCalc" }] } };
    const layers = [];
    if (!onlyOther) layers.push({ source: effect, value: Math.max(0, parseInt(spec) - (Number(damage?.head) || 0)) });
    if (otherTrait || onlyOther) layers.push({ source: { parent: { type: "trait", name: "Щитоносец" }, system: { scriptData: [{ script: "[Script.S6tUyFJvGMV19mvP]" }] } }, value: 2 });
    if (physical) layers.push({ source: { type: "armour", name: "Кольчуга" }, value: 2 });
    const defender = { name: "Огр", isOwner: owner, armour: { head: { layers } }, physicalNonDamagedArmourAtLocation: () => physical ? [{ name: "Кольчуга" }] : [] };
    trait.parent = defender;
    uuidRegistry[trait.uuid] = trait;
    const message = { id: "M1", flags: {}, system: { opposedTest: { result: { hitloc: { value: "head" } }, defenderTest: { actor: defender }, attackerTest: { actor: { name: "Ирма" } } } } };
    const root = el("div"); const content = el("div", ["message-content"]);
    const btn = el("button", [], { action: "applyHack" }); btn.textContent = "Применить Разрубающее";
    content.append(btn); root.append(content);
    return { trait, defender, message, root, btn, content };
}
const ours = root => root.querySelectorAll("button.homerule-hack-trait");
function hreset() { lreset(); setFlagCalls.length = 0; ctx.game.messages.contents = []; settingsVals.hackArmourTrait = true; settingsVals.critTraitDeflect = true; settingsVals.armourTraitSheet = true; }

await ftest("Разрубающее: без кнопки системы, без прав, без черты, при выключенном правиле — ничего не меняем", () => {
    hreset();
    const a = hackKit(); a.btn.remove(); renderMsg(a.message, a.root);
    assert.strictEqual(ours(a.root).length, 0);
    const b = hackKit({ owner: false }); renderMsg(b.message, b.root);
    assert.strictEqual(ours(b.root).length, 0);
    assert.notStrictEqual(b.btn.style.display, "none");
    const c = hackKit({ onlyOther: true }); renderMsg(c.message, c.root);
    assert.strictEqual(ours(c.root).length, 0, "чужой скрипт брони — не черта «Броня»");
    settingsVals.hackArmourTrait = false;
    const d = hackKit(); renderMsg(d.message, d.root);
    assert.strictEqual(ours(d.root).length, 0);
    assert.notStrictEqual(d.btn.style.display, "none");
});

await ftest("только черта: системная кнопка спрятана, своя — с названием черты и зоной; привязка одна", () => {
    hreset();
    const k = hackKit(); renderMsg(k.message, k.root);
    assert.strictEqual(k.btn.style.display, "none");
    const b = ours(k.root);
    assert.strictEqual(b.length, 1);
    assert.strictEqual(b[0].textContent, "Применить Разрубающее к черте «Броня (шкура)» (Голова)");
    assert.strictEqual(b[0].disabled, false);
    assert.strictEqual(k.content.children[1], b[0], "сразу после системной кнопки");
});

await ftest("доспехи и черта: обе кнопки, выбор за ведущим; чужая черта-броня рядом не мешает", () => {
    hreset();
    const k = hackKit({ physical: true, otherTrait: true }); renderMsg(k.message, k.root);
    assert.notStrictEqual(k.btn.style.display, "none");
    assert.strictEqual(ours(k.root).length, 1);
});

await ftest("щелчок: флаг APdamage на зоне +1, карточка от атакующего с остатком, кнопка гаснет", async () => {
    hreset();
    const k = hackKit({ damage: { body: 1 } }); renderMsg(k.message, k.root);
    const b = ours(k.root)[0];
    b.click(); await flush(); await flush();
    assert.deepStrictEqual(setFlagCalls, [["wfrp4e", "APdamage", { body: 1, head: 1 }]], "другие зоны не трогаем");
    assert.strictEqual(b.disabled, true);
    const card = created[0];
    assert.strictEqual(card.speaker.alias, "Ирма");
    assert(card.content.includes("черта «Броня (шкура)» у Огр, голова — класс брони −1, осталось 1."), card.content);
    assert.deepStrictEqual({ ...card.flags["wfrp4e-homerules"].hack }, { sourceMessage: "M1", traitUuid: "Actor.C1.Item.T1", loc: "head" });
});

await ftest("уже применено к этому сообщению — кнопка погашена, повторный щелчок не пишет", async () => {
    hreset();
    ctx.game.messages.contents = [{ flags: { "wfrp4e-homerules": { hack: { sourceMessage: "M1", traitUuid: "Actor.C1.Item.T1", loc: "head" } } } }];
    const k = hackKit(); renderMsg(k.message, k.root);
    const b = ours(k.root)[0];
    assert.strictEqual(b.disabled, true);
    assert(b.textContent.includes("уже применено"));
    b.listeners.click.forEach(f => f({ preventDefault() {}, stopPropagation() {} })); await flush();
    assert.strictEqual(setFlagCalls.length, 0);
    assert(notes.some(n => n.includes("уже применено")));
});

await ftest("черта на зоне пробита до нуля — кнопки нет; флаг вне лада с классом — предупреждение без записи", async () => {
    hreset();
    const k = hackKit({ damage: { head: 2 } }); renderMsg(k.message, k.root);
    assert.strictEqual(ours(k.root).length, 0);
    const m = hackKit({ spec: "3" }); renderMsg(m.message, m.root);
    m.trait.flags = { wfrp4e: { APdamage: { head: 3 } } };
    ours(m.root)[0].click(); await flush();
    assert.strictEqual(setFlagCalls.length, 0);
    assert(notes.some(n => n.includes("уже не защищает")));
});

await ftest("«Отменить» под карточкой: флаг −1, карточка помечена отменённой; отменённая не гасит кнопку", async () => {
    hreset();
    const k = hackKit({ damage: { head: 1 } });
    const card = { id: "C1", isOwner: true, flags: { "wfrp4e-homerules": { hack: { sourceMessage: "M1", traitUuid: k.trait.uuid, loc: "head" } } },
        async setFlag(scope, key, val) { this.flags[scope][key] = structuredClone(val); } };
    const root = el("div"); const content = el("div", ["message-content"]); root.append(content);
    renderMsg(card, root);
    const undo = root.querySelectorAll("a.homerule-hack-undo");
    assert.strictEqual(undo.length, 1);
    undo[0].click(); await flush(); await flush();
    assert.deepStrictEqual(setFlagCalls.at(-1), ["wfrp4e", "APdamage", { head: 0 }]);
    assert.strictEqual(card.flags["wfrp4e-homerules"].hack.undone, true);
    const root2 = el("div"); root2.append(el("div", ["message-content"]));
    renderMsg(card, root2);
    assert.strictEqual(root2.querySelectorAll("a.homerule-hack-undo").length, 0);
    assert.strictEqual(root2.querySelectorAll("p.homerule-hack-undone").length, 1, "заметка одна");
    ctx.game.messages.contents = [card];
    const k2 = hackKit(); renderMsg(k2.message, k2.root);
    assert.strictEqual(ours(k2.root)[0].disabled, false, "отменённое не считается применённым");
});

await ftest("«Отменить» не показываем без прав на существо; сломанные данные сообщения не роняют", () => {
    hreset();
    const k = hackKit({ owner: false });
    const card = { id: "C2", isOwner: true, flags: { "wfrp4e-homerules": { hack: { sourceMessage: "M1", traitUuid: k.trait.uuid, loc: "head" } } } };
    const root = el("div"); root.append(el("div", ["message-content"]));
    renderMsg(card, root);
    assert.strictEqual(root.querySelectorAll("a.homerule-hack-undo").length, 0);
    const broken = hackKit();
    Object.defineProperty(broken.message.system, "opposedTest", { get() { throw new Error("бум"); } });
    errors.length = 0;
    renderMsg(broken.message, broken.root);
    assert.strictEqual(errors.length, 1);
    assert(String(errors[0][0]).includes("Разрубающего"));
    errors.length = 0;
});

// ================= Черта «Броня»: отвод травмы и строка на листе =================
function critKit({ critical = "Критическое попадание", physical = false, homebrewLink = false, owner = true, damage = null, second = false } = {}) {
    const k = hackKit({ physical, damage, owner });
    const targets = [k.defender];
    if (second) {
        const k2 = hackKit({ owner: true });
        k2.trait.uuid = "Actor.C2.Item.T2"; uuidRegistry[k2.trait.uuid] = k2.trait; k2.defender.name = "Тролль";
        targets.push(k2.defender);
    }
    const message = { id: "T1", flags: {}, system: { test: { isCritical: critical, hitloc: { result: "head" }, targets } } };
    const root = el("div"); const desc = el("div", ["description"]);
    const crit = el("a", ["table-click", "action-link", "critical-roll"], { action: "clickTable", table: "crithead" }); crit.textContent = "Критическое попадание";
    desc.append(crit);
    let sys = null;
    if (physical || homebrewLink) { sys = el("a", ["action-link"], { action: "applyCriticalDeflection" }); sys.textContent = "Отвести травму бронёй"; desc.append(sys); }
    root.append(desc);
    return { ...k, message, root, crit, sys, desc };
}
const critLinks = root => root.querySelectorAll("a.homerule-crit-trait");

await ftest("отвод травмы чертой: без крита, без ссылки травмы, без прав, без черты, при выключенном правиле — ничего", () => {
    hreset();
    const a = critKit({ critical: false }); renderMsg(a.message, a.root); assert.strictEqual(critLinks(a.root).length, 0);
    const b = critKit(); b.crit.remove(); renderMsg(b.message, b.root); assert.strictEqual(critLinks(b.root).length, 0);
    const c = critKit({ owner: false }); renderMsg(c.message, c.root); assert.strictEqual(critLinks(c.root).length, 0);
    settingsVals.critTraitDeflect = false;
    const d = critKit(); renderMsg(d.message, d.root); assert.strictEqual(critLinks(d.root).length, 0);
    settingsVals.critTraitDeflect = true;
    const e = critKit(); e.defender.armour.head.layers = []; renderMsg(e.message, e.root); assert.strictEqual(critLinks(e.root).length, 0);
});

await ftest("только черта: ссылка сразу после травмы; привязка одна на два имени хука", () => {
    hreset();
    const k = critKit(); renderMsg(k.message, k.root);
    const l = critLinks(k.root);
    assert.strictEqual(l.length, 1);
    assert.strictEqual(l[0].textContent, "Отвести травму за счёт черты «Броня (шкура)»");
    assert.strictEqual(k.desc.children[1].tagName, "BR");
    assert.strictEqual(k.desc.children[2], l[0]);
});

await ftest("системная ссылка отвода: при домашнем правиле без доспехов прячется, при доспехе видна и наша встаёт за ней", () => {
    hreset();
    const a = critKit({ homebrewLink: true }); renderMsg(a.message, a.root);
    assert.strictEqual(a.sys.style.display, "none");
    assert.strictEqual(a.desc.children.indexOf(critLinks(a.root)[0]), a.desc.children.indexOf(a.crit) + 2, "наша — за травмой, не за спрятанной");
    const b = critKit({ physical: true }); renderMsg(b.message, b.root);
    assert.notStrictEqual(b.sys.style.display, "none");
    assert.strictEqual(b.desc.children.indexOf(critLinks(b.root)[0]), b.desc.children.indexOf(b.sys) + 2);
});

await ftest("щелчок: черта на зоне −1, травма зачёркнута, карточка «Травма отведена» с видом crit; второй щелчок не пишет", async () => {
    hreset();
    const k = critKit(); renderMsg(k.message, k.root);
    const l = critLinks(k.root)[0];
    l.click(); await flush(); await flush();
    assert.deepStrictEqual(setFlagCalls, [["wfrp4e", "APdamage", { head: 1 }]]);
    assert(k.crit.classList.contains("nulled") && l.classList.contains("nulled"));
    const card = created[0];
    assert.strictEqual(card.speaker.alias, "Огр");
    assert(card.content.includes("<strong>Травма отведена</strong>: черта «Броня (шкура)» у Огр, голова — класс брони −1, осталось 1."), card.content);
    assert(card.content.includes("Урон засчитывается полностью, дополнительные эффекты травмы не наступают."));
    assert.deepStrictEqual({ ...card.flags["wfrp4e-homerules"].hack }, { kind: "crit", sourceMessage: "T1", traitUuid: "Actor.C1.Item.T1", loc: "head" });
    l.click(); await flush();
    assert.strictEqual(setFlagCalls.length, 1);
});

await ftest("уже отведено: травма зачёркнута, ссылка «Травма отведена» без действия; карточка Разрубающего отводом не считается", () => {
    hreset();
    ctx.game.messages.contents = [{ flags: { "wfrp4e-homerules": { hack: { kind: "crit", sourceMessage: "T1", traitUuid: "Actor.C1.Item.T1", loc: "head" } } } }];
    const k = critKit(); renderMsg(k.message, k.root);
    const l = critLinks(k.root)[0];
    assert(k.crit.classList.contains("nulled"));
    assert.strictEqual(l.textContent, "Травма отведена чертой «Броня (шкура)»");
    assert(!l.listeners.click);
    ctx.game.messages.contents = [{ flags: { "wfrp4e-homerules": { hack: { sourceMessage: "T1", traitUuid: "Actor.C1.Item.T1", loc: "head" } } } }];
    const m = critKit(); renderMsg(m.message, m.root);
    assert(!m.crit.classList.contains("nulled"), "Разрубающее — не отвод");
    assert.strictEqual(critLinks(m.root)[0].textContent, "Отвести травму за счёт черты «Броня (шкура)»");
});

await ftest("пробитая до нуля черта отвода не даёт; несколько целей — ссылки с именами", () => {
    hreset();
    const a = critKit({ damage: { head: 2 } }); renderMsg(a.message, a.root);
    assert.strictEqual(critLinks(a.root).length, 0);
    const b = critKit({ second: true }); renderMsg(b.message, b.root);
    assert.deepStrictEqual(critLinks(b.root).map(l => l.textContent), ["Отвести травму за счёт черты «Броня (шкура)» — Огр", "Отвести травму за счёт черты «Броня (шкура)» — Тролль"]);
});

await ftest("«Отменить» под карточкой отвода: пункт возвращается, карточка отменена", async () => {
    hreset();
    const k = critKit({ damage: { head: 1 } });
    const card = { id: "C9", isOwner: true, flags: { "wfrp4e-homerules": { hack: { kind: "crit", sourceMessage: "T1", traitUuid: k.trait.uuid, loc: "head" } } },
        async setFlag(scope, key, val) { this.flags[scope][key] = structuredClone(val); } };
    const root = el("div"); root.append(el("div", ["message-content"]));
    renderMsg(card, root);
    const undo = root.querySelectorAll("a.homerule-hack-undo");
    assert.strictEqual(undo.length, 1);
    undo[0].click(); await flush(); await flush();
    assert.deepStrictEqual(setFlagCalls.at(-1), ["wfrp4e", "APdamage", { head: 0 }]);
    assert.strictEqual(card.flags["wfrp4e-homerules"].hack.undone, true);
    assert.strictEqual(card.flags["wfrp4e-homerules"].hack.kind, "crit");
});

// ---------- строка черты на листе ----------
const LOC_LABELS = { head: "Голова", body: "Корпус", lArm: "Левая рука", rArm: "Правая рука", lLeg: "Левая нога", rLeg: "Правая нога" };
function sheetKit({ damage = {}, spec = "2", labels = LOC_LABELS } = {}) {
    const trait = {
        type: "trait", name: "Броня (шкура)", img: "icons/hide.webp", uuid: "Actor.S1.Item.T1", system: { specification: { value: spec } },
        flags: { wfrp4e: { APdamage: structuredClone(damage) } },
        getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
        async setFlag(scope, key, val) { (this.flags[scope] ||= {})[key] = structuredClone(val); setFlagCalls.push([scope, key, structuredClone(val)]); }
    };
    const effect = { parent: trait, system: { scriptData: [{ script: "[Script.Vb7rgl8T4VRswbnZ]" }] } };
    const armour = {};
    for (const loc of Object.keys(LOC_LABELS)) armour[loc] = { label: LOC_LABELS[loc], layers: [{ source: effect, value: Math.max(0, parseInt(spec) - (damage[loc] || 0)) }] };
    const actor = { name: "Огр", isOwner: true, armour, items: { get: () => null } };
    trait.parent = actor;
    const root = el("div", ["wfrp4e", "actor", "sheet"]);
    const sec = el("section", ["tab"], { tab: "combat" });
    const armourSection = el("div", ["armour-section"]);
    const order = Object.keys(LOC_LABELS);
    for (let r = 0; r < 3; r++) {
        const row = el("div", ["flexrow"]);
        for (const loc of order.slice(r * 2, r * 2 + 2)) {
            const list = el("div", ["sheet-list"]);
            const header = el("div", ["list-header", "row-content"]);
            const lab = el("span", ["flex", "location-label"]); lab.textContent = labels[loc];
            header.append(lab);
            const content = el("div", ["list-content", "weapon-list"]);
            const item = el("div", ["list-row"], { uuid: "Actor.S1.Item.A" + loc }); item.append(el("div", ["row-content"]));
            content.append(item);
            list.append(header, content);
            row.append(list);
        }
        armourSection.append(row);
    }
    sec.append(armourSection); root.append(sec);
    return { trait, actor, root, lists: armourSection.querySelectorAll(".sheet-list") };
}
const traitRow = list => list.querySelector(".list-content").children.find(c => c.classList.contains("homerule-trait-armour"));
const apOf = list => traitRow(list)?.querySelector("a.ap-value");
function click(elm, type, ctrl = false) { const ev = { ctrlKey: ctrl, preventDefault() {}, stopPropagation() {} }; (elm.listeners[type] || []).forEach(f => f(ev)); }

await ftest("лист: строка черты первой в каждой из шести зон, класс с учётом повреждения, пробитая до нуля — тоже видна", () => {
    hreset();
    const k = sheetKit({ damage: { head: 1, body: 2 } });
    render({ document: k.actor, isEditable: true }, k.root);
    assert.strictEqual(k.lists.filter(l => traitRow(l)).length, 6);
    assert(k.lists.every(l => l.querySelector(".list-content").children[0] === traitRow(l)), "черта — первой, над доспехами");
    assert.strictEqual(traitRow(k.lists[0]).querySelector(".label").textContent, "Броня (шкура)");
    assert.strictEqual(apOf(k.lists[0]).textContent, "1");
    assert(apOf(k.lists[0]).classList.contains("item-damaged"));
    assert.strictEqual(apOf(k.lists[1]).textContent, "0", "пробитая до нуля осталась в списке — её можно починить");
    assert.strictEqual(apOf(k.lists[2]).textContent, "2");
    assert(!apOf(k.lists[2]).classList.contains("item-damaged"));
    assert(apOf(k.lists[0]).dataset.tooltip.includes("левый щелчок — починить, правый — повредить"));
    const r = traitRow(k.lists[0]);
    assert(r.classList.contains("nocontext") && !r.dataset.uuid, "не цепляется ни меню, ни перетаскиванием");
});

await ftest("лист: левый щелчок чинит, правый портит, Ctrl — по 10 в пределах класса", async () => {
    hreset();
    const k = sheetKit({ damage: { head: 1 } });
    render({ document: k.actor, isEditable: true }, k.root);
    click(apOf(k.lists[0]), "click"); await flush();
    assert.deepStrictEqual(setFlagCalls.at(-1), ["wfrp4e", "APdamage", { head: 0 }]);
    click(apOf(k.lists[1]), "contextmenu"); await flush();
    assert.deepStrictEqual(setFlagCalls.at(-1), ["wfrp4e", "APdamage", { head: 0, body: 1 }]);
    click(apOf(k.lists[2]), "contextmenu", true); await flush();
    assert.deepStrictEqual(setFlagCalls.at(-1), ["wfrp4e", "APdamage", { head: 0, body: 1, lArm: 2 }], "Ctrl — но не больше класса черты");
    const n = setFlagCalls.length;
    click(apOf(k.lists[3]), "click"); await flush();
    assert.strictEqual(setFlagCalls.length, n, "чинить целое некуда — записи нет");
});

await ftest("лист: без права правки — строка без щелчков; повторная отрисовка не задваивает; зона по порядку, если подпись не узнана", () => {
    hreset();
    const k = sheetKit();
    render({ document: k.actor, isEditable: false }, k.root);
    assert(!apOf(k.lists[0]).listeners.click && !apOf(k.lists[0]).listeners.contextmenu);
    assert(!apOf(k.lists[0]).dataset.tooltip.includes("щелчок"));
    render({ document: k.actor, isEditable: false }, k.root);
    assert.strictEqual(k.lists[0].querySelector(".list-content").children.filter(c => c.classList.contains("homerule-trait-armour")).length, 1);
    const odd = sheetKit({ damage: { lLeg: 1 }, labels: { head: "?", body: "?", lArm: "?", rArm: "?", lLeg: "?", rLeg: "?" } });
    render({ document: odd.actor, isEditable: true }, odd.root);
    assert.strictEqual(apOf(odd.lists[4]).textContent, "1", "пятый блок — левая нога");
});

await ftest("лист: выключенная заплатка — строки нет; без блока брони и без черты — без ошибок", () => {
    hreset();
    settingsVals.armourTraitSheet = false;
    const k = sheetKit(); render({ document: k.actor, isEditable: true }, k.root);
    assert.strictEqual(k.lists.filter(l => traitRow(l)).length, 0);
    settingsVals.armourTraitSheet = true;
    const bare = el("div"); render({ document: k.actor, isEditable: true }, bare);
    const none = sheetKit(); for (const loc of Object.keys(none.actor.armour)) none.actor.armour[loc].layers = [];
    render({ document: none.actor, isEditable: true }, none.root);
    assert.strictEqual(none.lists.filter(l => traitRow(l)).length, 0);
    assert.strictEqual(errors.length, 0);
});

// ================= Сводка по партии =================
ctx.foundry.applications.api.ApplicationV2 = class {
    constructor(options = {}) { this.options = { ...this.constructor.DEFAULT_OPTIONS, ...options }; this.rendered = false; this.renders = 0; this.content = el("div"); }
    async render(opts) { this.renders++; const context = await this._prepareContext(opts); const result = await this._renderHTML(context, opts); this._replaceHTML(result, this.content, opts); this.rendered = true; return this; }
};
ctx.foundry.utils.debounce = fn => fn;
ctx.game.world = { title: "Приключения в Убершрайке" };
const pans = [], pings = [], sheetsOpened = [];
ctx.canvas = { tokens: { placeables: [] }, animatePan: p => pans.push(p), ping: p => pings.push(p) };

function cond(key, name, value = null, disabled = false) { return { isCondition: true, conditionId: key, name, conditionValue: value, disabled }; }
function pc(id, name, { wounds = [10, 12], fortune = 1, fate = 2, resolve = 1, resilience = 1, corruption = [0, 8], advantage = 0, conditions = [], type = "character", playerOwned = true, npc = false } = {}) {
    const status = { wounds: { value: wounds[0], max: wounds[1] }, corruption: { value: corruption[0], max: corruption[1] }, advantage: { value: advantage } };
    if (!npc) Object.assign(status, { fortune: { value: fortune }, fate: { value: fate }, resolve: { value: resolve }, resilience: { value: resilience } });
    return { id, name, type, img: "icons/" + id + ".webp", hasPlayerOwner: playerOwned, system: { status },
        effects: { contents: [...conditions, { isCondition: false, name: "Благословение" }] },
        sheet: { render: f => sheetsOpened.push([id, f]) } };
}
function setWorld(actors, users) {
    ctx.game.actors = { contents: actors, get: id => actors.find(a => a.id === id) };
    ctx.game.users = { contents: users };
}
const partyApp = () => vm.runInContext("partyApp", ctx);
function preset() { sheetsOpened.length = 0; pans.length = 0; pings.length = 0; notes.length = 0; settingsVals.partyOverview = true; ctx.game.user = { id: "GM1", isGM: true }; }

const viktor = pc("V", "Отто Браун", { wounds: [9, 14], fortune: 1, fate: 3, conditions: [cond("fatigued", "Утомление", 1)] });
const foratil = pc("F", "Эльриан", { wounds: [4, 15], fortune: 0, fate: 2, resolve: 0, resilience: 2, corruption: [5, 8], conditions: [cond("bleeding", "Истекает кровью", 2), cond("prone", "Сбит с ног"), cond("stunned", "Оглушён", 1, true)] });
const bruno = pc("B", "Гюнтер <Крамм>", { wounds: [17, 17], fortune: 3, fate: 2, advantage: 2 });
const extra = pc("X", "Пустой чарник", { playerOwned: false });

await ftest("партия: персонажи, назначенные игрокам, без ведущего и без повторов; нет назначенных — персонажи игроков", () => {
    preset();
    setWorld([viktor, foratil, bruno, extra], [
        { isGM: true, character: extra }, { isGM: false, character: viktor }, { isGM: false, character: foratil }, { isGM: false, character: viktor }, { isGM: false, character: null }]);
    assert.deepStrictEqual([...ctx.partyMembers().map(a => a.name)], ["Отто Браун", "Эльриан"]);
    setWorld([viktor, bruno, extra, pc("N", "Орк", { type: "npc" })], [{ isGM: false, character: null }]);
    assert.deepStrictEqual([...ctx.partyMembers().map(a => a.name)], ["Отто Браун", "Гюнтер <Крамм>"]);
});

await ftest("строка: здоровье, удача из судьбы (и сверх неё), решимость, порча, преимущество; у НПС удачи нет", () => {
    const f = ctx.partyRow(foratil);
    assert.deepStrictEqual({ ...f.wounds }, { value: 4, max: 15 });
    assert.deepStrictEqual({ ...f.fortune }, { value: 0, max: 2 });
    assert.deepStrictEqual({ ...f.resolve }, { value: 0, max: 2 });
    assert.deepStrictEqual({ ...f.corruption }, { value: 5, max: 8 });
    assert.deepStrictEqual({ ...ctx.partyRow(bruno).fortune }, { value: 3, max: 3 }, "удача сверх судьбы — кружков по удаче");
    assert.strictEqual(ctx.partyRow(bruno).advantage, 2);
    const npc = ctx.partyRow(pc("O", "Огр", { npc: true }));
    assert.strictEqual(npc.fortune, null);
    assert.strictEqual(npc.resolve, null);
    assert.deepStrictEqual([...f.conditions.map(c => [c.key, c.value, c.danger])], [["bleeding", 2, true], ["prone", null, false]], "выключенное состояние и не-состояние не показываем");
});

await ftest("разметка: цвет здоровья по доле, метки состояний с уровнем больше 1, кружки, экранирование, сортировка по ранам", () => {
    const rows = [viktor, foratil, bruno].map(ctx.partyRow);
    const html = ctx.partyHtml(rows, false);
    assert(html.includes('homerule-party-bar warning"><i style="width:64%"></i></div><span class="homerule-party-num">9 / 14</span>'), "9/14 — жёлтая");
    assert(html.includes('homerule-party-bar danger"><i style="width:27%"></i>'), "4/15 — красная");
    assert(html.includes('homerule-party-bar ok"><i style="width:100%"></i>'), "17/17 — зелёная");
    assert(html.includes('<span class="homerule-party-chip danger">Истекает кровью 2</span>'));
    assert(html.includes('<span class="homerule-party-chip">Сбит с ног</span>'));
    assert(html.includes('<span class="homerule-party-chip">Утомление</span>'), "уровень 1 не пишем");
    assert(!html.includes("Оглушён"));
    assert(html.includes("Гюнтер &lt;Крамм&gt;") && !html.includes("Гюнтер <Крамм>"));
    const viktorRow = html.split('data-actor-id="V"')[1].split('data-actor-id=')[0];
    assert.strictEqual(viktorRow.split('homerule-party-pip filled').length - 1 + viktorRow.split('homerule-party-pip"').length - 1, 3 + 1, "удача 1 из 3 и решимость 1 из 1");
    const order = s => ["V", "F", "B"].sort((a, b) => s.indexOf('data-actor-id="' + a + '"') - s.indexOf('data-actor-id="' + b + '"'));
    assert.deepStrictEqual(order(html), ["V", "F", "B"]);
    assert.deepStrictEqual(order(ctx.partyHtml(rows, true)), ["F", "V", "B"], "сначала раненые");
    assert(ctx.partyHtml([], false).includes("назначь их в настройках пользователей"));
});

await ftest("окно: заголовок с миром, панель с сортировкой, строки; переключатель сортировки перерисовывает", async () => {
    preset();
    setWorld([viktor, foratil, bruno], [{ isGM: false, character: viktor }, { isGM: false, character: foratil }, { isGM: false, character: bruno }]);
    await ctx.openPartyOverview();
    const app = partyApp();
    assert.strictEqual(app.title, "Партия · Приключения в Убершрайке");
    assert.strictEqual(app.options.id, "homerule-party-overview");
    const body = app.content.children[0];
    assert(body.classList.contains("homerule-party-body"));
    assert(body.innerHTML.includes("Сначала раненые") && body.innerHTML.includes('data-actor-id="F"'));
    await ctx.openPartyOverview();
    assert.strictEqual(partyApp(), app, "окно одно");
    const before = app.renders;
    app.constructor.onToggleSort.call(app); await flush();
    assert.strictEqual(app.sortByWounds, true);
    assert.strictEqual(app.renders, before + 1);
    assert(app.content.children[0].innerHTML.includes("Как в партии"));
    app.constructor.onToggleSort.call(app); await flush();
});

await ftest("кнопки строки: открыть лист; показать токен — панорама и отметка, без токена — сообщение", () => {
    preset();
    const app = partyApp();
    const target = id => ({ closest: () => ({ dataset: { actorId: id } }) });
    app.constructor.onOpenSheet.call(app, {}, target("F"));
    assert.deepStrictEqual(sheetsOpened, [["F", true]]);
    ctx.canvas.tokens.placeables = [{ actor: { id: "F" }, center: { x: 100, y: 200 } }];
    app.constructor.onPanToToken.call(app, {}, target("F"));
    assert.deepStrictEqual([pans.length, pings.length, pans[0].x], [1, 1, 100]);
    app.constructor.onPanToToken.call(app, {}, target("V"));
    assert.deepStrictEqual(notes, ["Токена этого персонажа на сцене нет."]);
    ctx.canvas.tokens.placeables = [];
});

await ftest("живое обновление: правка персонажа партии и его эффектов перерисовывает; чужой актёр и закрытое окно — нет", () => {
    preset();
    const app = partyApp();
    const n = app.renders;
    hooks.on.updateActor.forEach(f => f(foratil));
    assert.strictEqual(app.renders, n + 1);
    hooks.on.updateActor.forEach(f => f(extra));
    assert.strictEqual(app.renders, n + 1, "не из партии");
    hooks.on.createActiveEffect.forEach(f => f({ parent: { ...viktor, documentName: "Actor" } }));
    hooks.on.deleteActiveEffect.forEach(f => f({ parent: { documentName: "Item" } }));
    assert.strictEqual(app.renders, n + 2);
    app.rendered = false;
    hooks.on.updateActor.forEach(f => f(foratil));
    assert.strictEqual(app.renders, n + 2, "закрытое окно не рисуем");
    app.rendered = true;
});

await ftest("кнопка на панели токенов: ведущему в v13+ и в v11–12; игроку и при выключенной настройке — нет", () => {
    preset();
    const v13 = { tokens: { tools: {} }, notes: { tools: {} } };
    hooks.on.getSceneControlButtons.forEach(f => f(v13));
    const tool = v13.tokens.tools["homerule-party"];
    assert(tool && tool.button && tool.icon === "fas fa-users" && tool.title === "Сводка по партии");
    const v12 = [{ name: "token", tools: [] }, { name: "notes", tools: [] }];
    hooks.on.getSceneControlButtons.forEach(f => f(v12));
    assert(v12[0].tools.some(t => t.name === "homerule-party"));
    ctx.game.user.isGM = false;
    const asPlayer = { tokens: { tools: {} } };
    hooks.on.getSceneControlButtons.forEach(f => f(asPlayer));
    assert.strictEqual(asPlayer.tokens.tools["homerule-party"], undefined);
    ctx.game.user.isGM = true;
    settingsVals.partyOverview = false;
    const off = { tokens: { tools: {} } };
    hooks.on.getSceneControlButtons.forEach(f => f(off));
    assert.strictEqual(off.tokens.tools["homerule-party"], undefined);
    settingsVals.partyOverview = true;
});

await ftest("для макроса: api.openPartyOverview после ready", () => {
    const mod = { api: { other: 1 } };
    ctx.game.modules = { get: id => id === "wfrp4e-homerules" ? mod : undefined };
    ctx.game.socket = { on: () => {} };
    hooks.once.ready.forEach(f => f());
    assert.strictEqual(typeof mod.api.openPartyOverview, "function");
    assert.strictEqual(mod.api.other, 1, "чужое в api не затираем");
});

console.log(`прошло ${fpassed} сценариев папок, поиска, справки, черты «Броня» и сводки по партии`);
})().catch(e => { console.error("ПАДЕНИЕ:", e); process.exit(1); });
