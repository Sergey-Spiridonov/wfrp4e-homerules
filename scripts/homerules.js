/**
 * Домашние правила стола — WFRP 4e.
 *
 * Правило 1. Убийца чудовищ отводит травму за пункт удачи.
 *   Книжное: травму, полученную в зону, прикрытую бронёй, можно предотвратить,
 *   снизив класс брони на 1 (Книга правил, «Повреждение брони» → «Предотвращение
 *   травмы»). Убийце чудовищ клятва запрещает доспехи, поэтому за столом решено:
 *   он платит пунктом удачи. Урон засчитывается полностью, дополнительные
 *   эффекты травмы не наступают.
 *
 * Как устроено: система сама помечает ссылку на бросок травмы классом
 * `critical-roll` — и в карточке проверки (удачное попадание), и в строке
 * применённого урона внутри карточки встречной проверки. Модуль эту ссылку
 * находит, выясняет пострадавшего и дописывает рядом свою.
 *
 * Заплатка к системе 10.0.0: меню правой кнопки в чате (ниже, у своего хука).
 *
 * Удобство 3. Заклинания на вкладке «Магия»: свои папки, остальное по школам
 * (в конце файла). Правил не меняет, только порядок строк на листе.
 *
 * Удобство 4. Поиск на вкладках навыков, талантов и снаряжения (в разделе «Поиск»).
 *
 * Удобство 5. Справка в чате из своей службы поиска по правилам: `/правило …` (по желанию).
 *
 * Правило 6 (толкование стола). Разрубающее портит и черту «Броня»; черта «Броня»
 * отводит травму; порча и починка черты с листа.
 *
 * Удобство 7. Сводка по партии — окно ведущего (в конце файла).
 *
 * Удобство 8. Рывок из меню токена: проверка атлетики (+20), и линейка
 * перемещения сама прибавляет бег + уровень успеха до конца раунда.
 *
 * Предмет 9. Девятнадцатая длань Воланса: развеивание без языка (магического) —
 * силой воли.
 */

const MODULE = "wfrp4e-homerules";
const SETTING = "slayerDeflect";
const GUARD_SETTING = "guardChatMenu";
const LORE_SETTING = "spellsByLore";
const LORE_ORDER_SETTING = "spellsByLoreOrder";
const LORE_COLLAPSED_SETTING = "spellsByLoreCollapsed";
const LORE_ORDER_BASE_SETTING = "spellsByLoreOrderBase";
const LORE_SEARCH_TEXT_SETTING = "spellsByLoreSearchText";
const SEARCH_SETTING = "sheetSearch";
const LIBRARY_SETTING = "libraryLookup";
const LIBRARY_URL_SETTING = "libraryUrl";
const HACK_SETTING = "hackArmourTrait";
const TRAIT_SHEET_SETTING = "armourTraitSheet";
const CRIT_TRAIT_SETTING = "critTraitDeflect";
const SPRINT_SETTING = "sprintButton";
const PALM_SETTING = "volansPalm";
const SOCKET = "module.wfrp4e-homerules";

const LORE_ORDERS = {
    name: "По названию",
    cn: "По порогу сотворения, по возрастанию",
    cnDesc: "По порогу сотворения, по убыванию",
    sheet: "Как в листе"
};

/** Порядки, которые переключает щелчок по графе порога сотворения. */
const CN_ORDERS = ["cn", "cnDesc"];

/** Заголовок для заклинаний без школы. */
const NO_LORE = "Без школы";

/** Названия таланта, с которыми работает правило (русское из wfrp4e-core и английское). */
const TALENTS = ["убийца чудовищ", "slayer"];

Hooks.once("init", () =>
{
    game.settings.register(MODULE, SETTING, {
        name: "Убийца чудовищ: отвод травмы за пункт удачи",
        hint: "Домашнее правило, по умолчанию выключено. В карточке с травмой у персонажа с талантом «Убийца чудовищ» появляется ссылка: потратить пункт удачи и отвести травму так же, как это делает броня.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE, GUARD_SETTING, {
        name: "Заплатка: не ронять меню правой кнопки в чате",
        hint: "Нужно только на системе wfrp4e 10.0.0–10.0.2: там условие пунктов «Перевернуть/Вернуть» падало на проверках 4-й редакции, и меню правой кнопки в чате не открывалось вовсе. Пункт, чья проверка условия упала, прячется, остальное меню открывается. В 10.0.3 дефект починен.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE, HACK_SETTING, {
        name: "Разрубающее портит и черту «Броня»",
        hint: "Толкование стола: удар Разрубающим оружием снимает 1 пункт класса брони и с черты «Броня» (шкура, панцирь) на зоне попадания. Рядом с кнопкой системы «Применить Разрубающее» появляется кнопка по черте.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE, CRIT_TRAIT_SETTING, {
        name: "Черта «Броня» отводит травму",
        hint: "Толкование стола: при критическом попадании существо может снизить на 1 класс брони черты «Броня» на зоне и не получить травму — так же, как это делает надетая броня. В карточке атаки появляется ссылка по черте.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE, TRAIT_SHEET_SETTING, {
        name: "Заплатка: черта «Броня» на листе — порча и починка щелчком",
        hint: "В блоке брони по зонам на вкладке боя появляется строка черты «Броня»: левый щелчок по классу брони чинит, правый портит, как у доспехов. Так умел старый лист системы; в новом (с марта 2025) это пропало.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE, "partyOverview", {
        name: "Сводка по партии: кнопка ведущего",
        hint: "На панели инструментов токенов у ведущего — кнопка окна со здоровьем, удачей, решимостью, порчей, преимуществом и состояниями всех персонажей игроков. Окно обновляется само.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true
    });

    game.settings.register(MODULE, SPRINT_SETTING, {
        name: "Рывок: кнопка в меню токена",
        hint: "В меню токена (правый щелчок) появляется кнопка «Рывок»: проверка атлетики (+20), после которой линейка перемещения до конца раунда разрешает ещё бег + уровень успеха ярдов (Книга правил, «Рывок»).",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE, PALM_SETTING, {
        name: "Девятнадцатая длань Воланса: развеивание силой воли",
        hint: "Персонаж в надетой Длани развеивает заклинания кнопкой «Развеять» на карточке заклинания даже без навыка «Язык (магический)»: вместо него проходит проверку силы воли («Приключения в Убершрейке», «Подарок Сибиллы»).",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    // Раскладка заклинаний — вид листа, а не правило стола, поэтому настройки
    // клиентские: каждый игрок решает за себя. Сами папки лежат в актёре и общие.
    game.settings.register(MODULE, LORE_SETTING, {
        name: "Заклинания: папки и школы на листе",
        hint: "На вкладке «Магия» заклинания школ собираются в группы: сперва свои папки, остальное по школам. Щелчок по заголовку сворачивает группу. Выключено — лист как у системы, папки при этом не теряются.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: rerenderActorSheets
    });

    game.settings.register(MODULE, LORE_ORDER_SETTING, {
        name: "Заклинания: порядок внутри группы",
        hint: "Порядок внутри каждой папки и школы. «Как в листе» оставляет порядок системы: его задают перетаскиванием и кнопкой сортировки в заголовке списка. По порогу сотворения удобнее переключать щелчком по графе «ПС» в заголовке списка: по возрастанию, по убыванию, обратно. Простейшие заклинания упорядочиваются так же.",
        scope: "client",
        config: true,
        type: String,
        choices: LORE_ORDERS,
        default: "name",
        onChange: rerenderActorSheets
    });

    // Порядок, к которому щелчок по графе «ПС» вернёт после «по убыванию».
    game.settings.register(MODULE, LORE_ORDER_BASE_SETTING, {
        scope: "client",
        config: false,
        type: String,
        default: "name"
    });

    game.settings.register(MODULE, SEARCH_SETTING, {
        name: "Поиск на вкладках навыков, талантов и снаряжения",
        hint: "Строка поиска над списками навыков, над талантами и чертами и над снаряжением: начала слов в любом порядке, опечатки, латиница в русской раскладке. У талантов кнопка ¶ добавляет описание и графу «Тесты»; в снаряжении найденная вещь показывается вместе со своей сумкой. Настройка своя у каждого игрока.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: rerenderActorSheets
    });

    // Справка из библиотеки: демон живёт на машине ведущего, поэтому настройки клиентские.
    game.settings.register(MODULE, LIBRARY_SETTING, {
        name: "Справка: команда /правило",
        hint: "Для тех, у кого есть своя служба поиска по правилам (например, локальный поиск по своим книгам): «/правило скрытность» в чате спрашивает её и присылает найденное шёпотом тебе, с книгой и страницами. Без такой службы не включайте. Как она должна отвечать — в README модуля.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE, LIBRARY_URL_SETTING, {
        name: "Справка: адрес службы поиска",
        hint: "Адрес службы поиска: модуль зовёт GET <адрес>/search?q=…&top_k=3[&type=…] из браузера ведущего.",
        scope: "client",
        config: true,
        type: String,
        default: "http://127.0.0.1:8765"
    });

    // Кнопка ¶ у строки поиска: искать и в описании. Одна на все вкладки, запоминается.
    game.settings.register(MODULE, LORE_SEARCH_TEXT_SETTING, {
        scope: "client",
        config: false,
        type: Boolean,
        default: false
    });

    // Свёрнутые группы: {uuid актёра: [ключ школы или "folder:<id>"]}.
    game.settings.register(MODULE, LORE_COLLAPSED_SETTING, {
        scope: "client",
        config: false,
        type: Object,
        default: {}
    });
});

/**
 * Заплатка к системе 10.0.0.
 *
 * `canReverse`/`canUnreverse` в `src/hooks/entryContext.js` читают `test.testData`,
 * а этот геттер есть только у проверок 5-й редакции (`test-wfrp5e.js`); у проверок
 * 4-й его нет. На любой карточке проверки условие падает с
 * «Cannot read properties of undefined (reading 'unreverse')», Foundry собирает
 * пункты через `reduce`, и всё меню правой кнопки не открывается вовсе.
 *
 * Оборачиваем условие каждого пункта: упало — прячем этот пункт, остальное меню живёт.
 * Системные хуки регистрируются раньше модульных, так что к нашему вызову все пункты
 * уже на месте.
 */
Hooks.on("getChatMessageContextOptions", (html, options) =>
{
    if (!game.settings.get(MODULE, GUARD_SETTING))
    {
        return;
    }
    for (const option of options)
    {
        if (typeof option.condition !== "function" || option.condition.homeruleGuarded)
        {
            continue;
        }
        const original = option.condition;
        const guarded = function (li)
        {
            try
            {
                return original.call(this, li);
            }
            catch (e)
            {
                warnOnce(option.name, e);
                return false;
            }
        };
        guarded.homeruleGuarded = true;
        option.condition = guarded;
    }
});

const warnedOptions = new Set();

function warnOnce(label, error)
{
    if (warnedOptions.has(label))
    {
        return;
    }
    warnedOptions.add(label);
    console.warn(MODULE + ` | пункт меню «${label}» упал на проверке условия и скрыт:`, error);
}

Hooks.once("ready", () =>
{
    game.socket.on(SOCKET, onSocket);
});

Hooks.on("renderChatMessageHTML", onRenderChatMessage);
Hooks.on("renderChatMessage", onRenderChatMessage);

function onRenderChatMessage(message, element)
{
    try
    {
        if (!game.settings.get(MODULE, SETTING))
        {
            return;
        }
        const root = element instanceof HTMLElement ? element : element?.[0];
        if (!root || root.dataset.homeruleDeflect)
        {
            return; // хук в v13+ и v14 зовётся под двумя именами, привязываемся один раз
        }

        const links = root.querySelectorAll("a.critical-roll:not(.nulled)");
        if (!links.length)
        {
            return;
        }

        const candidates = victims(message).filter(actor =>
            (game.user.isGM || actor.isOwner) && isSlayer(actor));
        if (!candidates.length)
        {
            return;
        }

        root.dataset.homeruleDeflect = "1";
        const anchor = links[links.length - 1];
        const added = [];

        for (const actor of candidates)
        {
            if (alreadyDeflected(message.id, actor.uuid))
            {
                links.forEach(link => link.classList.add("nulled"));
                continue;
            }
            if (fortuneOf(actor) < 1)
            {
                continue;
            }
            added.push(document.createElement("br"), makeLink(message, actor, anchor, candidates.length > 1));
        }

        if (added.length)
        {
            anchor.after(...added);
        }
    }
    catch (e)
    {
        console.error(MODULE + " | не удалось разобрать карточку:", e);
    }
}

function makeLink(message, actor, critLink, withName)
{
    const link = document.createElement("a");
    link.className = "action-link homerule-deflect";
    link.dataset.actorUuid = actor.uuid;
    link.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Отвести травму (1 удача)'
        + (withName ? " — " + actor.name : "");
    link.addEventListener("click", event => deflect(event, message, actor, critLink));
    return link;
}

async function deflect(event, message, actor, critLink)
{
    event.preventDefault();
    event.stopPropagation();

    const link = event.currentTarget;
    if (link.dataset.spent)
    {
        return;
    }
    if (!actor.isOwner)
    {
        return ui.notifications.error(actor.name + ": нет прав на этого персонажа.");
    }

    const left = fortuneOf(actor);
    if (left < 1)
    {
        return ui.notifications.warn(actor.name + ": пунктов удачи не осталось.");
    }
    if (alreadyDeflected(message.id, actor.uuid))
    {
        return ui.notifications.warn("Эта травма уже отведена.");
    }

    const ok = await confirmDeflect(actor);
    if (!ok)
    {
        return;
    }

    link.dataset.spent = "1";
    link.classList.add("nulled");
    critLink?.classList.add("nulled");

    await actor.update({ "system.status.fortune.value": left - 1 });
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: "Убийца чудовищ — домашнее правило",
        flags: { [MODULE]: { sourceMessage: message.id, actorUuid: actor.uuid } },
        content: "<p><strong>" + actor.name + "</strong> отводит травму за пункт удачи.</p>"
            + "<p>Урон засчитывается полностью, дополнительные эффекты травмы не наступают.</p>"
            + "<p><em>Пунктов удачи осталось: " + (left - 1) + "</em></p>"
    });

    await requestInjuryRoll(actor, critLink);
}

/**
 * Бросок по таблице травм ради одного урона.
 *
 * По книге отвод снимает «дополнительные эффекты», а урон персонаж получает весь.
 * При включённом `uiaCrits` часть урона сидит в самой травме (графа «Урон» таблицы
 * «Up in Arms»), поэтому бросок всё равно нужен: берём из него только пункты
 * здоровья, а саму травму на лист не кладём — ни эффектов, ни счётчика травм.
 *
 * Таблицы травм у игроков закрыты (`ownership.default: 0`), так что бросок делает
 * клиент ведущего: сам — если жал он, иначе по сокету.
 */
async function requestInjuryRoll(actor, critLink)
{
    const table = critLink?.dataset.table;
    if (!table)
    {
        return;
    }
    const payload = {
        action: "deflectInjury",
        actorUuid: actor.uuid,
        table,
        modifier: parseInt(critLink.dataset.modifier) || 0,
        column: critLink.dataset.column || null
    };

    if (game.user.isGM)
    {
        return rollDeflectedInjury(actor, payload);
    }
    if (activeGM())
    {
        return game.socket.emit(SOCKET, payload);
    }
    ui.notifications.warn("Ведущего нет в сети: бросок по таблице травм за ним.");
}

function activeGM()
{
    return game.users?.activeGM ?? game.users?.find(user => user.isGM && user.active) ?? null;
}

async function onSocket(payload)
{
    if (payload?.action !== "deflectInjury" || !game.user.isGM)
    {
        return;
    }
    if (activeGM()?.id !== game.user.id)
    {
        return; // за столом может сидеть не один ведущий — бросает один
    }
    if (!String(payload.table || "").startsWith("crit"))
    {
        return;
    }
    const actor = await fromUuid(payload.actorUuid);
    if (!actor || actor.type !== "character" || !isSlayer(actor))
    {
        return;
    }
    await rollDeflectedInjury(actor, payload);
}

async function rollDeflectedInjury(actor, { table, modifier = 0, column = null })
{
    const tables = game.wfrp4e?.tables;
    if (!tables?.rollTable)
    {
        return;
    }

    // Ключ из ссылки собран как crit + зона попадания (critlLeg, critrArm…), а таблицы
    // в мире общие на обе руки и обе ноги. Приведение делает сама система, но в
    // `formatChatRoll`, а не в `rollTable`, — зовём отдельно, иначе «Таблица critlLeg не найдена».
    const key = tables.generalizeTable ? tables.generalizeTable(table) : table.toLowerCase();

    let result;
    try
    {
        result = await tables.rollTable(key, { modifier }, column);
    }
    catch (e)
    {
        console.error(MODULE + " | бросок по таблице травм не прошёл:", e);
        return ui.notifications.error("Бросок по таблице травм не прошёл — сделай его вручную.");
    }

    const item = result?.object?.documentUuid ? await fromUuid(result.object.documentUuid) : null;
    const name = item?.name || result?.text || result?.name || "—";
    const raw = item?.system?.wounds?.value;
    const wounds = Number.parseInt(raw);

    let line;
    if (Number.isInteger(wounds) && wounds > 0)
    {
        await actor.modifyWounds(-wounds);
        line = "Снято пунктов здоровья: <strong>" + wounds + "</strong>. Дополнительные эффекты отведены, травма на лист не кладётся.";
    }
    else
    {
        line = "Урона по графе травмы нет" + (raw ? " (там «" + raw + "»)" : "")
            + ". Дополнительные эффекты отведены, травма на лист не кладётся.";
    }

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: "Убийца чудовищ — домашнее правило",
        content: "<p>По таблице травм (бросок " + (result?.roll ?? "?") + "): <strong>" + name + "</strong>.</p><p>" + line + "</p>"
    });
}

async function confirmDeflect(actor)
{
    const content = "<p><strong>" + actor.name + "</strong> тратит 1 пункт удачи и отводит травму?</p>"
        + "<p>Урон засчитывается полностью, дополнительные эффекты травмы не наступают.</p>";
    try
    {
        const dialog = foundry.applications?.api?.DialogV2;
        if (dialog?.confirm)
        {
            return await dialog.confirm({
                window: { title: "Отвод травмы" },
                content,
                rejectClose: false
            });
        }
    }
    catch (e)
    {
        console.warn(MODULE + " | диалог не открылся, отвод выполнен без подтверждения:", e);
    }
    return true;
}

/** Пострадавший: защищающийся во встречной проверке, цель обычной проверки, иначе говорящий. */
function victims(message)
{
    const found = [];
    if (message.type === "opposed")
    {
        found.push(actorFromSpeaker(message.system?.opposedTestData?.defenderTestData?.context?.speaker));
    }
    else if (message.type === "test")
    {
        for (const target of message.system?.testData?.context?.targets ?? [])
        {
            found.push(actorFromSpeaker(target));
        }
    }
    else
    {
        found.push(actorFromSpeaker(message.speaker));
    }
    return found.filter(actor => actor?.type === "character");
}

function actorFromSpeaker(speaker)
{
    if (!speaker)
    {
        return null;
    }
    if (speaker.scene && speaker.token)
    {
        const token = game.scenes?.get(speaker.scene)?.tokens?.get(speaker.token);
        if (token?.actor)
        {
            return token.actor;
        }
    }
    return speaker.actor ? game.actors?.get(speaker.actor) ?? null : null;
}

function isSlayer(actor)
{
    return (actor?.itemTypes?.talent ?? []).some(talent =>
    {
        // Babele подменяет name переводом, исходное имя прячет во флаг — смотрим оба
        const names = [talent.name, talent.flags?.babele?.originalName];
        return names.some(name => name && TALENTS.includes(name.trim().toLowerCase()));
    });
}

function fortuneOf(actor)
{
    return actor?.system?.status?.fortune?.value ?? 0;
}

/** Отвод уже записан своей карточкой в чате — она и есть общий для всех признак. */
function alreadyDeflected(messageId, actorUuid)
{
    const recent = game.messages?.contents?.slice(-40) ?? [];
    return recent.some(msg =>
    {
        const flags = msg.flags?.[MODULE];
        return flags?.sourceMessage === messageId && flags?.actorUuid === actorUuid;
    });
}

/**
 * Удобство 3. Заклинания: свои папки и школы.
 *
 * Система делит заклинания на листе на две кучи: «Простейшие» и все остальные
 * (`standard-sheet.js`, `_prepareMagicContext`). У мага с несколькими школами
 * всё, кроме простейших, идёт одним списком вперемешку.
 *
 * После отрисовки листа переставляем строки второго списка: сперва папки,
 * которые завёл владелец листа, в его порядке; всё, что ни в одну папку не
 * положено, — по школам. Над каждой группой заголовок; щелчок сворачивает её.
 * Внутри группы — порядок из настройки; графа «ПС» в заголовке списка щелчком
 * переключает его на порог сотворения по возрастанию и убыванию. Над списками —
 * строка поиска по названию; у заголовка школы значок со свойством школы.
 * Строки остаются системными: их действия, меню и перетаскивание не трогаются,
 * меняется только порядок.
 *
 * Папки лежат во флаге актёра `spellFolders`: [{id, name, spells: [id предмета]}],
 * так что их видят все, кому виден лист, а правит владелец. Свёрнутость — в
 * клиентской настройке, у каждого своя.
 *
 * Школа заклинания — та же, по которой система берёт эффект школы
 * (`spell.js`, `getOtherEffects`): выбранная `lore.chosen`, иначе первая из
 * `lore.value`. С 10.0.0 `lore.value` — массив, но в базе мира записи не
 * переписаны и школа часто лежит строкой; понимаем обе формы.
 */
const FOLDERS_FLAG = "spellFolders";
const FOLDER_KEY = "folder:";

Hooks.on("renderActorSheetV2", (app, element) =>
{
    if (!game.settings.get(MODULE, LORE_SETTING))
    {
        return;
    }
    const actor = app.document;
    const root = element instanceof HTMLElement ? element : element?.[0];
    const tab = root?.querySelector("section[data-tab='magic']");
    if (!actor?.items || !tab)
    {
        return;
    }
    const editable = Boolean(app.isEditable && actor.isOwner);
    try
    {
        arrangeSpellList(tab.querySelector(".sheet-list.petty > .list-content"), actor, { grouped: false });
        arrangeSpellList(tab.querySelector(".sheet-list.spells > .list-content"), actor, { grouped: true, editable });
        // Сортировка — вид, а не правка: графа щёлкается у всех, кому виден лист.
        decorateCnHeader(tab.querySelector(".sheet-list.spells > .list-header"));
        if (editable)
        {
            addFolderButton(tab.querySelector(".sheet-list.spells > .list-header .list-name"), actor);
        }
        addSearchBar(app, tab, "magic");
    }
    catch (e)
    {
        // Лист должен открываться, даже если раскладка сломалась.
        console.error(MODULE + " | не удалось разложить заклинания:", e);
    }
});

// Закрытый лист забывает поиск: открыли снова — видно всё.
Hooks.on("closeActorSheetV2", app => sheetSearch.delete(app));

/**
 * Переставить строки списка. `grouped` — раскладывать по папкам и школам.
 * Повторяемо: прежние заголовки снимаются, строки переставляются заново.
 */
function arrangeSpellList(content, actor, { grouped, editable = false })
{
    if (!content)
    {
        return;
    }
    for (const old of childrenWithClass(content, "homerule-lore-header"))
    {
        old.remove();
    }

    const entries = childrenWithClass(content, "list-row")
        .filter(row => row.dataset.uuid)
        .map((row, index) =>
        {
            const id = row.dataset.uuid.split(".").pop();
            const spell = actor.items.get(id);
            return {
                row,
                index,
                id,
                name: spell?.name ?? row.querySelector(".label")?.textContent.trim() ?? "",
                spell,
                cn: Number(spell?.system?.cn?.value) || 0,
                lore: spell ? loreOf(spell) : ""
            };
        });

    entries.sort(spellComparator(game.settings.get(MODULE, LORE_ORDER_SETTING)));
    for (const e of entries)
    {
        rowSearchData.set(e.row, { name: e.name, item: e.spell }); // по этому ищет строка поиска
    }

    if (!grouped)
    {
        entries.forEach(e => content.append(e.row));
        return;
    }

    // Папки показываем и пустыми: в пустую тоже надо уметь что-то положить.
    const folders = readFolders(actor);
    if (!entries.length && !folders.length)
    {
        return;
    }
    const folderOf = new Map();
    const byFolder = new Map(folders.map(f => [f.id, []]));
    for (const f of folders)
    {
        f.spells.forEach(id => folderOf.has(id) || folderOf.set(id, f.id));
    }
    const byLore = new Map();
    for (const e of entries)
    {
        const folderId = folderOf.get(e.id);
        if (folderId)
        {
            byFolder.get(folderId).push(e);
            continue;
        }
        if (!byLore.has(e.lore))
        {
            byLore.set(e.lore, []);
        }
        byLore.get(e.lore).push(e);
    }

    const collapsed = new Set(readCollapsedLores()[actor.uuid] ?? []);
    const place = (header, list) =>
    {
        const isCollapsed = collapsed.has(header.dataset.groupKey);
        setCollapsed(header, isCollapsed);
        content.append(header);
        for (const e of list)
        {
            e.row.classList.toggle("homerule-lore-collapsed", isCollapsed);
            content.append(e.row);
        }
    };

    folders.forEach((folder, i) => place(
        makeFolderHeader(actor, folder, byFolder.get(folder.id).length, editable, i, folders.length),
        byFolder.get(folder.id)));
    for (const lore of [...byLore.keys()].sort(compareLores))
    {
        place(makeLoreHeader(actor, lore, byLore.get(lore).length, editable), byLore.get(lore));
    }
}

function childrenWithClass(parent, cls)
{
    return Array.from(parent.children).filter(el => el.classList.contains(cls));
}

/** Школа заклинания так же, как её берёт система: выбранная, иначе первая. */
function loreOf(spell)
{
    const lore = spell.system?.lore ?? {};
    const values = Array.isArray(lore.value) ? lore.value : (lore.value ? [lore.value] : []);
    return normalizeLore(lore.chosen || values[0] || "");
}

/** Простейшее ли — ровно так, как решает лист (`lore.value == "petty"`). */
function isPettySpell(spell)
{
    return [].concat(spell?.system?.lore?.value ?? []).join(",") === "petty";
}

/** Старые данные могут хранить школу названием, а не ключом: «Металл» → metal. */
function normalizeLore(raw)
{
    const lores = game.wfrp4e.config.magicLores;
    if (!raw || raw in lores)
    {
        return raw;
    }
    const wanted = String(raw).trim().toLowerCase();
    const key = Object.keys(lores).find(k => game.i18n.localize(lores[k]).toLowerCase() === wanted);
    return key ?? raw;
}

function loreLabel(lore)
{
    if (!lore)
    {
        return NO_LORE;
    }
    const lores = game.wfrp4e.config.magicLores;
    return lore in lores ? game.i18n.localize(lores[lore]) : lore;
}

/**
 * Школы в порядке системной настройки (`magicLores`: коллегии, затем прочие;
 * модули дописывают свои в конец), незнакомые — по алфавиту, без школы — последней.
 */
function compareLores(a, b)
{
    const keys = Object.keys(game.wfrp4e.config.magicLores);
    const rank = lore => !lore ? keys.length + 1 : (keys.includes(lore) ? keys.indexOf(lore) : keys.length);
    return (rank(a) - rank(b)) || compareNames(loreLabel(a), loreLabel(b));
}

function compareNames(a, b)
{
    return String(a).localeCompare(String(b), game.i18n.lang, { sensitivity: "base" });
}

function spellComparator(order)
{
    if (order === "sheet")
    {
        return (a, b) => a.index - b.index;
    }
    if (order === "cn")
    {
        return (a, b) => (a.cn - b.cn) || compareNames(a.name, b.name) || (a.index - b.index);
    }
    if (order === "cnDesc")
    {
        // При равном пороге — всё равно по алфавиту, а не наоборот.
        return (a, b) => (b.cn - a.cn) || compareNames(a.name, b.name) || (a.index - b.index);
    }
    return (a, b) => compareNames(a.name, b.name) || (a.index - b.index);
}

/**
 * Графа «ПС» в заголовке списка переключает порядок внутри групп:
 * по возрастанию → по убыванию → тот порядок, что был до первого щелчка.
 * Выбор пишется в ту же клиентскую настройку, что и в «Настройках модулей»,
 * так что он общий для всех листов этого игрока и переживает перезагрузку.
 */
function decorateCnHeader(listHeader)
{
    const cells = listHeader ? childrenWithClass(listHeader, "tiny") : [];
    const cell = cells.find(c => c.dataset.homeruleCnLabel)
        ?? cells.find(c => c.dataset.tooltip === game.i18n.localize("SHEET.CN"))
        ?? cells[0];
    if (!cell)
    {
        return;
    }
    if (!cell.dataset.homeruleCnLabel)
    {
        cell.dataset.homeruleCnLabel = cell.dataset.tooltip || "Порог сотворения";
        cell.addEventListener("click", event =>
        {
            event.preventDefault();
            event.stopPropagation();
            cycleCnOrder();
        });
    }
    const order = game.settings.get(MODULE, LORE_ORDER_SETTING);
    cell.classList.add("homerule-cn-sort");
    cell.classList.toggle("asc", order === "cn");
    cell.classList.toggle("desc", order === "cnDesc");
    const next = order === "cn" ? "по убыванию"
        : order === "cnDesc" ? "вернуть прежний порядок"
        : "по возрастанию";
    cell.dataset.tooltip = cell.dataset.homeruleCnLabel + " · щелчок: " + next;
}

async function cycleCnOrder()
{
    const order = game.settings.get(MODULE, LORE_ORDER_SETTING);
    let next;
    if (order === "cn")
    {
        next = "cnDesc";
    }
    else if (order === "cnDesc")
    {
        const base = game.settings.get(MODULE, LORE_ORDER_BASE_SETTING);
        next = base in LORE_ORDERS && !CN_ORDERS.includes(base) ? base : "name";
    }
    else
    {
        await game.settings.set(MODULE, LORE_ORDER_BASE_SETTING, order);
        next = "cn";
    }
    // Смена настройки сама перерисует листы (onChange).
    await game.settings.set(MODULE, LORE_ORDER_SETTING, next);
}

/* ---------- Поиск ---------- */

/**
 * Какие вкладки ищем и чем. Вкладку узнаём по содержимому, а не по имени:
 * у НПС навыки лежат на главной вкладке (`npc-sheet.js`, часть `main` с тем же
 * шаблоном `actor-skills.hbs`).
 */
const SEARCH_KINDS = {
    magic: {
        placeholder: "Поиск заклинания",
        textFields: "описании, дальности, цели, длительности"
    },
    skills: {
        placeholder: "Поиск навыка",
        textFields: null // описания навыков общие, искать в них нечего
    },
    talents: {
        placeholder: "Поиск таланта или черты",
        textFields: "описании и графе «Тесты»"
    },
    inventory: {
        placeholder: "Поиск вещи",
        textFields: null
    }
};

/**
 * Запросы поиска: окно листа → {вкладка: {query, focused}}. Живут, пока лист
 * открыт, — лист перерисовывается от любой правки актёра, и поиск не должен
 * сбрасываться.
 */
const sheetSearch = new WeakMap();

/** Строка списка → {name, item} и разобранные для поиска слова (считаются по требованию). */
const rowSearchData = new WeakMap();

/**
 * Удобство 4. Поиск на вкладках навыков и талантов — та же строка, что и на
 * вкладке магии. Вкладку магии здесь не трогаем: её ведёт раскладка заклинаний.
 */
Hooks.on("renderActorSheetV2", (app, element) =>
{
    if (!game.settings.get(MODULE, SEARCH_SETTING))
    {
        return;
    }
    const actor = app.document;
    const root = element instanceof HTMLElement ? element : element?.[0];
    if (!actor?.items || !root)
    {
        return;
    }
    try
    {
        for (const tab of root.querySelectorAll("section"))
        {
            if (!tab.dataset.tab || tab.querySelector(".sheet-list.spells"))
            {
                continue;
            }
            const kind = tab.querySelector(".skill-lists") ? "skills"
                : tab.querySelector(".sheet-list.talent") ? "talents"
                : (tab.querySelector(".sheet-list.inventory") || tab.querySelector(".sheet-list.currency")) ? "inventory"
                : null;
            if (kind)
            {
                indexListRows(tab, actor, kind);
                addSearchBar(app, tab, kind);
            }
        }
    }
    catch (e)
    {
        console.error(MODULE + " | не удалось поставить поиск:", e);
    }
});

/**
 * Запомнить, что искать у строк вкладки: название берём у предмета, а не из
 * подписи — у продвинутых навыков в подпись вложен значок продвижения «+»/«✓».
 * Строки без предмета (неизученные карьерные навыки и таланты) ищутся по подписи.
 */
function indexListRows(tab, actor, kind)
{
    // В снаряжении строки вложены в сумки на любую глубину, а свёрнутые списки
    // и сумки показывают вещи иконками `.collapsed-icon` с названием в подсказке.
    const rows = kind === "inventory"
        ? [...tab.querySelectorAll(".list-row"), ...tab.querySelectorAll(".collapsed-icon")].filter(el => el.dataset.uuid)
        : tab.querySelectorAll(".sheet-list > .list-content > .list-row");
    for (const row of rows)
    {
        const item = row.dataset.uuid ? actor.items.get(row.dataset.uuid.split(".").pop()) : null;
        rowSearchData.set(row, {
            name: item?.name ?? row.querySelector(".label")?.textContent.trim() ?? row.dataset.tooltip ?? "",
            item
        });
    }
}

/**
 * Строка поиска над списками вкладки. По названию ищет нечётко: начала слов
 * в любом порядке, опечатки в длинных словах, латиница в русской раскладке.
 * Кнопка ¶ (где она есть) добавляет описание и прочие поля. Ничего не пишет в
 * актёра, работает у всех, кому виден лист.
 */
function addSearchBar(app, tab, kindKey)
{
    const kind = SEARCH_KINDS[kindKey];
    let states = sheetSearch.get(app);
    if (!states)
    {
        states = {};
        sheetSearch.set(app, states);
    }
    const tabKey = tab.dataset.tab || kindKey;
    const state = states[tabKey] ??= { query: "", focused: false };

    let bar = childrenWithClass(tab, "homerule-search")[0];
    let input = bar?.querySelector("input");
    let textToggle = bar?.querySelector(".homerule-search-text") ?? null;
    if (!bar)
    {
        bar = document.createElement("div");
        bar.classList.add("homerule-search");
        bar.dataset.kind = kindKey;
        const icon = document.createElement("i");
        icon.classList.add("fas", "fa-magnifying-glass");
        input = document.createElement("input");
        input.type = "search";
        input.placeholder = kind.placeholder;
        input.setAttribute?.("aria-label", kind.placeholder);
        bar.append(icon, input);
        if (kind.textFields)
        {
            textToggle = document.createElement("a");
            textToggle.classList.add("homerule-search-text");
            const textIcon = document.createElement("i");
            textIcon.classList.add("fas", "fa-align-left");
            textToggle.append(textIcon);
            bar.append(textToggle);
        }
        tab.prepend(bar);

        // Поле без имени, но лежит внутри формы листа: не даём ему ни отправить
        // форму по Enter, ни запустить сохранение листа по change.
        input.addEventListener("input", event =>
        {
            event.stopPropagation();
            state.query = input.value;
            applyTabSearch(tab, state.query, Boolean(kind.textFields), kindKey);
        });
        input.addEventListener("change", event => event.stopPropagation());
        input.addEventListener("keydown", event =>
        {
            if (event.key === "Enter")
            {
                event.preventDefault();
                event.stopPropagation();
            }
            else if (event.key === "Escape" && input.value)
            {
                // Первый Escape чистит поиск, лист при этом не закрывается.
                event.preventDefault();
                event.stopPropagation();
                input.value = state.query = "";
                applyTabSearch(tab, "", Boolean(kind.textFields), kindKey);
            }
        });
        input.addEventListener("focus", () => { state.focused = true; });
        input.addEventListener("blur", () => { state.focused = false; });
        textToggle?.addEventListener("click", async event =>
        {
            event.preventDefault();
            event.stopPropagation();
            await game.settings.set(MODULE, LORE_SEARCH_TEXT_SETTING, !game.settings.get(MODULE, LORE_SEARCH_TEXT_SETTING));
            markTextToggle(textToggle, kind);
            applyTabSearch(tab, state.query, true, kindKey);
        });
    }

    if (textToggle)
    {
        markTextToggle(textToggle, kind);
    }
    input.value = state.query;
    applyTabSearch(tab, state.query, Boolean(kind.textFields), kindKey);
    if (state.focused)
    {
        // Лист перерисовался, пока в поле печатали: вернуть курсор на место.
        input.focus();
        input.setSelectionRange?.(input.value.length, input.value.length);
    }
}

/** Кнопка ¶ одна на все вкладки: включили на талантах — включено и на магии. */
function markTextToggle(toggle, kind)
{
    const on = Boolean(game.settings.get(MODULE, LORE_SEARCH_TEXT_SETTING));
    toggle.classList.toggle("active", on);
    toggle.dataset.tooltip = on
        ? "Ищу и в " + kind.textFields + ". Щелчок: только по названию"
        : "Ищу только по названию. Щелчок: искать и в " + kind.textFields;
}

function applyTabSearch(tab, query, textAllowed, kindKey)
{
    if (kindKey === "inventory")
    {
        return refreshInventory(tab, query);
    }
    for (const content of tab.querySelectorAll(".sheet-list > .list-content"))
    {
        content.dataset.homeruleSearch = query;
        content.dataset.homeruleSearchText = textAllowed ? "1" : "";
        refreshListRows(content);
    }
}

/**
 * Поиск на вкладке снаряжения (`actor-inventory.hbs`, `container-contents.hbs`).
 * Вне сумок вещи лежат в списках по категориям, свёрнутая категория показывает
 * их иконками. Сумки идут парами: строка сумки `.list-row.container-drop`, за
 * ней блок `.list-content` с содержимым; внутри — вещи (или иконки, если сумка
 * свёрнута) и вложенные сумки теми же парами. Сумка видна, если совпала она
 * сама или что-то внутри; совпала сама — видно всё её содержимое. Списки без
 * совпадений во время поиска прячутся целиком.
 */
function refreshInventory(tab, query)
{
    const variants = queryVariants(query);
    const searching = variants.length > 0;
    const hit = el => !searching || Boolean(matchRow(inventoryEntry(el), variants, false));

    for (const list of tab.querySelectorAll(".sheet-list"))
    {
        if (list.classList.contains("container"))
        {
            continue;
        }
        const items = [...list.querySelectorAll(".list-row"), ...list.querySelectorAll(".collapsed-icon")].filter(el => el.dataset.uuid);
        let shown = 0;
        for (const el of items)
        {
            const found = hit(el);
            el.classList.toggle("homerule-search-hidden", !found);
            shown += found ? 1 : 0;
        }
        list.classList.toggle("homerule-search-hidden", searching && items.length > 0 && shown === 0);
    }

    const containers = tab.querySelector(".sheet-list.container > .list-content");
    if (containers)
    {
        const any = walkContainerLevel(containers, false, searching, hit);
        containers.parentElement.classList.toggle("homerule-search-hidden", searching && !any);
    }
}

/** Один уровень сумок; `insideHit` — совпала одна из сумок снаружи. Возвращает, видно ли что-нибудь. */
function walkContainerLevel(parent, insideHit, searching, hit)
{
    let any = false;
    const kids = Array.from(parent.children);
    for (let i = 0; i < kids.length; i++)
    {
        const el = kids[i];
        if (el.classList.contains("container-contents"))
        {
            any = walkContainerLevel(el, insideHit, searching, hit) || any;
        }
        else if (el.classList.contains("collapsed-rows"))
        {
            for (const icon of Array.from(el.children).filter(c => c.dataset.uuid))
            {
                const found = insideHit || hit(icon);
                icon.classList.toggle("homerule-search-hidden", !found);
                any = any || found;
            }
        }
        else if (el.classList.contains("list-row") && el.classList.contains("container-drop"))
        {
            const contents = kids[i + 1]?.classList.contains("list-content") ? kids[++i] : null;
            const self = searching && hit(el);
            const inside = contents ? walkContainerLevel(contents, insideHit || self, searching, hit) : false;
            const visible = !searching || insideHit || self || inside;
            el.classList.toggle("homerule-search-hidden", !visible);
            contents?.classList.toggle("homerule-search-hidden", !visible);
            any = any || visible;
        }
        else if (el.classList.contains("list-row") && el.dataset.uuid)
        {
            const found = insideHit || hit(el);
            el.classList.toggle("homerule-search-hidden", !found);
            any = any || found;
        }
    }
    return any;
}

function inventoryEntry(el)
{
    let entry = rowSearchData.get(el);
    if (!entry)
    {
        entry = { name: el.querySelector(".label")?.textContent.trim() ?? el.dataset.tooltip ?? "", item: null };
        rowSearchData.set(el, entry);
    }
    return entry;
}

/**
 * Кого показать. Без поиска строки прячет только свёрнутая группа. Во время
 * поиска свёрнутость не действует: видно всё найденное, а группы без совпадений
 * прячутся целиком и считают «найдено/всего». Строка, найденная не по названию,
 * получает значок с куском описания вокруг найденного.
 */
function refreshListRows(content)
{
    const variants = queryVariants(content.dataset.homeruleSearch ?? "");
    const searching = variants.length > 0;
    const withText = searching && content.dataset.homeruleSearchText === "1"
        && Boolean(game.settings.get(MODULE, LORE_SEARCH_TEXT_SETTING));
    let header = null;
    let collapsed = false;
    let total = 0;
    let shown = 0;
    const closeGroup = () =>
    {
        if (!header)
        {
            return;
        }
        header.classList.toggle("homerule-search-hidden", searching && shown === 0);
        const counter = header.querySelector(".homerule-lore-count");
        if (counter)
        {
            counter.textContent = searching ? shown + "/" + total : (header.dataset.count ?? String(total));
        }
    };
    for (const el of Array.from(content.children))
    {
        if (el.classList.contains("homerule-lore-header"))
        {
            closeGroup();
            header = el;
            collapsed = el.classList.contains("collapsed");
            total = shown = 0;
            continue;
        }
        if (!el.classList.contains("list-row"))
        {
            continue;
        }
        for (const old of el.querySelectorAll(".homerule-search-hit"))
        {
            old.remove();
        }
        let entry = rowSearchData.get(el);
        if (!entry)
        {
            entry = { name: el.querySelector(".label")?.textContent.trim() ?? "", item: null };
            rowSearchData.set(el, entry);
        }
        const hit = searching ? matchRow(entry, variants, withText) : { by: "name" };
        total++;
        if (hit)
        {
            shown++;
        }
        el.classList.toggle("homerule-search-hidden", !hit);
        el.classList.toggle("homerule-lore-collapsed", !searching && collapsed);
        if (hit?.by === "text")
        {
            addTextHitMark(el, entry, hit);
        }
    }
    closeGroup();
}

/** Нашлось ли: {by: "name"} или {by: "text", at, length}, иначе null. */
function matchRow(entry, variants, withText)
{
    entry.nameNorm ??= normalizeSearch(entry.name);
    entry.nameWords ??= searchWords(entry.name);
    for (const v of variants)
    {
        if (entry.nameNorm.includes(v.text) || (v.words.length && v.words.every(q => entry.nameWords.some(w => wordMatches(q, w)))))
        {
            return { by: "name" };
        }
    }
    if (!withText || !entry.item)
    {
        return null;
    }
    entry.text ??= itemSearchText(entry.item);
    entry.textFold ??= foldCase(entry.text);
    entry.textWords ??= [...new Set(searchWords(entry.text))];
    for (const v of variants)
    {
        const at = entry.textFold.indexOf(v.text);
        if (at >= 0)
        {
            return { by: "text", at, length: v.text.length };
        }
        // В длинном тексте опечатки дают слишком много случайного: только начала слов.
        if (v.words.length && v.words.every(q => entry.textWords.some(w => w.startsWith(q))))
        {
            const first = findWordStart(entry.textFold, v.words[0]);
            return { by: "text", at: first, length: v.words[0].length };
        }
    }
    return null;
}

/**
 * Слово запроса подходит к слову названия: оно — начало слова, а если слово
 * запроса длинное — с опечатками (4–6 букв — одна, дальше — две; первая буква
 * должна совпасть, иначе лезет лишнее).
 */
function wordMatches(q, w)
{
    if (w.startsWith(q))
    {
        return true;
    }
    const allowed = q.length <= 3 ? 0 : (q.length <= 6 ? 1 : 2);
    return allowed > 0 && q[0] === w[0] && prefixDistance(q, w, allowed) <= allowed;
}

/**
 * Наименьшее расстояние правки от `q` до какого-нибудь начала слова `w`
 * (вставка, удаление, замена, перестановка соседних букв — по одной правке).
 */
function prefixDistance(q, w, limit)
{
    const m = q.length;
    const n = Math.min(w.length, m + limit);
    let before = null;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++)
    {
        const cur = [i];
        for (let j = 1; j <= n; j++)
        {
            let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (q[i - 1] === w[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && q[i - 1] === w[j - 2] && q[i - 2] === w[j - 1])
            {
                d = Math.min(d, before[j - 2] + 1);
            }
            cur.push(d);
        }
        before = prev;
        prev = cur;
    }
    return Math.min(...prev);
}

/** Раскладка ЙЦУКЕН на латинских клавишах: набрали «juyty» вместо «огнен». */
const RU_LAYOUT = {
    "q": "й", "w": "ц", "e": "у", "r": "к", "t": "е", "y": "н", "u": "г", "i": "ш", "o": "щ", "p": "з",
    "[": "х", "]": "ъ", "a": "ф", "s": "ы", "d": "в", "f": "а", "g": "п", "h": "р", "j": "о", "k": "л",
    "l": "д", ";": "ж", "'": "э", "z": "я", "x": "ч", "c": "с", "v": "м", "b": "и", "n": "т", "m": "ь",
    ",": "б", ".": "ю", "`": "е"
};

/** Варианты запроса: как набран и, если в нём латиница, — в русской раскладке. */
function queryVariants(query)
{
    const text = normalizeSearch(query);
    if (!text)
    {
        return [];
    }
    const texts = [text];
    if (/[a-z]/.test(text))
    {
        texts.push(normalizeSearch(text.replace(/[a-z[\];',.`]/g, ch => RU_LAYOUT[ch] ?? ch)));
    }
    return [...new Set(texts)].map(t => ({ text: t, words: searchWords(t) }));
}

function normalizeSearch(text)
{
    return foldCase(text).trim();
}

/** Нижний регистр и «ё» = «е»; длину строки не меняет, по ней режется кусок описания. */
function foldCase(text)
{
    return String(text).toLowerCase().replace(/ё/g, "е");
}

function searchWords(text)
{
    return foldCase(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function findWordStart(text, word)
{
    for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1))
    {
        if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1]))
        {
            return at;
        }
    }
    return Math.max(0, text.indexOf(word));
}

/**
 * Текст предмета для поиска по кнопке ¶: сохранённое описание (не то, что
 * система дописала при подготовке данных) плюс поля, которые видны в листе:
 * у заклинания — дальность, цель, длительность, у таланта — графа «Тесты».
 *
 * У заклинания свойство школы система дописывает в `_addSpellDescription`, а у
 * части заклинаний (187 из 599 во «Враге Внутреннем») оно ещё и сохранено в
 * описании; отрезаем по той же пометке `SPELL.Lore` («Школа:»), по которой
 * система узнаёт его сама. Иначе «брони» находила бы всю Школу Металла.
 */
function itemSearchText(item)
{
    const data = item?._source?.system ?? item?.system ?? {};
    let html = String(data.description?.value ?? "");
    if (item?.type === "spell")
    {
        const marker = game.i18n.localize("SPELL.Lore");
        const cut = marker && marker !== "SPELL.Lore" ? html.lastIndexOf(marker) : -1;
        if (cut > 0)
        {
            html = html.slice(0, cut);
        }
    }
    const plain = decodeEntities(stripEnrichers(html).replace(/<[^>]*>/g, " "));
    const fields = item?.type === "spell" ? [data.range?.value, data.target?.value, data.duration?.value]
        : item?.type === "talent" ? [data.tests?.value]
        : [];
    return [plain, ...fields.filter(v => typeof v === "string" && v.trim())]
        .join(" · ").replace(/\s+/g, " ").trim();
}

const HTML_ENTITIES = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'",
    "&rsquo;": "’", "&lsquo;": "‘", "&laquo;": "«", "&raquo;": "»", "&hellip;": "…",
    "&ndash;": "–", "&mdash;": "—"
};

function decodeEntities(text)
{
    return text.replace(/&[#a-z0-9]+;/gi, e => HTML_ENTITIES[e.toLowerCase()] ?? " ");
}

/** Значок у названия: нашлось в описании; в подсказке — кусок вокруг найденного. */
function addTextHitMark(row, entry, hit)
{
    const place = row.querySelector(".list-name") ?? row;
    const from = Math.max(0, hit.at - 50);
    const to = Math.min(entry.text.length, hit.at + hit.length + 70);
    const esc = foundry.utils.escapeHTML;
    const snippet = (from > 0 ? "…" : "")
        + esc(entry.text.slice(from, hit.at))
        + "<strong>" + esc(entry.text.slice(hit.at, hit.at + hit.length)) + "</strong>"
        + esc(entry.text.slice(hit.at + hit.length, to))
        + (to < entry.text.length ? "…" : "");
    const mark = document.createElement("i");
    mark.classList.add("fas", "fa-align-left", "homerule-search-hit");
    mark.dataset.tooltip = "Найдено в описании:<br>" + snippet;
    mark.dataset.tooltipClass = "homerule-lore-tooltip";
    place.append(mark);
}

/* ---------- Заголовки групп ---------- */

/** Каркас заголовка: стрелка, значок, название, [дополнения], счётчик. */
function makeGroupHeader(actor, groupKey, icon, label, count, extras = [])
{
    const header = document.createElement("div");
    header.classList.add("homerule-lore-header");
    header.dataset.groupKey = groupKey;
    header.dataset.count = String(count); // поиск пишет «найдено/всего» и возвращает это число

    const chevron = document.createElement("i");
    chevron.classList.add("fas", "fa-chevron-down", "homerule-lore-chevron");

    const name = document.createElement("span");
    name.classList.add("homerule-lore-name");
    name.textContent = label;

    const counter = document.createElement("span");
    counter.classList.add("homerule-lore-count");
    counter.textContent = String(count);

    header.append(chevron, icon, name, ...extras, counter);
    header.addEventListener("click", event =>
    {
        event.preventDefault();
        event.stopPropagation();
        toggleLoreGroup(actor, header);
    });
    return header;
}

function makeLoreHeader(actor, lore, count, editable)
{
    // Цвет школы берём у системы: её таблица стилей красит `.lore.chosen.<школа>`
    // на вкладке магии. Школе без цвета остаётся пустой кружок.
    const swatch = document.createElement("span");
    swatch.classList.add("homerule-lore-swatch");
    if (lore in game.wfrp4e.config.magicLores)
    {
        swatch.classList.add("lore", "chosen", lore);
    }
    // Свойство школы — отдельным значком, а не подсказкой на весь заголовок:
    // текст длинный и всплывал бы при каждом проходе мышью по списку.
    const extras = [];
    const description = loreDescription(lore);
    if (description)
    {
        const info = document.createElement("i");
        info.classList.add("fas", "fa-circle-info", "homerule-lore-info");
        info.dataset.tooltip = description;
        info.dataset.tooltipClass = "homerule-lore-tooltip";
        info.addEventListener("click", event => event.stopPropagation()); // не сворачивать
        extras.push(info);
    }
    const header = makeGroupHeader(actor, lore, swatch, loreLabel(lore), count, extras);
    header.dataset.lore = lore;
    if (editable)
    {
        // Заклинание, брошенное на школу, вынимается из папки.
        acceptSpellDrop(header, actor, null);
    }
    return header;
}

/**
 * Свойство школы для подсказки: название, ветер и текст из `loreEffectDescriptions`.
 * wfrp4e-core заполняет эту настройку ключами локализации, а система в
 * `i18nInit` сама заменяет их переводом (`hooks/i18n.js`, `toTranslate`), так что
 * к отрисовке листа там уже русский текст из ru-wfrp4e. Тот же текст система
 * дописывает в описание каждого заклинания школы (`spell.js`, `_addSpellDescription`).
 */
function loreDescription(lore)
{
    const config = game.wfrp4e.config;
    const text = configText(config.loreEffectDescriptions?.[lore]);
    if (!text)
    {
        return "";
    }
    const wind = configText(config.magicWind?.[lore]);
    return "<strong>" + foundry.utils.escapeHTML(loreLabel(lore)) + "</strong>"
        + (wind ? " · ветер " + foundry.utils.escapeHTML(wind) : "")
        + "<br><br>" + stripEnrichers(text);
}

/** Строка из настройки системы: переведённая, а голый ключ без перевода и «None» — пусто. */
function configText(value)
{
    if (!value || typeof value !== "string" || value === "None")
    {
        return "";
    }
    const text = game.i18n.has?.(value) ? game.i18n.localize(value) : value;
    return /^[A-Z][\w-]*(\.[\w-]+)+$/.test(text) ? "" : text;
}

/**
 * Вставки системы в тексте — `@Condition[охвачен огнём]`, `@UUID[…]{демон}` —
 * в подсказке не раскрываются, оставляем от них подпись.
 */
function stripEnrichers(text)
{
    return String(text)
        .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
        .replace(/@UUID\[[^\]]*\]/g, "")
        .replace(/@\w+\[([^\]]*)\]/g, "$1");
}

function makeFolderHeader(actor, folder, count, editable, position, total)
{
    const icon = document.createElement("i");
    icon.classList.add("fas", "fa-folder-open", "homerule-folder-icon");
    const header = makeGroupHeader(actor, FOLDER_KEY + folder.id, icon, folder.name, count);
    header.classList.add("homerule-folder");
    header.dataset.folder = folder.id;
    if (!editable)
    {
        return header;
    }

    const controls = document.createElement("span");
    controls.classList.add("homerule-folder-controls");
    const buttons = [
        ["pick", "fa-list-check", "Выбрать заклинания", () => pickFolderSpells(actor, folder.id)],
        ["rename", "fa-pen", "Переименовать", () => renameFolder(actor, folder.id)],
        ["up", "fa-arrow-up", "Выше", () => moveFolder(actor, folder.id, -1), position === 0],
        ["down", "fa-arrow-down", "Ниже", () => moveFolder(actor, folder.id, +1), position === total - 1],
        ["delete", "fa-trash", "Удалить папку", () => deleteFolder(actor, folder.id)]
    ];
    for (const [op, glyph, tooltip, run, disabled] of buttons)
    {
        const button = document.createElement("a");
        button.classList.add("homerule-folder-control");
        button.dataset.op = op;
        button.dataset.tooltip = tooltip;
        if (disabled)
        {
            button.classList.add("disabled");
        }
        const i = document.createElement("i");
        i.classList.add("fas", glyph);
        button.append(i);
        button.addEventListener("click", event =>
        {
            event.preventDefault();
            event.stopPropagation(); // не сворачивать папку
            if (!disabled)
            {
                run();
            }
        });
        controls.append(button);
    }
    header.append(controls);
    acceptSpellDrop(header, actor, folder.id);
    return header;
}

function setCollapsed(header, isCollapsed)
{
    header.classList.toggle("collapsed", isCollapsed);
    header.dataset.tooltip = isCollapsed ? "Развернуть" : "Свернуть";
    const icon = header.querySelector(".homerule-folder-icon");
    if (icon)
    {
        icon.classList.toggle("fa-folder-open", !isCollapsed);
        icon.classList.toggle("fa-folder", isCollapsed);
    }
}

/** Свернуть или развернуть группу без перерисовки листа и запомнить выбор. */
function toggleLoreGroup(actor, header)
{
    const nowCollapsed = !header.classList.contains("collapsed");
    setCollapsed(header, nowCollapsed);
    if (header.parentElement)
    {
        refreshListRows(header.parentElement); // во время поиска свёрнутость не прячет найденное
    }

    const all = readCollapsedLores();
    const set = new Set(all[actor.uuid] ?? []);
    if (nowCollapsed)
    {
        set.add(header.dataset.groupKey);
    }
    else
    {
        set.delete(header.dataset.groupKey);
    }
    if (set.size)
    {
        all[actor.uuid] = [...set];
    }
    else
    {
        delete all[actor.uuid];
    }
    game.settings.set(MODULE, LORE_COLLAPSED_SETTING, all);
}

function readCollapsedLores()
{
    const value = game.settings.get(MODULE, LORE_COLLAPSED_SETTING);
    return value && typeof value === "object" ? foundry.utils.deepClone(value) : {};
}

/**
 * Строку заклинания можно бросить на заголовок: на папку — положить в неё,
 * на школу — вынуть из папки. Система при перетаскивании кладёт в данные
 * `{type: "Item", uuid}` (`warhammer-lib`, `_onDragStart`). Чужое (предмет из
 * компендия, другого актёра, простейшее заклинание) пропускаем дальше, к системе.
 */
function acceptSpellDrop(header, actor, folderId)
{
    header.addEventListener("dragover", event =>
    {
        event.preventDefault();
        header.classList.add("drop-target");
    });
    header.addEventListener("dragleave", () => header.classList.remove("drop-target"));
    header.addEventListener("drop", event =>
    {
        header.classList.remove("drop-target");
        let data;
        try
        {
            data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        }
        catch (e)
        {
            return;
        }
        const spell = data?.type === "Item" && data.uuid
            ? actor.items.find(i => i.uuid === data.uuid)
            : null;
        if (!spell || spell.type !== "spell" || isPettySpell(spell))
        {
            return;
        }
        event.preventDefault();
        event.stopPropagation(); // иначе система сочтёт это перестановкой
        moveSpellToFolder(actor, spell.id, folderId);
    });
}

/* ---------- Папки: данные и действия ---------- */

function readFolders(actor)
{
    const raw = actor.flags?.[MODULE]?.[FOLDERS_FLAG];
    if (!Array.isArray(raw))
    {
        return [];
    }
    return raw
        .filter(f => f && typeof f.id === "string" && typeof f.name === "string")
        .map(f => ({
            id: f.id,
            name: f.name,
            spells: Array.isArray(f.spells) ? f.spells.filter(id => typeof id === "string") : []
        }));
}

/** Записать папки; заодно выбросить заклинания, которых на листе уже нет. */
function saveFolders(actor, folders)
{
    const clean = folders.map(f => ({
        id: f.id,
        name: f.name,
        spells: [...new Set(f.spells)].filter(id => actor.items.get(id))
    }));
    return actor.update({ [`flags.${MODULE}.${FOLDERS_FLAG}`]: clean });
}

function addFolderButton(listName, actor)
{
    if (!listName || listName.querySelector(".homerule-folder-add"))
    {
        return;
    }
    const button = document.createElement("a");
    button.classList.add("homerule-folder-add");
    button.dataset.tooltip = "Новая папка";
    const i = document.createElement("i");
    i.classList.add("fas", "fa-folder-plus");
    button.append(i);
    button.addEventListener("click", event =>
    {
        event.preventDefault();
        event.stopPropagation();
        createFolder(actor);
    });
    listName.append(button);
}

async function createFolder(actor)
{
    const name = await askFolderName("Новая папка", "");
    if (!name)
    {
        return;
    }
    const folders = readFolders(actor);
    folders.push({ id: foundry.utils.randomID(), name, spells: [] });
    return saveFolders(actor, folders);
}

async function renameFolder(actor, folderId)
{
    const folder = readFolders(actor).find(f => f.id === folderId);
    if (!folder)
    {
        return;
    }
    const name = await askFolderName("Переименовать папку", folder.name);
    if (!name || name === folder.name)
    {
        return;
    }
    // Читаем заново: пока открыт диалог, папки мог поправить кто-то ещё.
    const folders = readFolders(actor);
    const target = folders.find(f => f.id === folderId);
    if (!target)
    {
        return;
    }
    target.name = name;
    return saveFolders(actor, folders);
}

function moveFolder(actor, folderId, delta)
{
    const folders = readFolders(actor);
    const from = folders.findIndex(f => f.id === folderId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= folders.length)
    {
        return;
    }
    [folders[from], folders[to]] = [folders[to], folders[from]];
    return saveFolders(actor, folders);
}

async function deleteFolder(actor, folderId)
{
    const folder = readFolders(actor).find(f => f.id === folderId);
    if (!folder)
    {
        return;
    }
    const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Удалить папку" },
        content: "<p>Удалить папку «" + foundry.utils.escapeHTML(folder.name) + "»?</p>"
            + "<p>Заклинания останутся на листе и вернутся в группы своих школ.</p>",
        rejectClose: false
    });
    if (!ok)
    {
        return;
    }
    return saveFolders(actor, readFolders(actor).filter(f => f.id !== folderId));
}

function moveSpellToFolder(actor, spellId, folderId)
{
    const folders = readFolders(actor);
    const current = folders.find(f => f.spells.includes(spellId))?.id ?? null;
    if (current === folderId)
    {
        return;
    }
    for (const f of folders)
    {
        f.spells = f.spells.filter(id => id !== spellId);
    }
    folders.find(f => f.id === folderId)?.spells.push(spellId);
    return saveFolders(actor, folders);
}

/** Отметить заклинания папки галочками; отмеченное в других папках переезжает сюда. */
async function pickFolderSpells(actor, folderId)
{
    const folders = readFolders(actor);
    const folder = folders.find(f => f.id === folderId);
    if (!folder)
    {
        return;
    }
    const spells = (actor.itemTypes?.spell ?? actor.items.filter(i => i.type === "spell"))
        .filter(s => !isPettySpell(s))
        .sort((a, b) => compareLores(loreOf(a), loreOf(b)) || compareNames(a.name, b.name));
    if (!spells.length)
    {
        return ui.notifications.info("На листе нет заклинаний школ.");
    }

    const esc = foundry.utils.escapeHTML;
    const rows = spells.map(s =>
    {
        const other = folders.find(f => f.id !== folderId && f.spells.includes(s.id));
        const note = loreLabel(loreOf(s)) + (other ? " · сейчас в «" + other.name + "»" : "");
        return '<label class="homerule-folder-pick-row">'
            + '<input type="checkbox" name="spell" value="' + esc(s.id) + '"'
            + (folder.spells.includes(s.id) ? " checked" : "") + "> "
            + "<span>" + esc(s.name) + "</span>"
            + '<span class="homerule-folder-pick-note">' + esc(note) + "</span>"
            + "</label>";
    }).join("");

    const chosen = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Папка «" + folder.name + "»" },
        content: '<div class="homerule-folder-pick">' + rows + "</div>",
        ok: {
            label: "Сохранить",
            callback: (event, button) => Array.from(button.form.querySelectorAll('input[name="spell"]:checked')).map(i => i.value)
        },
        rejectClose: false
    });
    if (!Array.isArray(chosen))
    {
        return;
    }

    // Читаем заново: пока открыт диалог, папки мог поправить кто-то ещё.
    const fresh = readFolders(actor);
    if (!fresh.some(f => f.id === folderId))
    {
        return;
    }
    const picked = new Set(chosen);
    for (const f of fresh)
    {
        f.spells = f.id === folderId ? chosen : f.spells.filter(id => !picked.has(id));
    }
    return saveFolders(actor, fresh);
}

async function askFolderName(title, value)
{
    const name = await foundry.applications.api.DialogV2.prompt({
        window: { title },
        content: '<input type="text" name="name" value="' + foundry.utils.escapeHTML(value)
            + '" placeholder="Название папки" autofocus>',
        ok: {
            label: "Сохранить",
            callback: (event, button) => button.form.elements.name.value
        },
        rejectClose: false
    });
    return typeof name === "string" ? name.trim() : "";
}

function rerenderActorSheets()
{
    for (const app of foundry.applications.instances.values())
    {
        if (app instanceof foundry.applications.sheets.ActorSheetV2 && app.rendered)
        {
            app.render();
        }
    }
}

/**
 * Удобство 5. Справка в чате из своей службы поиска по правилам (по желанию).
 *
 * `/правило скрытность` (или `/rule …`) спрашивает службу поиска (`GET /search`,
 * ответ — JSON `{hits: [{name, section_path, source, pages, text, type,
 * rerank_score}]}`) и присылает карточку шёпотом самому спросившему: найденные
 * фрагменты, с книгой и страницами. Кнопка «Показать всем» выкладывает фрагмент в
 * общий чат; у текста приключений (`type: "campaign"`) её нет, чтобы не показать
 * игрокам сюжет.
 *
 * Служба обычно живёт на машине ведущего и слушает `127.0.0.1`, а Foundry — на
 * сервере. Поэтому спрашивает браузер ведущего: адрес 127.0.0.1 браузер считает
 * доверенным и со страницы по HTTPS пускает, если служба разрешает обращения с
 * любого сайта (CORS `*`). У игроков по этому адресу ничего нет.
 */
const LIBRARY_TOP_K = 3;
const LIBRARY_TIMEOUT_MS = 30000;

/**
 * Команды справки. `types` — фильтр по типу фрагмента индекса; демон принимает
 * один тип за запрос, поэтому бестиарий (в индексе он и `bestiary`, и `creature`)
 * спрашивается двумя запросами, а выдача склеивается по оценке. Английских
 * имён, кроме `/rule`, нет: латинские заняты модулем chat-commander-wfrp4e
 * (`/cond`, `/exp`, `/fear` и прочие).
 */
const LIBRARY_COMMANDS = {
    "правило": { types: null, label: "", example: "скрытность", description: "поиск в библиотеке правил" },
    "заклинание": { types: ["spell"], label: "заклинания", example: "проклятье ржавчины", description: "поиск среди заклинаний" },
    "существо": { types: ["bestiary", "creature"], label: "бестиарий", example: "огр", description: "поиск в бестиарии" },
    "травма": { types: ["wound"], label: "травмы", example: "перелом руки", description: "поиск в таблицах травм" },
    "карьера": { types: ["career"], label: "карьеры", example: "охотник на ведьм", description: "поиск среди карьер" }
};
const LIBRARY_ALIASES = { "rule": "правило" };
const LIBRARY_COMMAND = new RegExp("^/(" + [...Object.keys(LIBRARY_COMMANDS), ...Object.keys(LIBRARY_ALIASES)].join("|")
    + ")(?:\\s+([\\s\\S]*))?$", "i");

/** Типы фрагментов индекса (`GET /types`) по-русски. */
const LIBRARY_TYPES = {
    rules: "правила",
    rule: "правила",
    "magic-rule": "магия",
    lore: "школа магии",
    spell: "заклинание",
    career: "карьера",
    wound: "травма",
    bestiary: "бестиарий",
    creature: "бестиарий",
    setting: "мир",
    campaign: "приключение"
};

/** Текст приключений игрокам не показываем. */
const LIBRARY_SPOILER_TYPES = new Set(["campaign"]);

Hooks.on("chatMessage", (chatLog, message) =>
{
    const match = LIBRARY_COMMAND.exec(chatCommandText(message));
    if (!match || !game.settings.get(MODULE, LIBRARY_SETTING))
    {
        return; // не наша команда — пусть разбирает Foundry
    }
    runLibraryCommand(match[1], match[2]);
    return false;
});

/**
 * Команды в подсказке `_chatcommands`: набираешь `/` — видишь их с описанием.
 * Разбирает их всё равно наш хук `chatMessage`: он зарегистрирован при загрузке
 * модуля, раньше, чем библиотека вешает свой в `init`, и возвращает `false`,
 * так что до её обработчика дело не доходит. Её `callback` — запасной путь на
 * случай, если порядок когда-нибудь поменяется. Показываем только ведущему:
 * демон живёт у него.
 */
Hooks.once("chatCommandsReady", commands =>
{
    if (!game.user?.isGM || !game.settings.get(MODULE, LIBRARY_SETTING) || typeof commands?.register !== "function")
    {
        return;
    }
    for (const [name, command] of Object.entries(LIBRARY_COMMANDS))
    {
        commands.register({
            name: "/" + name,
            module: MODULE,
            aliases: Object.entries(LIBRARY_ALIASES).filter(([, target]) => target === name).map(([alias]) => "/" + alias),
            description: command.description + ": /" + name + " " + command.example,
            icon: '<i class="fas fa-book"></i>',
            requiredRole: "NONE",
            callback: (chat, parameters) =>
            {
                runLibraryCommand(name, parameters);
                return {}; // пустой объект — сообщение не отправлять
            }
        });
    }
});

function runLibraryCommand(commandName, parameters)
{
    const key = String(commandName).toLowerCase();
    const name = LIBRARY_ALIASES[key] ?? key;
    const command = LIBRARY_COMMANDS[name];
    if (!command)
    {
        return;
    }
    if (!game.settings.get(MODULE, LIBRARY_SETTING))
    {
        return ui.notifications.info("Справка из библиотеки выключена в настройках модуля.");
    }
    const query = String(parameters ?? "").trim();
    if (!query)
    {
        return ui.notifications.info("Что искать? Например: /" + name + " " + command.example);
    }
    return lookupLibrary(query, command);
}

/**
 * Текст сообщения из поля чата. В v14 поле чата — редактор ProseMirror, и хук
 * `chatMessage` получает HTML: `<p>/правило скрытность</p>`, пробелы бывают
 * `&nbsp;`. Ядро само срезает обёртку в `ChatLog.parse`
 * (`client/applications/sidebar/tabs/chat.mjs`), а в хук она приходит как есть.
 * В v13 приходил чистый текст — годится и он.
 */
function chatCommandText(message)
{
    const html = String(message ?? "").trim().replace(/^<p>|<\/p>$/gi, "");
    return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")).trim();
}

async function lookupLibrary(query, command = LIBRARY_COMMANDS["правило"])
{
    const base = String(game.settings.get(MODULE, LIBRARY_URL_SETTING) || "http://127.0.0.1:8765").trim().replace(/\/+$/, "");
    const urls = (command.types ?? [null]).map(type => base + "/search?q=" + encodeURIComponent(query)
        + "&top_k=" + LIBRARY_TOP_K + (type ? "&type=" + encodeURIComponent(type) : ""));
    ui.notifications.info("Ищу в библиотеке" + (command.label ? " (" + command.label + ")" : "") + ": " + query);

    let responses;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIBRARY_TIMEOUT_MS);
    try
    {
        responses = await Promise.all(urls.map(url => fetch(url, { signal: controller.signal })));
        const bad = responses.find(r => !r.ok);
        if (bad)
        {
            return ui.notifications.warn(bad.status === 503
                ? "Библиотека ещё загружает модели — повтори через минуту."
                : "Библиотека ответила ошибкой " + bad.status + ".");
        }
        responses = await Promise.all(responses.map(r => r.json()));
    }
    catch (e)
    {
        console.warn(MODULE + " | библиотека не ответила:", e);
        return ui.notifications.warn(controller.signal.aborted
            ? "Библиотека думает дольше " + (LIBRARY_TIMEOUT_MS / 1000) + " секунд — повтори запрос."
            : "Библиотека не отвечает по адресу " + base + ". Проверь, что служба поиска запущена; "
              + "если браузер спрашивал доступ к устройствам локальной сети — разреши.");
    }
    finally
    {
        clearTimeout(timer);
    }

    // Несколько запросов (бестиарий) — одна выдача: по оценке переранжировщика,
    // она у демона одна на все запросы с тем же текстом.
    const hits = responses
        .flatMap(data => Array.isArray(data?.hits) ? data.hits : [])
        .sort((a, b) => (Number(b.rerank_score) || 0) - (Number(a.rerank_score) || 0))
        .slice(0, LIBRARY_TOP_K)
        .map(h => ({
            name: String(h.name ?? ""),
            section: String(h.section_path ?? ""),
            source: String(h.source ?? ""),
            pages: String(h.pages ?? ""),
            type: String(h.type ?? ""),
            language: String(h.metadata?.language ?? ""),
            text: String(h.text ?? "")
        }));
    return ChatMessage.create({
        speaker: { alias: "Библиотека" },
        whisper: [game.user.id],
        content: libraryCardHtml(query, hits, command.label),
        flags: { [MODULE]: { library: { query, kind: command.label, hits } } }
    });
}

function libraryCardHtml(query, hits, label = "")
{
    const esc = foundry.utils.escapeHTML;
    const title = '<div class="test-title">Библиотека' + (label ? " · " + esc(label) : "") + ": «" + esc(query) + "»</div>";
    if (!hits.length)
    {
        return '<div class="wfrp4e chat-card homerule-library">' + title
            + '<div class="description">Ничего не нашлось.</div></div>';
    }
    const blocks = hits.map((hit, index) =>
        '<details class="homerule-library-hit"' + (index === 0 ? " open" : "") + ">"
        + "<summary>" + libraryHeadHtml(hit) + "</summary>"
        + '<div class="homerule-library-text">' + renderLibraryMarkdown(hit.text) + "</div>"
        + (LIBRARY_SPOILER_TYPES.has(hit.type) ? ""
            : '<div class="chat-buttons"><a class="chat-button homerule-library-reveal" data-index="' + index + '">'
              + '<i class="fas fa-eye"></i> Показать всем</a></div>')
        + "</details>");
    return '<div class="wfrp4e chat-card homerule-library">' + title + blocks.join("") + "</div>";
}

/** Заголовок фрагмента: название, раздел, книга, страницы, тип, язык. */
function libraryHeadHtml(hit)
{
    const esc = foundry.utils.escapeHTML;
    const where = [hit.source, hit.pages ? "с. " + hit.pages.replace(/-/g, "–") : ""].filter(Boolean).join(", ");
    const tags = [LIBRARY_TYPES[hit.type] ?? hit.type, hit.language === "en" ? "англ." : ""].filter(Boolean).join(" · ");
    const section = hit.section && !hit.section.includes(hit.name.replace(/ \(часть \d+\)$/, "")) ? hit.section : "";
    return "<strong>" + esc(hit.name) + "</strong>"
        + (section ? '<span class="homerule-library-section">' + esc(section) + "</span>" : "")
        + '<span class="homerule-library-source">' + esc(where) + (tags ? " · " + esc(tags) : "") + "</span>";
}

/**
 * Markdown фрагмента → HTML для чата. Текст библиотеки — Markdown после Marker:
 * заголовки, жирный и курсив, таблицы с широкими выравнивающими пробелами.
 * Сначала всё экранируется, потом размечается — чужого HTML в карточку не попадёт.
 */
function renderLibraryMarkdown(markdown)
{
    const out = [];
    let paragraph = [];
    let table = null;
    const flushParagraph = () =>
    {
        if (paragraph.length)
        {
            out.push("<p>" + paragraph.join("<br>") + "</p>");
            paragraph = [];
        }
    };
    const flushTable = () =>
    {
        if (table)
        {
            out.push(renderLibraryTable(table));
            table = null;
        }
    };
    for (const raw of String(markdown).replace(/\r/g, "").split("\n"))
    {
        const line = raw.trim();
        if (line.startsWith("|"))
        {
            flushParagraph();
            (table ??= []).push(line);
            continue;
        }
        flushTable();
        if (!line)
        {
            flushParagraph();
            continue;
        }
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        if (heading)
        {
            flushParagraph();
            out.push("<p><strong>" + inlineMarkdown(heading[1]) + "</strong></p>");
            continue;
        }
        const item = /^[-*•]\s+(.*)$/.exec(line);
        paragraph.push(item ? "• " + inlineMarkdown(item[1]) : inlineMarkdown(line));
    }
    flushParagraph();
    flushTable();
    return out.join("");
}

function renderLibraryTable(lines)
{
    const isSeparator = line => /^[\s|:-]+$/.test(line) && line.includes("-");
    const rows = lines
        .filter(line => !isSeparator(line))
        .map(line => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim()))
        .filter(cells => cells.some(Boolean));
    if (!rows.length)
    {
        return "";
    }
    // Шапка — если за первой строкой шёл разделитель `|---|`.
    const hasHead = lines.length > 1 && isSeparator(lines[1]);
    const cellsHtml = (cells, tag) => cells.map(c => "<" + tag + ">" + inlineMarkdown(c) + "</" + tag + ">").join("");
    return '<table class="homerule-library-table">'
        + (hasHead ? "<thead><tr>" + cellsHtml(rows[0], "th") + "</tr></thead>" : "")
        + "<tbody>" + rows.slice(hasHead ? 1 : 0).map(cells => "<tr>" + cellsHtml(cells, "td") + "</tr>").join("") + "</tbody>"
        + "</table>";
}

function inlineMarkdown(text)
{
    return foundry.utils.escapeHTML(text)
        // Marker оставляет в ячейках таблиц переносы `<br>` — их, и только их, возвращаем.
        .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, "$1<em>$2</em>");
}

/** Кнопка «Показать всем» в карточке: выложить фрагмент в общий чат. */
Hooks.on("renderChatMessageHTML", bindLibraryCard);
Hooks.on("renderChatMessage", bindLibraryCard);

function bindLibraryCard(message, element)
{
    const library = message?.flags?.[MODULE]?.library;
    const root = element instanceof HTMLElement ? element : element?.[0];
    if (!library || !root || root.dataset.homeruleLibrary)
    {
        return; // хук зовётся под двумя именами — привязываемся один раз
    }
    root.dataset.homeruleLibrary = "1";
    for (const button of root.querySelectorAll(".homerule-library-reveal"))
    {
        button.addEventListener("click", event =>
        {
            event.preventDefault();
            event.stopPropagation();
            const hit = library.hits?.[Number(button.dataset.index)];
            if (!hit || LIBRARY_SPOILER_TYPES.has(hit.type))
            {
                return;
            }
            ChatMessage.create({
                speaker: { alias: "Библиотека" },
                content: '<div class="wfrp4e chat-card homerule-library">'
                    + '<div class="test-title">' + libraryHeadHtml(hit) + "</div>"
                    + '<div class="homerule-library-text">' + renderLibraryMarkdown(hit.text) + "</div></div>"
            });
        });
    }
}

/**
 * Правило 6 (толкование стола). Разрубающее портит и черту «Броня».
 *
 * Книжное: Разрубающее оружие, кроме обычного урона, снимает 1 пункт с брони
 * (или щита) на поражённой зоне (Книга правил, «Достоинства оружия»). Черта
 * «Броня (класс)» даёт существу этот класс брони на всех зонах («Черты существ»).
 * Портит ли Разрубающее шкуру, книга прямо не говорит; за столом решено — портит,
 * по зоне попадания.
 *
 * Как устроено. Кнопка системы «Применить Разрубающее» (`opposed-result.js`,
 * `onApplyHack`) берёт только слои брони, у которых источник — предмет
 * (`physicalNonDamagedArmourAtLocation`), а у черты источник — эффект, и у
 * существа с одной чертой система отвечает «нет брони для повреждения». При
 * этом скрипт самой черты (`[Script.Vb7rgl8T4VRswbnZ]`, триггер `APCalc`) уже
 * вычитает повреждение по зонам из флага `wfrp4e.APdamage` на черте — модуль
 * только пишет в этот флаг. Рядом с системной кнопкой — своя, по черте; если
 * физических доспехов на зоне нет, системная кнопка прячется: она выдала бы
 * одну ошибку.
 */
const HACK_ARMOUR_SCRIPT = "Vb7rgl8T4VRswbnZ";

Hooks.on("renderChatMessageHTML", onRenderHackMessage);
Hooks.on("renderChatMessage", onRenderHackMessage);

function onRenderHackMessage(message, element)
{
    try
    {
        if (!game.settings.get(MODULE, HACK_SETTING))
        {
            return;
        }
        const root = element instanceof HTMLElement ? element : element?.[0];
        if (!root || root.dataset.homeruleHack)
        {
            return; // хук зовётся под двумя именами — привязываемся один раз
        }
        root.dataset.homeruleHack = "1"; // сразу: упадёт разбор — второй вызов не повторит ошибку
        const undo = message.flags?.[MODULE]?.hack;
        if (undo)
        {
            return addHackUndo(message, root, undo);
        }

        const systemButton = root.querySelector('button[data-action="applyHack"]');
        if (!systemButton)
        {
            return;
        }
        const test = message.system?.opposedTest;
        const defender = test?.defenderTest?.actor;
        const loc = test?.result?.hitloc?.value;
        if (!defender?.isOwner || !loc)
        {
            return;
        }
        const traits = armourTraitsAt(defender, loc);
        if (!traits.length)
        {
            return;
        }

        if (!(defender.physicalNonDamagedArmourAtLocation?.(loc) ?? []).length)
        {
            systemButton.style.display = "none"; // без доспехов на зоне системная кнопка — одна ошибка
        }
        const applied = hackAppliedFrom(message.id);
        for (const { trait } of traits)
        {
            const button = document.createElement("button");
            button.classList.add("homerule-hack-trait");
            button.dataset.traitUuid = trait.uuid;
            const done = applied.some(card => card.traitUuid === trait.uuid);
            button.textContent = done
                ? "Разрубающее по черте «" + trait.name + "» уже применено"
                : "Применить Разрубающее к черте «" + trait.name + "» (" + locationLabel(loc) + ")";
            button.disabled = done;
            button.addEventListener("click", event =>
            {
                event.preventDefault();
                event.stopPropagation();
                applyHackToTrait(message, test, trait, loc, button);
            });
            systemButton.after(button);
        }
    }
    catch (e)
    {
        console.error(MODULE + " | не удалось разобрать карточку для Разрубающего:", e);
    }
}

/**
 * Черты «Броня», которые защищают зону сейчас: слои брони, чей источник —
 * эффект черты со скриптом «Броня». Другие черты и эффекты, добавляющие класс
 * брони, повреждений не поддерживают — их не трогаем.
 */
function armourTraitsAt(actor, loc, { includeBroken = false } = {})
{
    const layers = actor.armour?.[loc]?.layers ?? actor.system?.status?.armour?.[loc]?.layers ?? [];
    const found = [];
    for (const layer of layers)
    {
        const effect = layer?.source;
        const trait = effect?.parent;
        const isArmourScript = (effect?.system?.scriptData ?? []).some(s => String(s?.script ?? "").includes(HACK_ARMOUR_SCRIPT));
        if ((includeBroken || layer.value > 0) && trait?.type === "trait" && isArmourScript && !found.some(f => f.trait === trait))
        {
            found.push({ trait, value: layer.value });
        }
    }
    return found;
}

function locationLabel(loc)
{
    const key = game.wfrp4e?.config?.locations?.[loc];
    return key ? game.i18n.localize(key) : loc;
}

/** Карточки по черте к этому сообщению, кроме отменённых; `kind` — "hack" или "crit". */
function hackAppliedFrom(messageId, kind = "hack")
{
    const recent = game.messages?.contents?.slice(-60) ?? [];
    return recent
        .map(msg => msg.flags?.[MODULE]?.hack)
        .filter(card => card?.sourceMessage === messageId && !card.undone && (card.kind ?? "hack") === kind);
}

/**
 * Сдвинуть повреждение черты «Броня» на зоне на `delta` (от 0 до класса черты).
 * Флаг `wfrp4e.APdamage` — `{зона: пункты}`; класс брони пересчитывает скрипт
 * черты сам. Возвращает `{before, after, max}` или `null`, если сдвигать некуда.
 */
async function stepArmourTraitDamage(trait, loc, delta)
{
    const max = parseInt(trait.system?.specification?.value) || 0;
    const damage = foundry.utils.deepClone(trait.getFlag("wfrp4e", "APdamage") ?? {});
    const before = Number(damage[loc]) || 0;
    const after = Math.min(max, Math.max(0, before + delta));
    if (after === before)
    {
        return null;
    }
    damage[loc] = after;
    await trait.setFlag("wfrp4e", "APdamage", damage);
    return { before, after, max };
}

async function applyHackToTrait(message, test, trait, loc, button)
{
    const actor = trait.parent;
    if (!actor?.isOwner)
    {
        return ui.notifications.error("Нет прав на это существо: Разрубающее применяет ведущий.");
    }
    if (hackAppliedFrom(message.id).some(card => card.traitUuid === trait.uuid))
    {
        return ui.notifications.warn("Разрубающее по этой черте уже применено.");
    }
    button.disabled = true;
    const step = await stepArmourTraitDamage(trait, loc, +1);
    if (!step)
    {
        button.disabled = false;
        return ui.notifications.warn("Черта «" + trait.name + "» на этой зоне уже не защищает.");
    }

    const esc = foundry.utils.escapeHTML;
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: test?.attackerTest?.actor }),
        content: "<p><strong>Разрубающее</strong>: черта «" + esc(trait.name) + "» у " + esc(actor.name)
            + ", " + esc(locationLabel(loc).toLowerCase()) + " — класс брони −1, осталось "
            + (step.max - step.after) + ".</p>",
        flags: { [MODULE]: { hack: { sourceMessage: message.id, traitUuid: trait.uuid, loc } } }
    });
}

/** Под карточкой повреждения — «Отменить» для того, кто вправе править существо. */
function addHackUndo(message, root, card)
{
    if (card.undone)
    {
        const note = document.createElement("p");
        note.classList.add("homerule-hack-undone");
        note.textContent = "Отменено.";
        (root.querySelector(".message-content") ?? root).append(note);
        return;
    }
    const trait = fromUuidSync(card.traitUuid);
    if (!trait?.parent?.isOwner || !message.isOwner)
    {
        return;
    }
    const link = document.createElement("a");
    link.classList.add("homerule-hack-undo");
    link.textContent = "Отменить";
    link.addEventListener("click", async event =>
    {
        event.preventDefault();
        event.stopPropagation();
        await stepArmourTraitDamage(trait, card.loc, -1);
        await message.setFlag(MODULE, "hack", { ...card, undone: true });
    });
    (root.querySelector(".message-content") ?? root).append(link);
}

/**
 * Правило 6б (толкование стола). Черта «Броня» отводит травму.
 *
 * Книжное («Повреждение брони» → «Предотвращение травмы»): травму зоны, прикрытой
 * бронёй, можно предотвратить, снизив класс этой брони на 1. Врезка говорит о
 * надетой броне; за столом решено — черта «Броня» отводит травму так же.
 *
 * Система предлагает отвод только в карточке атаки при критическом попадании и
 * только если у цели на зоне есть доспех-предмет (`attack-test.js`,
 * `canUseCriticalDeflection`); сам отвод лишь портит доспех
 * (`model/message/test.js`, `onApplyCriticalDeflection`). Здесь то же для черты:
 * ссылка рядом с травмой, пункт брони черты на зоне, травма зачёркивается.
 * Оговорку «атаку, игнорирующую класс брони, не отвести» система не проверяет —
 * не проверяет и модуль: это решает ведущий.
 */
Hooks.on("renderChatMessageHTML", onRenderCritDeflect);
Hooks.on("renderChatMessage", onRenderCritDeflect);

function onRenderCritDeflect(message, element)
{
    try
    {
        if (!game.settings.get(MODULE, CRIT_TRAIT_SETTING))
        {
            return;
        }
        const root = element instanceof HTMLElement ? element : element?.[0];
        if (!root || root.dataset.homeruleCritTrait)
        {
            return; // хук зовётся под двумя именами — привязываемся один раз
        }
        root.dataset.homeruleCritTrait = "1";
        const critLink = root.querySelector("a.critical-roll");
        if (!critLink || message.flags?.[MODULE]?.hack)
        {
            return;
        }
        const test = message.system?.test;
        const loc = test?.hitloc?.result;
        if (!test?.isCritical || !loc)
        {
            return;
        }
        const targets = (test.targets ?? []).filter(Boolean);
        const systemLink = root.querySelector('a[data-action="applyCriticalDeflection"]');
        if (systemLink && targets.every(t => !(t.physicalNonDamagedArmourAtLocation?.(loc) ?? []).length))
        {
            systemLink.style.display = "none"; // без доспехов на зоне системный отвод — одна ошибка
        }
        const applied = hackAppliedFrom(message.id, "crit");
        let anchor = systemLink && systemLink.style.display !== "none" ? systemLink : critLink;
        for (const target of targets)
        {
            if (!target.isOwner)
            {
                continue;
            }
            for (const { trait } of armourTraitsAt(target, loc))
            {
                const done = applied.some(card => card.traitUuid === trait.uuid);
                if (done)
                {
                    critLink.classList.add("nulled");
                }
                const link = document.createElement("a");
                link.classList.add("action-link", "homerule-crit-trait");
                if (done)
                {
                    link.classList.add("nulled");
                }
                link.textContent = (done ? "Травма отведена чертой «" : "Отвести травму за счёт черты «") + trait.name + "»"
                    + (targets.length > 1 ? " — " + target.name : "");
                if (!done)
                {
                    link.addEventListener("click", event =>
                    {
                        event.preventDefault();
                        event.stopPropagation();
                        applyCritTraitDeflect(message, trait, loc, link, critLink);
                    });
                }
                const br = document.createElement("br");
                anchor.after(br, link);
                anchor = link;
            }
        }
    }
    catch (e)
    {
        console.error(MODULE + " | не удалось разобрать карточку для отвода травмы чертой:", e);
    }
}

async function applyCritTraitDeflect(message, trait, loc, link, critLink)
{
    const actor = trait.parent;
    if (!actor?.isOwner)
    {
        return ui.notifications.error("Нет прав на это существо: травму отводит ведущий.");
    }
    if (link.dataset.spent || hackAppliedFrom(message.id, "crit").some(card => card.traitUuid === trait.uuid))
    {
        return ui.notifications.warn("Эта травма уже отведена.");
    }
    link.dataset.spent = "1";
    const step = await stepArmourTraitDamage(trait, loc, +1);
    if (!step)
    {
        delete link.dataset.spent;
        return ui.notifications.warn("Черта «" + trait.name + "» на этой зоне уже не защищает.");
    }
    link.classList.add("nulled");
    critLink?.classList.add("nulled");

    const esc = foundry.utils.escapeHTML;
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: "<p><strong>Травма отведена</strong>: черта «" + esc(trait.name) + "» у " + esc(actor.name)
            + ", " + esc(locationLabel(loc).toLowerCase()) + " — класс брони −1, осталось "
            + (step.max - step.after) + ".</p>"
            + "<p>Урон засчитывается полностью, дополнительные эффекты травмы не наступают.</p>",
        flags: { [MODULE]: { hack: { kind: "crit", sourceMessage: message.id, traitUuid: trait.uuid, loc } } }
    });
}

/**
 * Заплатка: порча и починка черты «Броня» с листа.
 *
 * Старый лист системы умел это правым и левым щелчком по итогу брони на зоне
 * (`_onArmourTotalClick`, сначала — черта «Броня»); его убрали в марте 2025
 * (коммит `36b05147f`), а новый блок брони по зонам (`armour-location.hbs`)
 * перечисляет только доспехи-предметы. Флаг `wfrp4e.APdamage` на черте с тех
 * пор никто не пишет, хотя скрипт черты его читает. Здесь в блок каждой зоны
 * добавляется строка черты: класс брони щёлкается так же, как у доспехов
 * (`stepProperty` с `data-reversed`): левый щелчок — починить, правый —
 * повредить, с Ctrl — по 10.
 */
const ARMOUR_LOCATIONS = ["head", "body", "lArm", "rArm", "lLeg", "rLeg"];

Hooks.on("renderActorSheetV2", (app, element) =>
{
    try
    {
        if (!game.settings.get(MODULE, TRAIT_SHEET_SETTING))
        {
            return;
        }
        const actor = app.document;
        const root = element instanceof HTMLElement ? element : element?.[0];
        const section = root?.querySelector(".armour-section");
        if (!actor || !section)
        {
            return;
        }
        const editable = Boolean(app.isEditable && actor.isOwner);
        section.querySelectorAll(".sheet-list").forEach((list, index) =>
        {
            const loc = armourListLocation(actor, list, index);
            const content = list.querySelector(".list-content");
            if (!loc || !content)
            {
                return;
            }
            for (const old of childrenWithClass(content, "homerule-trait-armour"))
            {
                old.remove();
            }
            // Черту ставим первой — старый лист тоже портил её первой.
            for (const { trait } of armourTraitsAt(actor, loc, { includeBroken: true }).reverse())
            {
                content.prepend(makeTraitArmourRow(trait, loc, editable));
            }
        });
    }
    catch (e)
    {
        console.error(MODULE + " | не удалось показать черту «Броня» на листе:", e);
    }
});

/** Зона блока брони: по подписи зоны, а если не узнали — по порядку в шаблоне. */
function armourListLocation(actor, list, index)
{
    const label = list.querySelector(".location-label")?.textContent?.trim();
    const byLabel = ARMOUR_LOCATIONS.find(loc => label && actor.armour?.[loc]?.label === label);
    return byLabel ?? ARMOUR_LOCATIONS[index] ?? null;
}

function makeTraitArmourRow(trait, loc, editable)
{
    const max = parseInt(trait.system?.specification?.value) || 0;
    const damage = Math.min(max, Number(trait.getFlag("wfrp4e", "APdamage")?.[loc]) || 0);
    const current = max - damage;

    const row = document.createElement("div");
    row.classList.add("list-row", "nocontext", "homerule-trait-armour");
    row.dataset.traitUuid = trait.uuid;
    const content = document.createElement("div");
    content.classList.add("row-content");
    const name = document.createElement("div");
    name.classList.add("list-name");
    if (trait.img)
    {
        const img = document.createElement("img");
        img.src = trait.img;
        name.append(img);
    }
    const label = document.createElement("a");
    label.classList.add("label");
    label.textContent = trait.name;
    name.append(label);

    const value = document.createElement("a");
    value.classList.add("small", "prevent-context", "ap-value");
    if (damage)
    {
        value.classList.add("item-damaged");
    }
    value.textContent = String(current);
    value.dataset.tooltip = "Текущий: " + current + ", наибольший: " + max + " (" + damage + " урона)"
        + (editable ? " · левый щелчок — починить, правый — повредить" : "");
    if (editable)
    {
        const step = (event, delta) =>
        {
            event.preventDefault();
            event.stopPropagation();
            stepArmourTraitDamage(trait, loc, event.ctrlKey ? delta * 10 : delta);
        };
        value.addEventListener("click", event => step(event, -1));
        value.addEventListener("contextmenu", event => step(event, +1));
    }
    content.append(name, value);
    row.append(content);
    return row;
}

/**
 * Удобство 7. Сводка по партии — окно ведущего.
 *
 * Все персонажи игроков разом: здоровье, удача и судьба, решимость и упорство,
 * порча, преимущество, состояния. Обновляется само при любой правке персонажа
 * или его эффектов. Кнопка — на панели инструментов токенов (только ведущему);
 * из макроса — `game.modules.get("wfrp4e-homerules").api.openPartyOverview()`.
 *
 * Партия — персонажи, назначенные игрокам в настройках пользователей; если никто
 * не назначен — персонажи, которыми владеет хоть один игрок. Поля — из модели
 * системы (`model/actor/components/status.js`): удача, судьба, решимость и
 * упорство есть только у персонажей игроков; состояния — эффекты с
 * `isCondition`, уровень — `conditionValue` (`effect-wfrp4e.js`).
 */
const PARTY_SETTING = "partyOverview";
const PARTY_DANGER = new Set(["ablaze", "bleeding", "poisoned", "unconscious", "defeated"]);

let partyApp = null;
let partyAppClass = null;
let partyRerender = null;

function partyMembers()
{
    const assigned = (game.users?.contents ?? [])
        .filter(user => !user.isGM && user.character)
        .map(user => user.character);
    const unique = [...new Map(assigned.map(actor => [actor.id, actor])).values()];
    if (unique.length)
    {
        return unique;
    }
    return (game.actors?.contents ?? []).filter(actor => actor.type === "character" && actor.hasPlayerOwner);
}

function partyNumber(value)
{
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

/** Данные строки: то, что показываем, без разметки. */
function partyRow(actor)
{
    const status = actor.system?.status ?? {};
    const hasFortune = status.fortune !== undefined;
    const pips = (value, max) => ({ value: partyNumber(value), max: Math.max(partyNumber(max), partyNumber(value)) });
    return {
        id: actor.id,
        name: actor.name,
        img: actor.img,
        wounds: { value: partyNumber(status.wounds?.value), max: partyNumber(status.wounds?.max) },
        fortune: hasFortune ? pips(status.fortune?.value, status.fate?.value) : null,
        resolve: hasFortune ? pips(status.resolve?.value, status.resilience?.value) : null,
        corruption: { value: partyNumber(status.corruption?.value), max: partyNumber(status.corruption?.max) },
        advantage: partyNumber(status.advantage?.value),
        conditions: (actor.effects?.contents ?? Array.from(actor.effects ?? []))
            .filter(effect => effect.isCondition && !effect.disabled)
            .map(effect => ({
                key: effect.conditionId,
                name: effect.name,
                // У состояния без уровня («Сбит с ног») значение null; Number(null) дал бы 0.
                value: effect.conditionValue == null || !Number.isFinite(Number(effect.conditionValue)) ? null : Number(effect.conditionValue),
                danger: PARTY_DANGER.has(effect.conditionId)
            }))
    };
}

function woundsLevel(wounds)
{
    const ratio = wounds.max > 0 ? wounds.value / wounds.max : 0;
    return ratio <= 1 / 3 ? "danger" : (ratio <= 2 / 3 ? "warning" : "ok");
}

function partyHtml(rows, sortByWounds)
{
    const esc = foundry.utils.escapeHTML;
    const sorted = sortByWounds
        ? [...rows].sort((a, b) => (a.wounds.max ? a.wounds.value / a.wounds.max : 0) - (b.wounds.max ? b.wounds.value / b.wounds.max : 0))
        : rows;
    const pips = p => p
        ? Array.from({ length: p.max }, (_, i) => '<span class="homerule-party-pip' + (i < p.value ? " filled" : "") + '"></span>').join("")
          + '<span class="homerule-party-num">' + p.value + "</span>"
        : '<span class="homerule-party-muted">—</span>';
    const bar = (value, max, cls) =>
        '<div class="homerule-party-bar ' + cls + '"><i style="width:' + (max > 0 ? Math.round(Math.min(1, value / max) * 100) : 0) + '%"></i></div>'
        + '<span class="homerule-party-num">' + value + " / " + max + "</span>";
    const head = '<div class="homerule-party-row homerule-party-head">'
        + "<span>Персонаж</span><span>Здоровье</span><span>Удача</span><span>Решимость</span><span>Порча</span>"
        + '<span title="Преимущество">Пр.</span><span>Состояния</span><span></span></div>';
    if (!sorted.length)
    {
        return head + '<p class="homerule-party-empty">Игрокам не назначены персонажи — назначь их в настройках пользователей.</p>';
    }
    const body = sorted.map(row =>
        '<div class="homerule-party-row" data-actor-id="' + esc(row.id) + '">'
        + '<div class="homerule-party-name">' + (row.img ? '<img src="' + esc(row.img) + '" alt="">' : "") + "<span>" + esc(row.name) + "</span></div>"
        + "<div>" + bar(row.wounds.value, row.wounds.max, woundsLevel(row.wounds)) + "</div>"
        + '<div title="Удача / судьба">' + pips(row.fortune) + "</div>"
        + '<div title="Решимость / упорство">' + pips(row.resolve) + "</div>"
        + "<div>" + bar(row.corruption.value, row.corruption.max, "corruption") + "</div>"
        + '<div class="homerule-party-adv">' + (row.advantage || '<span class="homerule-party-muted">—</span>') + "</div>"
        + '<div class="homerule-party-conditions">' + (row.conditions.length
            ? row.conditions.map(c => '<span class="homerule-party-chip' + (c.danger ? " danger" : "") + '">'
                + esc(c.name) + (c.value !== null && c.value > 1 ? " " + c.value : "") + "</span>").join("")
            : '<span class="homerule-party-muted">нет</span>') + "</div>"
        + '<div class="homerule-party-actions">'
        + '<a data-action="openSheet" data-tooltip="Открыть лист"><i class="fas fa-id-card"></i></a>'
        + '<a data-action="panToToken" data-tooltip="Показать токен на карте"><i class="fas fa-crosshairs"></i></a>'
        + "</div></div>").join("");
    return head + body;
}

/** Класс окна создаётся при первом открытии: `ApplicationV2` есть только в загруженном ядре. */
function partyOverviewClass()
{
    if (partyAppClass)
    {
        return partyAppClass;
    }
    partyAppClass = class HomerulePartyOverview extends foundry.applications.api.ApplicationV2
    {
        static DEFAULT_OPTIONS = {
            id: "homerule-party-overview",
            classes: ["homerule-party"],
            window: { title: "Партия", icon: "fas fa-users", resizable: true },
            position: { width: 720, height: "auto" },
            actions: {
                openSheet: HomerulePartyOverview.onOpenSheet,
                panToToken: HomerulePartyOverview.onPanToToken,
                toggleSort: HomerulePartyOverview.onToggleSort
            }
        };

        sortByWounds = false;

        get title()
        {
            return "Партия" + (game.world?.title ? " · " + game.world.title : "");
        }

        async _prepareContext()
        {
            return { rows: partyMembers().map(partyRow) };
        }

        async _renderHTML(context)
        {
            const body = document.createElement("div");
            body.classList.add("homerule-party-body");
            body.innerHTML = '<div class="homerule-party-toolbar">'
                + '<span class="homerule-party-muted">обновляется само</span>'
                + '<button type="button" data-action="toggleSort">'
                + (this.sortByWounds ? "Как в партии" : "Сначала раненые") + "</button></div>"
                + partyHtml(context.rows, this.sortByWounds);
            return body;
        }

        _replaceHTML(result, content)
        {
            content.replaceChildren(result);
        }

        static onOpenSheet(event, target)
        {
            const id = target.closest("[data-actor-id]")?.dataset.actorId;
            game.actors?.get(id)?.sheet?.render(true);
        }

        static onPanToToken(event, target)
        {
            const id = target.closest("[data-actor-id]")?.dataset.actorId;
            const token = canvas?.tokens?.placeables?.find(t => t.actor?.id === id);
            if (!token)
            {
                return ui.notifications.info("Токена этого персонажа на сцене нет.");
            }
            canvas.animatePan?.({ x: token.center.x, y: token.center.y });
            canvas.ping?.(token.center);
        }

        static onToggleSort()
        {
            this.sortByWounds = !this.sortByWounds;
            this.render();
        }
    };
    return partyAppClass;
}

function openPartyOverview()
{
    partyApp ??= new (partyOverviewClass())();
    return partyApp.render({ force: true });
}

Hooks.once("ready", () =>
{
    const module = game.modules?.get(MODULE);
    if (module)
    {
        module.api = { ...(module.api ?? {}), openPartyOverview };
    }
});

/** Кнопка на панели инструментов токенов, только ведущему. v13+ — объект, v11–12 — массив. */
Hooks.on("getSceneControlButtons", controls =>
{
    if (!game.user?.isGM || !game.settings.get(MODULE, PARTY_SETTING))
    {
        return;
    }
    const tool = {
        name: "homerule-party",
        title: "Сводка по партии",
        icon: "fas fa-users",
        button: true,
        visible: true,
        onClick: () => openPartyOverview(),
        onChange: () => openPartyOverview()
    };
    try
    {
        if (Array.isArray(controls))
        {
            controls.find(c => c.name === "token")?.tools?.push(tool);
        }
        else if (controls && typeof controls === "object")
        {
            const tokens = controls.tokens ?? controls.token;
            if (tokens?.tools)
            {
                tokens.tools[tool.name] = { ...tool, order: 90 };
            }
        }
    }
    catch (e)
    {
        console.warn(MODULE + " | не удалось добавить кнопку сводки по партии:", e);
    }
});

/** Правка персонажа партии или его эффектов — перерисовать открытое окно (не чаще раза в 150 мс). */
function partyChanged(actor)
{
    if (!partyApp?.rendered || !actor || !partyMembers().some(member => member.id === actor.id))
    {
        return;
    }
    partyRerender ??= foundry.utils.debounce(() => partyApp?.rendered && partyApp.render(), 150);
    partyRerender();
}

Hooks.on("updateActor", actor => partyChanged(actor));
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
{
    Hooks.on(hook, effect => partyChanged(effect?.parent?.documentName === "Actor" ? effect.parent : null));
}
Hooks.on("updateUser", () => partyApp?.rendered && partyApp.render());

/**
 * Удобство 8. Рывок из меню токена.
 *
 * Книга правил, «Перемещение» → «Рывок»: рывок — действие в свой ход, проверка
 * атлетики (+20); сверх перемещения персонаж пробегает ещё свой бег + уровень
 * успеха ярдов. Пример книги: скорость 4, уровень успеха –2 — на 14 ярдов больше.
 *
 * Как устроено. Кнопка в меню токена зовёт проверку навыка системы
 * (`setupSkill`, сложность `average` = +20) с ярлыком в context. Карточку
 * проверки ловим по ярлыку (`preData.options`, переживает переброс за удачу);
 * бросивший пишет во флаг актёра прибавку: бег + УУ, не меньше нуля. Линейка
 * системы (`TokenRulerWFRP`) берёт предел из `actor.system.movementDistance.walk`
 * = [шаг, бег]; модуль оборачивает этот геттер и, пока рывок действует, отдаёт
 * [шаг, бег + прибавка]: жёлтая полоса удлиняется, красная начинается дальше.
 *
 * Сколько действует: в бою — до конца раунда, в котором сделан рывок (история
 * перемещений за ход у ядра копится, предел сравнивается с суммой); вне боя —
 * до следующего перемещения токена, но не дольше пяти минут.
 */
const SPRINT_FLAG = "sprint";
const SPRINT_TAG = "homerulesSprint";
const SPRINT_LOOSE_MS = 5 * 60 * 1000;
/** Бегают персонажи, НПС и существа; у повозки своя скорость, рывка нет. */
const SPRINT_ACTOR_TYPES = ["character", "npc", "creature"];

/** Бой, в котором участвует актёр (токен-актёр сверяем по uuid). */
function sprintCombatOf(actor)
{
    if (!actor)
    {
        return null;
    }
    return (game.combats?.contents ?? []).find(combat => combat.started
        && (combat.combatants?.contents ?? Array.from(combat.combatants ?? []))
            .some(combatant => combatant.actor?.uuid === actor.uuid)) ?? null;
}

function sprintRun(actor)
{
    const run = Number(actor?.system?.details?.move?.run);
    return Number.isFinite(run) ? run : 0;
}

function sprintSL(value)
{
    const sl = Number.parseInt(String(value ?? "0"), 10);
    return Number.isFinite(sl) ? sl : 0;
}

/** Прибавка по правилу: ещё бег + УУ ярдов; при большом минусе — ноль, не отнимаем. */
function sprintExtra(run, sl)
{
    return Math.max(0, run + sl);
}

function signedSL(sl)
{
    return sl < 0 ? "–" + Math.abs(sl) : "+" + sl;
}

/** Действующий рывок актёра или null. Устаревший флаг просто не читается. */
function sprintBonus(actor)
{
    if (!game.settings.get(MODULE, SPRINT_SETTING))
    {
        return null;
    }
    const flag = actor?.flags?.[MODULE]?.[SPRINT_FLAG];
    if (!flag || !(Number(flag.extra) > 0))
    {
        return null;
    }
    if (flag.combat)
    {
        const combat = game.combats?.get(flag.combat);
        return combat?.started && combat.round === flag.round ? flag : null;
    }
    if (sprintCombatOf(actor) || !(Date.now() - Number(flag.at) < SPRINT_LOOSE_MS))
    {
        return null;
    }
    return flag;
}

/** Оборачиваем `movementDistance` там, где он объявлен (у персонажа, НПС и существа — общий предок). */
function wrapMovementDistance()
{
    const owners = new Set();
    for (const type of SPRINT_ACTOR_TYPES)
    {
        let proto = CONFIG.Actor?.dataModels?.[type]?.prototype;
        while (proto && !Object.prototype.hasOwnProperty.call(proto, "movementDistance"))
        {
            proto = Object.getPrototypeOf(proto);
        }
        if (proto)
        {
            owners.add(proto);
        }
    }
    for (const proto of owners)
    {
        const descriptor = Object.getOwnPropertyDescriptor(proto, "movementDistance");
        if (typeof descriptor?.get !== "function" || descriptor.get.homeruleSprint)
        {
            continue;
        }
        const original = descriptor.get;
        const get = function ()
        {
            const distance = original.call(this);
            const bonus = sprintBonus(this.parent);
            if (!bonus || !Array.isArray(distance?.walk))
            {
                return distance;
            }
            return { ...distance, walk: [distance.walk[0], distance.walk[1] + Number(bonus.extra)] };
        };
        get.homeruleSprint = true;
        Object.defineProperty(proto, "movementDistance", { ...descriptor, get });
    }
}

async function startSprint(actor)
{
    if (!actor?.isOwner)
    {
        return ui.notifications.warn("Рывок может сделать только тот, кто владеет персонажем.");
    }
    if (!SPRINT_ACTOR_TYPES.includes(actor.type))
    {
        return ui.notifications.warn("Рывок бывает у персонажей, НПС и существ, у повозки его нет.");
    }
    const active = sprintBonus(actor);
    if (active)
    {
        const again = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Рывок" },
            content: "<p>" + foundry.utils.escapeHTML(actor.name) + " уже сделал рывок: ещё " + active.extra
                + " ярдов. Бросить заново? Прежний результат заменится новым.</p>"
        });
        if (!again)
        {
            return;
        }
    }
    try
    {
        const test = await actor.setupSkill(game.i18n.localize("NAME.Athletics"), {
            appendTitle: " — Рывок",
            fields: { difficulty: "average" },
            [SPRINT_TAG]: actor.uuid
        });
        if (!test)
        {
            return; // окно проверки закрыли
        }
        await test.roll();
    }
    catch (e)
    {
        console.error(MODULE + " | рывок не удался:", e);
        ui.notifications.error("Рывок: " + e.message);
    }
}

/** Карточка проверки рывка создана или поправлена (+1 УУ за удачу) — бросивший пишет прибавку. */
async function onSprintMessage(message, isUpdate)
{
    try
    {
        const tag = message?.system?.testData?.preData?.options?.[SPRINT_TAG];
        if (!tag || !game.settings.get(MODULE, SPRINT_SETTING))
        {
            return;
        }
        if ((message.author?.id ?? message.user?.id ?? message.author) !== game.user.id)
        {
            return; // пишет один клиент — тот, кто бросал
        }
        const actor = fromUuidSync(tag);
        if (!actor?.isOwner)
        {
            return;
        }
        const previous = actor.flags?.[MODULE]?.[SPRINT_FLAG];
        if (isUpdate && previous?.message !== message.id)
        {
            return; // правка старой карточки не воскрешает прошлый рывок
        }
        const sl = sprintSL(message.system?.test?.result?.SL ?? message.system?.testData?.result?.SL);
        const run = sprintRun(actor);
        const combat = sprintCombatOf(actor);
        const flag = {
            extra: sprintExtra(run, sl),
            run,
            sl,
            message: message.id,
            combat: combat?.id ?? null,
            round: combat?.round ?? null,
            at: isUpdate && previous?.at ? previous.at : Date.now()
        };
        if (isUpdate && previous && ["extra", "run", "sl"].every(key => previous[key] === flag[key]))
        {
            return;
        }
        await actor.setFlag(MODULE, SPRINT_FLAG, flag);
        if (!isUpdate)
        {
            ui.notifications.info(`Рывок: ${actor.name} пробегает ещё ${flag.extra} ярдов. Линейка перемещения это учитывает`
                + (flag.combat ? " до конца раунда." : " до следующего перемещения."));
        }
    }
    catch (e)
    {
        console.error(MODULE + " | не удалось записать рывок:", e);
    }
}

Hooks.on("createChatMessage", message => onSprintMessage(message, false));
Hooks.on("updateChatMessage", message => onSprintMessage(message, true));

/** Вне боя рывок — на одно перемещение: первое же перемещение токена его снимает. */
Hooks.on("moveToken", (token, movement, operation, user) =>
{
    if ((user?.id ?? user) !== game.user.id)
    {
        return;
    }
    const actor = token?.actor;
    const flag = actor?.flags?.[MODULE]?.[SPRINT_FLAG];
    if (!flag || flag.combat || !actor.isOwner)
    {
        return;
    }
    actor.unsetFlag(MODULE, SPRINT_FLAG).catch(e => console.error(MODULE + " | не удалось снять рывок:", e));
});

/** Строка под карточкой проверки рывка: сколько ярдов добавилось. */
Hooks.on("renderChatMessageHTML", onRenderSprintMessage);
Hooks.on("renderChatMessage", onRenderSprintMessage);

function onRenderSprintMessage(message, element)
{
    try
    {
        const tag = message?.system?.testData?.preData?.options?.[SPRINT_TAG];
        const root = element instanceof HTMLElement ? element : element?.[0];
        if (!tag || !root || root.dataset.homeruleSprint || !game.settings.get(MODULE, SPRINT_SETTING))
        {
            return;
        }
        root.dataset.homeruleSprint = "1";
        const actor = fromUuidSync(tag);
        const run = sprintRun(actor);
        const sl = sprintSL(message.system?.test?.result?.SL ?? message.system?.testData?.result?.SL);
        const note = document.createElement("div");
        note.classList.add("homerule-sprint-note");
        note.innerHTML = '<i class="fas fa-person-running"></i> Рывок: ещё <b>' + sprintExtra(run, sl)
            + "</b> ярдов (бег " + run + ", УУ " + signedSL(sl) + ")";
        (root.querySelector(".message-content") ?? root).append(note);
    }
    catch (e)
    {
        console.error(MODULE + " | не удалось подписать карточку рывка:", e);
    }
}

/** Кнопка в левой колонке меню токена, рядом с кнопками ядра. */
Hooks.on("renderTokenHUD", (hud, element) =>
{
    try
    {
        if (!game.settings.get(MODULE, SPRINT_SETTING))
        {
            return;
        }
        const root = element instanceof HTMLElement ? element : element?.[0];
        const actor = hud?.object?.actor ?? hud?.document?.actor;
        const column = root?.querySelector(".col.left");
        if (!column || column.querySelector(".homerule-sprint") || !actor?.isOwner || !SPRINT_ACTOR_TYPES.includes(actor.type))
        {
            return;
        }
        const bonus = sprintBonus(actor);
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("control-icon", "homerule-sprint");
        if (bonus)
        {
            button.classList.add("active");
        }
        button.dataset.tooltip = bonus
            ? "Рывок сделан: ещё " + bonus.extra + " ярдов. Щелчок — бросить заново"
            : "Рывок: проверка атлетики (+20), к перемещению — ещё бег + УУ ярдов";
        button.setAttribute("aria-label", "Рывок");
        button.innerHTML = '<i class="fa-solid fa-person-running" inert></i>';
        button.addEventListener("click", event =>
        {
            event.preventDefault();
            event.stopPropagation();
            hud.close?.();
            startSprint(actor);
        });
        column.append(button);
    }
    catch (e)
    {
        console.error(MODULE + " | не удалось добавить кнопку рывка:", e);
    }
});

/**
 * Предмет 9. Девятнадцатая длань Воланса.
 *
 * «Приключения в Убершрейке», том 1, «Подарок Сибиллы»: носящий Длань может
 * развеивать заклинания по правилам Книги правил (стр. 237), но не уже
 * сотворённые поддерживаемые; без навыка «Язык (магический)» вместо него
 * проходит проверку силы воли.
 *
 * Почему в игре не работало. Предмет компендиума `wfrp4e-ua1` (The Nineteenth Palm
 * of Volans, в мире «Девятнадцатая длань Воланса») — простая вещь без эффектов.
 * Кнопка «Развеять» на карточке заклинания зовёт `actor.setupDispel(test)`, а тот
 * ищет навык «Язык (магический)» и без него бросает ошибку.
 *
 * Как устроено. Оборачиваем `setupDispel`: навык есть — всё как у системы; навыка
 * нет, но Длань надета — проверка силы воли с ярлыком (id карточки заклинания).
 * Карточка проверки создана — клиент, который у системы ведёт карточку заклинания
 * (`getActiveDocumentOwner`), передаёт результат её проверке: `updateDispel` в 4-й
 * редакции, `dispel` в 5-й. Ровно так делает `SkillTest.handleDispel` системы,
 * поэтому дальше всё по-системному: уровень успеха развеивания вычитается из
 * уровня успеха сотворения, переброс за удачу пересчитывает.
 *
 * Чего не делает. Не проверяет дальность ([сила воли] ярдов), раз в раунд и то,
 * что заклинание ещё сотворяется, — этого не проверяет и система при обычном
 * развеивании. Длительные заклинания кнопкой «Развеять» не снимаются и у системы.
 */
const PALM_TAG = "homerulesPalmDispel";
const PALM_SOURCE_ID = "76P6iODnOpT8JLfu";

function isVolansPalm(item)
{
    if (item?.type !== "trapping")
    {
        return false;
    }
    const source = String(item._stats?.compendiumSource ?? "");
    const original = String(item.flags?.babele?.originalName ?? "");
    const name = String(item.name ?? "");
    return source.endsWith(PALM_SOURCE_ID)
        || /palm of volans/i.test(original) || /palm of volans/i.test(name)
        || (/воланс/i.test(name) && /длан|ладон/i.test(name));
}

/** Навык так же, как его ищет `setupDispel` системы. */
function languageMagick(actor)
{
    const wanted = `${game.i18n.localize("NAME.Language")} (${game.i18n.localize("SPEC.Magick")})`.toLowerCase();
    return (actor?.itemTypes?.skill ?? []).find(skill => String(skill.name).toLowerCase() === wanted) ?? null;
}

function wrapSetupDispel()
{
    const proto = CONFIG.Actor?.documentClass?.prototype;
    const original = proto?.setupDispel;
    if (typeof original !== "function" || original.homerulePalm)
    {
        return;
    }
    const wrapped = async function (test)
    {
        if (!game.settings.get(MODULE, PALM_SETTING) || languageMagick(this))
        {
            return original.call(this, test);
        }
        const palms = (this.items?.contents ?? Array.from(this.items ?? [])).filter(isVolansPalm);
        if (!palms.length)
        {
            return original.call(this, test);
        }
        if (!palms.some(palm => palm.isEquipped ?? palm.system?.isEquipped))
        {
            throw new Error(this.name + ": Девятнадцатая длань Воланса не надета. Наденьте её на листе — тогда можно развеивать силой воли.");
        }
        const dispelTest = await this.setupCharacteristic("wp", {
            appendTitle: " — Развеивание (Девятнадцатая длань Воланса)",
            [PALM_TAG]: test.message.id
        });
        // Окно закрыли: обработчик кнопки системы зовёт `test.roll()` без проверки — отдаём пустышку.
        return dispelTest ?? { roll() {} };
    };
    wrapped.homerulePalm = true;
    proto.setupDispel = wrapped;
}

/** Карточка проверки силы воли от Длани создана — результат уходит проверке сотворения. */
Hooks.on("createChatMessage", message =>
{
    try
    {
        const castId = message?.system?.testData?.preData?.options?.[PALM_TAG];
        if (!castId || !game.settings.get(MODULE, PALM_SETTING))
        {
            return;
        }
        const cast = game.messages?.get(castId);
        if (!cast || game.user.id !== warhammer.utility.getActiveDocumentOwner(cast)?.id)
        {
            return;
        }
        const castTest = cast.system?.test;
        const dispelTest = message.system?.test;
        if (!castTest || !dispelTest)
        {
            return;
        }
        if (typeof castTest.updateDispel === "function")
        {
            castTest.updateDispel(dispelTest);
        }
        else if (typeof castTest.dispel === "function")
        {
            castTest.dispel(dispelTest);
        }
    }
    catch (e)
    {
        console.error(MODULE + " | Длань Воланса: не удалось развеять:", e);
    }
});

Hooks.once("setup", () =>
{
    try
    {
        wrapMovementDistance();
    }
    catch (e)
    {
        console.error(MODULE + " | рывок: не удалось встроиться в линейку:", e);
    }
    try
    {
        wrapSetupDispel();
    }
    catch (e)
    {
        console.error(MODULE + " | Длань Воланса: не удалось встроиться в развеивание:", e);
    }
});

Hooks.once("ready", () =>
{
    const module = game.modules?.get(MODULE);
    if (module)
    {
        module.api = { ...(module.api ?? {}), startSprint };
    }
});
