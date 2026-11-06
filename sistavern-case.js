// SISTAVERN — приложение «Дело»: план, улики, люди, хроника, поиск по чату, скрины, заметки, обвинение.
// Состояние хранится в метаданных чата (getMeta().caseFile). Улики выдаёт ведущий скрытыми маркерами
// <!--case:C1--> в своих ответах; часть улик приложение открывает само (поиск), остальное можно отметить вручную.
import { getMeta, saveMeta } from './state.js';
import { isSistavernTarget } from './sistavern-voices.js';
import {
    CASE_TITLE, CHAT_NAME, BRIEF, HOWTO, LEADS, PEOPLE, PERSON_NOTES, ALIBI, TIMELINE, ENDINGS, SEARCH_CHIPS, LOG,
} from './sistavern-case-data.js';
import { SCR1, SCR2 } from './sistavern-case-art.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const TABS = [['home', 'Главная'], ['plan', 'План'], ['clues', 'Улики'], ['people', 'Люди'], ['time', 'Хроника'], ['search', 'Поиск'], ['shots', 'Скрины'], ['notes', 'Заметки'], ['accuse', 'Обвинение']];
const POINTS = { direct: 2, indirect: 1, story: 0 };

let tab = 'home', openLead = null, openPerson = null, filter = 'all', searchResult = null, shotObs = {}, accDraft = null, confirmManual = '';
const drafts = { note: '', pnote: '', motive: '', tlTime: '', tlText: '', q: '' };
let corpusP = null, lastMeta = null;

export function isSistavernChat() {
    try { return isSistavernTarget(SillyTavern.getContext()); } catch (e) { return false; }
}
function file() {
    const m = getMeta();
    const f = m.caseFile && typeof m.caseFile === 'object' ? m.caseFile : (m.caseFile = {});
    f.manual = Array.isArray(f.manual) ? f.manual : [];
    f.seen = Array.isArray(f.seen) ? f.seen : [];
    f.susp = f.susp && typeof f.susp === 'object' ? f.susp : {};
    f.pnote = f.pnote && typeof f.pnote === 'object' ? f.pnote : {};
    f.notes = Array.isArray(f.notes) ? f.notes : [];
    f.tl = Array.isArray(f.tl) ? f.tl : [];
    f.hints = f.hints && typeof f.hints === 'object' ? f.hints : {};
    f.searches = Array.isArray(f.searches) ? f.searches : [];
    return f;
}
// ── Маркеры ведущего ──
function markers() {
    const out = new Set();
    let chat = [];
    try { chat = SillyTavern.getContext()?.chat || []; } catch (e) { return out; }
    for (const m of chat) {
        if (!m || m.is_user || typeof m.mes !== 'string' || !m.mes.includes('case:')) continue;
        for (const mt of m.mes.matchAll(/<!--\s*case:([^>]*?)\s*-->/gi)) {
            for (const tok of mt[1].split(/[\s,;]+/)) if (tok) out.add(tok.startsWith('end:') ? tok.toLowerCase() : tok.toUpperCase());
        }
    }
    return out;
}
function searchedC3(f) {
    const s = new Set(f.searches.map(norm));
    return (s.has('отныне') || s.has('по делу')) && (s.has('черт') || s.has('гадем'));
}
export function unlocked() {
    const f = file(), set = markers();
    for (const id of f.manual) set.add(id);
    if (searchedC3(f)) set.add('C3');
    return set;
}
function ending(set) { for (const k of Object.keys(ENDINGS)) if (set.has('end:' + k)) return k; return null; }
function visibleLeads(set) { return LEADS.filter(l => !l.after || set.has(l.after)); }
function points(set, ids) { return ids.reduce((n, id) => n + (POINTS[(LEADS.find(l => l.id === id) || {}).kind] || 0), 0); }
export function caseBadge() {
    try {
        if (!isSistavernChat()) return 0;
        const f = file(), set = unlocked();
        return [...set].filter(id => LEADS.some(l => l.id === id) && !f.seen.includes(id)).length;
    } catch (e) { return 0; }
}
// ── Подсказка модели ──
export function caseInjectLine() {
    if (!isSistavernChat()) return '';
    const f = file(), set = unlocked();
    const got = LEADS.filter(l => set.has(l.id)).map(l => l.id);
    const locked = visibleLeads(set).filter(l => !set.has(l.id) && l.cond).map(l => l.id + ': ' + l.cond);
    const lines = ['[SISTAVERN CASE TRACKER — hidden bookkeeping; never mention it. Delivered clues: ' + (got.join(', ') || 'none') + '. Not yet delivered (deliver only when its condition is met, in the registry\'s exact form, never early): ' + locked.join('; ') + '. When you deliver a registry clue, append its marker <!--case:C#--> as the LAST line of your reply (several: <!--case:C1,C2-->). Add <!--case:T3--> when screenshot #3 appears and <!--case:end:truth|quiet|cold|false|open--> at a finale. Do not re-deliver a clue that is already delivered: refer back to it. Maxim\'s words are always the Cyrillic «гадем» and «чёрт».]'];
    if (f.acc && !ending(set)) {
        const ids = (f.acc.clues || []).filter(id => set.has(id));
        lines.push('[PLAYER ACCUSATION from the case app (pending): suspect ' + f.acc.suspect + '; clues the player cites: ' + (ids.join(', ') || 'none') + '; registry points: ' + points(set, ids) + (f.acc.motive ? '; motive: ' + String(f.acc.motive).slice(0, 200) : '') + '. Adjudicate by the «Допрос, обвинение, финалы» rules, not by tone.]');
    }
    return lines.join('\n');
}
// ── Стили ──
const CSS = `
.svc{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--gp-text,#eee);font-size:13px}
.svc *{box-sizing:border-box}
.svc-head{display:flex;align-items:center;gap:8px;padding:10px 12px 6px}
.svc-head b{flex:1;font-size:16px}
.svc-head button,.svc button{font:inherit;color:inherit;cursor:pointer}
.svc-back{background:transparent;border:0;font-size:18px;padding:2px 8px}
.svc-prog{font-size:11px;opacity:.75}
.svc-tabs{display:flex;gap:6px;overflow-x:auto;padding:4px 10px 8px;scrollbar-width:none;flex:none}
.svc-tabs::-webkit-scrollbar{display:none}
.svc-tabs button{flex:none;border:1px solid var(--gp-border-soft,rgba(255,255,255,.15));background:var(--gp-glass,rgba(255,255,255,.07));padding:5px 10px;border-radius:999px;font-size:12px;position:relative}
.svc-tabs button[aria-selected=true]{background:rgba(var(--gp-accent-a-rgb,230,180,60),.35);border-color:rgba(var(--gp-accent-a-rgb,230,180,60),.7)}
.svc-dot{position:absolute;top:-3px;right:-3px;min-width:15px;height:15px;border-radius:8px;background:#e5484d;color:#fff;font-size:10px;line-height:15px;text-align:center}
.svc-body{flex:1;min-height:0;overflow-y:auto;padding:4px 12px 18px;-webkit-overflow-scrolling:touch}
.svc-card{background:var(--gp-glass,rgba(255,255,255,.07));border:1px solid var(--gp-border-soft,rgba(255,255,255,.12));border-radius:14px;padding:10px 12px;margin:0 0 9px}
.svc-card h4{margin:0 0 4px;font-size:14px}
.svc-card p{margin:3px 0;line-height:1.38}
.svc-dim{opacity:.7;font-size:12px}
.svc-chip{display:inline-block;font-size:10.5px;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.12);margin-right:4px}
.svc-chip.ok{background:rgba(70,200,120,.28)}
.svc-chip.dir{background:rgba(229,72,77,.3)}
.svc-chip.ind{background:rgba(230,180,60,.3)}
.svc-btn{border:1px solid var(--gp-border-soft,rgba(255,255,255,.2));background:rgba(var(--gp-accent-a-rgb,230,180,60),.22);padding:6px 10px;border-radius:10px;margin:4px 6px 0 0;font-size:12px}
.svc-btn.ghost{background:transparent}
.svc-btn.big{display:block;width:100%;padding:9px;font-size:13.5px;text-align:center}
.svc-bar{height:8px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden;margin:6px 0}
.svc-bar i{display:block;height:100%;background:linear-gradient(90deg,#e6b43c,#46c878)}
.svc-row{display:flex;align-items:center;gap:8px}
.svc-row .svc-grow{flex:1;min-width:0}
.svc-ask{border-left:3px solid rgba(var(--gp-accent-a-rgb,230,180,60),.6);padding:3px 8px;margin:5px 0;font-style:italic;opacity:.92}
.svc input,.svc textarea,.svc select{width:100%;font:inherit;color:inherit;background:rgba(0,0,0,.25);border:1px solid var(--gp-border-soft,rgba(255,255,255,.18));border-radius:10px;padding:7px 9px;margin:4px 0}
.svc textarea{min-height:64px;resize:vertical}
.svc table{width:100%;border-collapse:collapse;font-size:12px}
.svc td,.svc th{padding:3px 4px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}
.svc th{opacity:.7;font-weight:600;font-size:11px}
.svc td.n{text-align:right;font-variant-numeric:tabular-nums}
.svc-meter{display:inline-block;height:6px;background:#e6b43c;border-radius:3px;vertical-align:middle}
.svc-shot{width:100%;border-radius:10px;display:block;margin:4px 0}
.svc-sus{font-size:16px;background:transparent;border:0;padding:0 4px}
.svc-lock{opacity:.6}
.svc-end{border-color:#46c878}
.svc-pick label{display:flex;gap:8px;align-items:flex-start;padding:4px 0}
.svc-pick input{width:auto;margin:3px 0 0}
`;
function ensureStyle() {
    if (document.getElementById('svc-style')) return;
    const s = document.createElement('style'); s.id = 'svc-style'; s.textContent = CSS; document.head.appendChild(s);
    const art = document.createElement('style'); art.id = 'svc-icon-style';
    art.textContent = '.gp-app-case{background:linear-gradient(140deg,#c98f2b,#7a5214)!important;color:#fff!important}';
    document.head.appendChild(art);
}
// ── Рендер ──
export function renderCaseApp(screen, api) {
    ensureStyle();
    const keepScroll = screen.querySelector('.svc-body')?.scrollTop ?? 0;
    if (!isSistavernChat()) {
        screen.innerHTML = '<section class="svc"><header class="svc-head"><button class="svc-back" data-act="home">‹</button><b>Дело</b></header><div class="svc-body"><div class="svc-card"><p>Это приложение работает вместе с карточкой «SISTAVERN — Дело Максимки». Открой чат с этой карточкой.</p></div></div></section>';
        screen.querySelector('[data-act=home]').onclick = api.home;
        return;
    }
    if (getMeta() !== lastMeta) { lastMeta = getMeta(); tab = 'home'; openLead = null; openPerson = null; filter = 'all'; searchResult = null; shotObs = {}; accDraft = null; confirmManual = ''; Object.keys(drafts).forEach(k => drafts[k] = ''); }
    const f = file(), set = unlocked(), end = ending(set);
    const leads = visibleLeads(set);
    const found = leads.filter(l => set.has(l.id) && l.kind !== 'story').length;
    const total = LEADS.filter(l => l.kind !== 'story' && !l.after).length;
    const fresh = [...set].filter(id => LEADS.some(l => l.id === id) && !f.seen.includes(id)).length;
    if (tab === 'clues' && fresh) { for (const id of set) if (!f.seen.includes(id)) f.seen.push(id); saveMeta(); }
    const body = ({ home: tHome, plan: tPlan, clues: tClues, people: tPeople, time: tTime, search: tSearch, shots: tShots, notes: tNotes, accuse: tAccuse }[tab] || tHome)(f, set, end, api);
    screen.innerHTML = '<section class="svc"><header class="svc-head"><button class="svc-back" data-act="home" aria-label="Назад">‹</button><b>' + esc(CASE_TITLE) + '</b><span class="svc-prog">улик ' + found + '/' + total + '</span></header>'
        + '<nav class="svc-tabs">' + TABS.map(([id, name]) => '<button data-tab="' + id + '" aria-selected="' + (tab === id) + '">' + name + (id === 'clues' && fresh ? '<span class="svc-dot">' + fresh + '</span>' : '') + '</button>').join('') + '</nav>'
        + '<div class="svc-body">' + body + '</div></section>';
    const bodyEl = screen.querySelector('.svc-body'); if (bodyEl) bodyEl.scrollTop = keepScroll;
    bind(screen, api);
}
function chip(text, cls) { return '<span class="svc-chip ' + (cls || '') + '">' + esc(text) + '</span>'; }
function kindChip(kind) { return kind === 'direct' ? chip('прямая', 'dir') : kind === 'indirect' ? chip('косвенная', 'ind') : chip('сюжет'); }
function nextLead(set, leads) {
    const order = ['C1', 'C3', 'C2', 'C5', 'C4', 'C11', 'C6', 'C7'];
    for (const id of order) { const l = leads.find(x => x.id === id); if (l && !set.has(id)) return l; }
    return leads.find(l => !set.has(l.id) && !l.side) || leads.find(l => !set.has(l.id)) || null;
}
function tHome(f, set, end, api) {
    const leads = visibleLeads(set), nxt = nextLead(set, leads);
    const scored = leads.filter(l => set.has(l.id));
    const pts = points(set, scored.map(l => l.id)), max = points(set, LEADS.filter(l => !l.after).map(l => l.id)) || 1;
    let h = '';
    if (end) h += '<div class="svc-card svc-end"><h4>' + esc(ENDINGS[end][0]) + '</h4><p>' + esc(ENDINGS[end][1]) + '</p></div>';
    h += '<div class="svc-card"><h4>Что происходит</h4>' + BRIEF.map(t => '<p>' + esc(t) + '</p>').join('') + '</div>';
    h += '<div class="svc-card"><h4>Прогресс</h4><div class="svc-bar"><i style="width:' + Math.min(100, Math.round(100 * pts / max)) + '%"></i></div><p class="svc-dim">Сила дела по реестру: ' + pts + ' из ' + max + ' (прямые улики по 2, косвенные по 1)</p></div>';
    if (nxt) h += '<div class="svc-card"><h4>Следующий шаг</h4><p><b>' + esc(nxt.title) + '</b></p><p class="svc-dim">' + esc(nxt.why) + '</p><button class="svc-btn" data-go-lead="' + nxt.id + '">Открыть в плане</button></div>';
    else if (!end) h += '<div class="svc-card"><h4>Все зацепки пройдены</h4><p>Пора обвинять: вкладка «Обвинение».</p></div>';
    h += '<div class="svc-card"><h4>Как играть</h4>' + HOWTO.map(t => '<p>• ' + esc(t) + '</p>').join('') + '</div>';
    return h;
}
function leadCard(l, f, set, api) {
    const done = set.has(l.id), lv = f.hints[l.id] || 0, open = openLead === l.id;
    let h = '<div class="svc-card" id="lead-' + l.id + '"><div class="svc-row"><div class="svc-grow"><h4>' + esc(l.title) + '</h4><p class="svc-dim">' + esc(l.why) + '</p></div><div>' + (done ? chip('найдено', 'ok') : chip('не найдено')) + '</div></div>';
    if (done) h += '<p>' + esc(l.result) + '</p>';
    else {
        for (let i = 0; i < lv; i++) h += '<p class="svc-ask">' + 'Подсказка ' + (i + 1) + ': ' + esc(l.hints[i]) + '</p>';
        if (l.tool === 'search') h += '<button class="svc-btn" data-tab-go="search">Открыть «Поиск»</button>';
        if (lv < l.hints.length) h += '<button class="svc-btn ghost" data-hint="' + l.id + '">' + (lv ? 'Ещё подсказка' : 'Подсказка') + ' (' + lv + '/' + l.hints.length + ')</button>';
        (l.ask || []).forEach((a, i) => { h += '<button class="svc-btn" data-ask="' + l.id + ':' + i + '">Написать: ' + esc(a.to) + '</button>'; });
        if (!l.tool) h += '<button class="svc-btn ghost" data-manual="' + l.id + '">' + (confirmManual === l.id ? 'Точно нашла(ёл)?' : 'Отметить вручную') + '</button>';
    }
    return h + '</div>';
}
function tPlan(f, set, end, api) {
    const leads = visibleLeads(set);
    const todo = leads.filter(l => !set.has(l.id) && !l.side), side = leads.filter(l => !set.has(l.id) && l.side), done = leads.filter(l => set.has(l.id));
    let h = '<p class="svc-dim">Это зацепки расследования. Нажимай «Подсказка», пока не станет ясно, кого спросить, а потом «Написать»: откроется чат с готовой фразой.</p>';
    if (todo.length) h += '<h4>Сейчас</h4>' + todo.map(l => leadCard(l, f, set, api)).join('');
    if (side.length) h += '<h4>Побочные</h4>' + side.map(l => leadCard(l, f, set, api)).join('');
    if (done.length) h += '<h4>Готово</h4>' + done.map(l => leadCard(l, f, set, api)).join('');
    if (!todo.length && !side.length) h += '<div class="svc-card"><p>Новых зацепок нет. Проверь «Хронику» и «Людей» и переходи к «Обвинению».</p></div>';
    return h;
}
function tClues(f, set) {
    const leads = visibleLeads(set), got = leads.filter(l => set.has(l.id)), miss = leads.filter(l => !set.has(l.id));
    let h = got.length ? '' : '<div class="svc-card"><p>Пока пусто. Вкладка «План» подскажет, с чего начать.</p></div>';
    h += got.map(l => '<div class="svc-card"><div class="svc-row"><div class="svc-grow"><h4>' + esc(l.title) + '</h4></div>' + kindChip(l.kind) + '</div><p>' + esc(l.result) + '</p><button class="svc-btn ghost" data-clue-note="' + l.id + '">В заметки</button></div>').join('');
    if (miss.length) h += '<h4>Ещё не найдено</h4>' + miss.map(l => '<div class="svc-card svc-lock"><div class="svc-row"><div class="svc-grow"><b>🔒 ' + esc(l.title) + '</b><p class="svc-dim">' + esc(l.why) + '</p></div>' + kindChip(l.kind) + '</div></div>').join('');
    return h;
}
const SUS = ['○', '🟡', '🔴', '✅'];
function personRow(n, f, set) {
    const w = LOG.windows?.[n], c4 = set.has('C4'), st = LOG.style?.[n], open = openPerson === n;
    const silentBoth = c4 && w && w[0] === 0 && w[1] === 0;
    let h = '<div class="svc-card"><div class="svc-row"><button class="svc-sus" data-sus="' + esc(n) + '" title="Подозрение: нажми, чтобы сменить">' + SUS[f.susp[n] || 0] + '</button><div class="svc-grow" data-person="' + esc(n) + '" style="cursor:pointer"><b>' + esc(n) + '</b> <span class="svc-dim">' + esc(PERSON_NOTES[n] || '') + '</span></div></div>';
    if (open) {
        if (st) h += '<p class="svc-dim">Как пишет: заглавная в начале у ' + st.up + '% сообщений, запятые у ' + st.comma + '%, точка в конце у ' + st.dot + '%; ' + st.n + ' сообщений в выгрузке.</p>';
        if (c4 && w) h += '<p class="svc-dim">Лог: 21:05–21:12 — ' + (w[0] ? 'писал(а) ' + w[0] + ' р.' : 'молчал(а)') + '; 21:14–21:21 — ' + (w[1] ? 'писал(а) ' + w[1] + ' р.' : 'молчал(а)') + (silentBoth ? ' ' + chip('молчал(а) оба раза', 'dir') : '') + '</p>';
        if (c4 && ALIBI[n]) h += '<p>' + chip('алиби', 'ok') + esc(ALIBI[n]) + '</p>';
        h += '<textarea data-pnote="' + esc(n) + '" placeholder="Что ты знаешь о ' + esc(n) + '?">' + esc(f.pnote[n] || '') + '</textarea>';
        h += '<button class="svc-btn" data-ask-person="' + esc(n) + '">Написать</button>';
    }
    return h + '</div>';
}
function tPeople(f, set) {
    const c4 = set.has('C4');
    const filters = [['all', 'Все']].concat(c4 ? [['both', 'Молчали оба раза'], ['alibi', 'С алиби'], ['noalibi', 'Без алиби']] : []).concat([['lower', 'Пишут строчными'], ['mark', 'С моей отметкой']]);
    if (!filters.some(x => x[0] === filter)) filter = 'all';
    let list = PEOPLE.slice();
    list = list.filter(n => {
        const w = LOG.windows?.[n], st = LOG.style?.[n];
        if (filter === 'both') return w && w[0] === 0 && w[1] === 0;
        if (filter === 'alibi') return !!ALIBI[n];
        if (filter === 'noalibi') return w && w[0] === 0 && w[1] === 0 && !ALIBI[n];
        if (filter === 'lower') return st && st.up < 20;
        if (filter === 'mark') return (f.susp[n] || 0) > 0;
        return true;
    });
    let h = '<p class="svc-dim">Нажми на кружок слева, чтобы пометить подозрение. Нажми на имя, чтобы открыть заметки и данные.' + (c4 ? '' : ' Лог и алиби появятся после улики «Кто молчал».') + '</p>';
    h += '<div>' + filters.map(([id, name]) => '<button class="svc-btn' + (filter === id ? '' : ' ghost') + '" data-filter="' + id + '">' + name + '</button>').join('') + '</div>';
    h += list.map(n => personRow(n, f, set)).join('') || '<div class="svc-card"><p>Никого. Смени фильтр.</p></div>';
    h += '<div class="svc-card"><p><b>Остальные ~580 участников.</b> Читают молча, ничего о них не известно. Ссылка на чат публичная, так что войти мог любой.</p></div>';
    return h;
}
function tTime(f, set) {
    const rows = TIMELINE.filter(t => t.req.every(r => set.has(r))).sort((a, b) => (a.day === b.day ? a.when - b.when : a.day === 'вт' ? -1 : 1));
    let h = '<p class="svc-dim">Здесь собирается картина вторника и пятницы. Новые факты добавляются по мере находок, свои записи добавляй ниже.</p>';
    h += '<div class="svc-card">' + (rows.map(t => '<p><b>' + t.day + ' ' + esc(t.time) + '</b> · ' + esc(t.text) + '</p>').join('') || '<p>Пока пусто.</p>') + '</div>';
    h += '<h4>Мои записи</h4>' + (f.tl.length ? '<div class="svc-card">' + f.tl.map(t => '<p class="svc-row"><span class="svc-grow"><b>' + esc(t.time) + '</b> · ' + esc(t.text) + '</span><button class="svc-sus" data-del-tl="' + t.id + '">✕</button></p>').join('') + '</div>' : '');
    h += '<div class="svc-card"><input data-draft="tlTime" placeholder="Время (например 21:07)" value="' + esc(drafts.tlTime) + '"><input data-draft="tlText" placeholder="Что произошло" value="' + esc(drafts.tlText) + '"><button class="svc-btn" data-add-tl>Добавить</button></div>';
    return h;
}
function corpus() { return corpusP || (corpusP = import('./sistavern-corpus.js').then(m => m.default)); }
function tSearch(f) {
    let h = '<p class="svc-dim">Поиск по выгрузке чата (сентябрь–ноябрь 2026, около 74 тысяч сообщений с текстом). Слово или готовая фраза. Слова, которых меньше пяти за всё время, не учитываются.</p>';
    h += '<div class="svc-card"><input data-draft="q" placeholder="например: отныне" value="' + esc(drafts.q) + '"><button class="svc-btn" data-search>Искать</button><div>' + SEARCH_CHIPS.map(c => '<button class="svc-btn ghost" data-chip="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div></div>';
    h += '<div id="svc-result">' + (searchResult || '') + '</div>';
    h += '<button class="svc-btn big ghost" data-style>Профиль стиля по людям</button>';
    return h;
}
function renderCounts(C, q, counts) {
    const P = C.people, total = Object.values(counts).reduce((a, b) => a + b, 0);
    const rows = Object.entries(counts).map(([i, v]) => [P[+i], v, C.msgs[+i]]).sort((a, b) => b[1] - a[1]).slice(0, 14);
    const mx = rows.length ? rows[0][1] : 1;
    if (!total) return '<div class="svc-card"><h4>«' + esc(q) + '»</h4><p><b>0 раз</b> за всё время у всех.</p></div>';
    return '<div class="svc-card"><h4>«' + esc(q) + '»</h4><p>Всего: <b>' + total + '</b></p><table><tr><th>Кто</th><th class="n">раз</th><th class="n">на 1000 сообщ.</th><th></th></tr>'
        + rows.map(([n, v, m]) => '<tr><td>' + esc(n) + '</td><td class="n">' + v + '</td><td class="n">' + (m ? (1000 * v / m).toFixed(1) : '0') + '</td><td><span class="svc-meter" style="width:' + Math.max(3, Math.round(70 * v / mx)) + 'px"></span></td></tr>').join('') + '</table></div>';
}
async function doSearch(raw, screen, api) {
    const q = norm(raw);
    if (!q) return;
    const C = await corpus();
    const tokens = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    let html;
    const exactKey = Object.keys(C.phrases).find(k => norm(k) === q);
    if (exactKey) html = renderCounts(C, raw, C.phrases[exactKey]);
    else if (tokens.length === 1 && C.words[tokens[0]]) html = renderCounts(C, raw, C.words[tokens[0]]);
    else if (tokens.length === 1) html = '<div class="svc-card"><h4>«' + esc(raw) + '»</h4><p>Встречается меньше пяти раз за всё время (точнее не считается).</p></div>';
    else html = '<div class="svc-card"><h4>«' + esc(raw) + '»</h4><p>Для фраз из нескольких слов есть только готовые запросы выше. Попробуй одно слово.</p></div>';
    searchResult = html;
    const f = file();
    const before = unlocked().has('C3');
    if (!f.searches.map(norm).includes(q)) { f.searches.push(raw.slice(0, 60)); saveMeta(); }
    api.render();
    if (!before && unlocked().has('C3')) api.toast?.('Найдена улика: «Стиль и поиск по чату»', 'fa-magnifying-glass');
}
async function styleTable() {
    const C = await corpus();
    const rows = C.people.filter(n => n !== 'остальные').map(n => { const s = C.style[n]; return '<tr><td>' + esc(n) + '</td><td class="n">' + s.n + '</td><td class="n">' + s.up + '%</td><td class="n">' + s.comma + '%</td><td class="n">' + s.dot + '%</td><td class="n">' + s.med + '</td></tr>'; }).join('');
    return '<div class="svc-card"><h4>Профиль стиля</h4><table><tr><th>Кто</th><th class="n">сообщ.</th><th class="n">заглавная</th><th class="n">запятая</th><th class="n">точка в конце</th><th class="n">длина</th></tr>' + rows + '</table><p class="svc-dim">заглавная: доля сообщений, начатых с большой буквы; длина: медиана в знаках.</p></div>';
}
const OBS = {
    scr1: [['Время', 'Время на скрине: 20:10. Даты нет.'], ['Текст', 'Строчные буквы, без запятых, 11 слов. Слов «чёрт» и «гадем» нет. Слова «отныне» и «по делу» тут есть оба.'], ['Шапка', 'Групповой чат Telegram: сверху название и «в сети», имя над пузырём.']],
    scr2: [['Время', 'Время на скрине: 21:07.'], ['Имя над пузырём', 'Над пузырём написано имя «МАКСИМКА», пузырь стоит слева с аватаром «M».'], ['Получатель', 'Имя получателя замазано, под ним статус «был(а) недавно».'], ['Текст', 'Строчные буквы, без запятых. «чёрт» и «гадем» упомянуты как тема («я специально пишу…»), а не вставлены в речь. Есть «к сожалению».']],
};
function tShots(f) {
    let h = '<p class="svc-dim">Присмотрись к деталям: нажми на пункт, получишь наблюдение. «В заметки» сохранит его.</p>';
    [['scr1', 'Скрин №1 (выложен в 21:00, удалён)', SCR1], ['scr2', 'Скрин №2 («личка», выложил «Неизвестный»)', SCR2]].forEach(([id, title, src]) => {
        h += '<div class="svc-card"><h4>' + esc(title) + '</h4><img class="svc-shot" alt="' + esc(title) + '" src="' + src + '">' + OBS[id].map(([name], i) => '<button class="svc-btn' + (shotObs[id + i] ? '' : ' ghost') + '" data-obs="' + id + ':' + i + '">' + esc(name) + '</button>').join('');
        OBS[id].forEach(([name, txt], i) => { if (shotObs[id + i]) h += '<p class="svc-ask">' + esc(txt) + ' <button class="svc-btn ghost" data-obs-note="' + id + ':' + i + '">В заметки</button></p>'; });
        h += '</div>';
    });
    return h;
}
function tNotes(f) {
    let h = '<div class="svc-card"><textarea data-draft="note" placeholder="Твоя мысль, версия, вопрос…">' + esc(drafts.note) + '</textarea><button class="svc-btn" data-add-note>Сохранить</button></div>';
    h += f.notes.map(n => '<div class="svc-card"><p>' + esc(n.text).replace(/\n/g, '<br>') + '</p><button class="svc-btn ghost" data-del-note="' + n.id + '">Удалить</button></div>').join('') || '<p class="svc-dim">Заметок пока нет.</p>';
    return h;
}
function tAccuse(f, set, end, api) {
    const acc = accDraft || (accDraft = f.acc ? { suspect: f.acc.suspect, clues: new Set(f.acc.clues || []), motive: f.acc.motive || '' } : { suspect: '', clues: new Set(), motive: '' });
    const got = visibleLeads(set).filter(l => set.has(l.id) && l.kind !== 'story');
    const names = PEOPLE.concat(['Неизвестный (знакомый)', 'Кто-то другой']);
    const pts = points(set, [...acc.clues]);
    let h = '<p class="svc-dim">Выбери человека и улики. Обвиняй, когда есть минимум одна прямая улика или три косвенные. Если ошибёшься, обвинённый обидится по-настоящему.</p>';
    h += '<div class="svc-card"><h4>Кого обвиняешь</h4><select data-acc-suspect><option value="">— выбери —</option>' + names.map(n => '<option' + (acc.suspect === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>';
    h += '<h4>Какие улики</h4><div class="svc-pick">' + (got.length ? got.map(l => '<label><input type="checkbox" data-acc-clue="' + l.id + '"' + (acc.clues.has(l.id) ? ' checked' : '') + '><span><b>' + esc(l.title) + '</b> ' + kindChip(l.kind) + '</span></label>').join('') : '<p class="svc-dim">Пока нечего предъявить.</p>') + '</div>';
    h += '<h4>Мотив (своими словами)</h4><textarea data-draft="motive" placeholder="Зачем он(а) это сделал(а)?">' + esc(drafts.motive || acc.motive) + '</textarea>';
    h += '<p class="svc-dim">Сила обвинения: ' + pts + ' очк.</p>';
    h += '<button class="svc-btn big" data-acc-go>Подготовить обвинение</button></div>';
    if (f.acc) h += '<div class="svc-card"><h4>Последнее обвинение</h4><p>' + esc(f.acc.suspect) + ': ' + esc((f.acc.clues || []).join(', ') || 'без улик') + '</p><button class="svc-btn" data-acc-chat>Написать в общий чат</button><button class="svc-btn ghost" data-acc-dm>Сказать лично</button><button class="svc-btn ghost" data-acc-clear>Отозвать</button></div>';
    if (end) h += '<div class="svc-card svc-end"><h4>' + esc(ENDINGS[end][0]) + '</h4><p>' + esc(ENDINGS[end][1]) + '</p></div>';
    return h;
}
function accText(f, set) {
    const acc = f.acc; if (!acc) return '';
    const titles = (acc.clues || []).map(id => (LEADS.find(l => l.id === id) || {}).title).filter(Boolean);
    return 'Я знаю, кто сделал скрины. Это ' + acc.suspect + '. Улики: ' + (titles.join('; ') || 'пока только догадки') + '.' + (acc.motive ? ' Почему: ' + acc.motive : '') + ' Если я ошибаюсь, скажите.';
}
function noteAdd(text) { const f = file(); if (!text) return; f.notes.unshift({ id: uid(), text: String(text).slice(0, 1500), time: Date.now() }); saveMeta(); }
// ── События ──
function bind(screen, api) {
    const root = screen.querySelector('.svc');
    if (!root) return;
    root.querySelector('[data-act=home]').onclick = api.home;
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; api.render(); });
    root.querySelectorAll('[data-tab-go]').forEach(b => b.onclick = () => { tab = b.dataset.tabGo; api.render(); });
    root.querySelectorAll('[data-go-lead]').forEach(b => b.onclick = () => { tab = 'plan'; api.render(); setTimeout(() => document.getElementById('lead-' + b.dataset.goLead)?.scrollIntoView({ block: 'start' }), 30); });
    root.querySelectorAll('[data-draft]').forEach(el => el.oninput = () => { drafts[el.dataset.draft] = el.value; });
    root.querySelectorAll('[data-pnote]').forEach(el => { el.oninput = () => { file().pnote[el.dataset.pnote] = el.value; saveMeta(); }; });
    const f = file();
    root.querySelectorAll('[data-hint]').forEach(b => b.onclick = () => { const id = b.dataset.hint, l = LEADS.find(x => x.id === id); f.hints[id] = Math.min((f.hints[id] || 0) + 1, l.hints.length); saveMeta(); api.render(); });
    root.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => { const [id, i] = b.dataset.ask.split(':'); const a = LEADS.find(x => x.id === id).ask[+i]; api.openThread(a.to, { draft: a.text }); });
    root.querySelectorAll('[data-ask-person]').forEach(b => b.onclick = () => api.openThread(b.dataset.askPerson, { draft: '' }));
    root.querySelectorAll('[data-manual]').forEach(b => b.onclick = () => {
        const id = b.dataset.manual;
        if (confirmManual !== id) { confirmManual = id; api.render(); return; }
        confirmManual = ''; if (!f.manual.includes(id)) f.manual.push(id); saveMeta(); api.render();
    });
    root.querySelectorAll('[data-clue-note]').forEach(b => b.onclick = () => { const l = LEADS.find(x => x.id === b.dataset.clueNote); noteAdd(l.title + ': ' + l.result); api.toast?.('Сохранено в заметки', 'fa-note-sticky'); });
    root.querySelectorAll('[data-sus]').forEach(b => b.onclick = e => { e.stopPropagation(); const n = b.dataset.sus; f.susp[n] = ((f.susp[n] || 0) + 1) % SUS.length; saveMeta(); api.render(); });
    root.querySelectorAll('[data-person]').forEach(b => b.onclick = () => { openPerson = openPerson === b.dataset.person ? null : b.dataset.person; api.render(); });
    root.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter; api.render(); });
    root.querySelectorAll('[data-add-tl]').forEach(b => b.onclick = () => { if (!drafts.tlText.trim()) return; f.tl.push({ id: uid(), time: (drafts.tlTime || '').trim().slice(0, 20) || '—', text: drafts.tlText.trim().slice(0, 300) }); drafts.tlTime = drafts.tlText = ''; saveMeta(); api.render(); });
    root.querySelectorAll('[data-del-tl]').forEach(b => b.onclick = () => { f.tl = f.tl.filter(t => t.id !== b.dataset.delTl); saveMeta(); api.render(); });
    root.querySelectorAll('[data-add-note]').forEach(b => b.onclick = () => { noteAdd(drafts.note.trim()); drafts.note = ''; api.render(); });
    root.querySelectorAll('[data-del-note]').forEach(b => b.onclick = () => { f.notes = f.notes.filter(n => n.id !== b.dataset.delNote); saveMeta(); api.render(); });
    root.querySelectorAll('[data-search]').forEach(b => b.onclick = () => doSearch(drafts.q, screen, api));
    root.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => { drafts.q = b.dataset.chip; doSearch(b.dataset.chip, screen, api); });
    const q = root.querySelector('[data-draft=q]'); if (q) q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(drafts.q, screen, api); } };
    root.querySelectorAll('[data-style]').forEach(b => b.onclick = async () => { searchResult = await styleTable(); api.render(); });
    root.querySelectorAll('[data-obs]').forEach(b => b.onclick = () => { shotObs[b.dataset.obs.replace(':', '')] = true; api.render(); });
    root.querySelectorAll('[data-obs-note]').forEach(b => b.onclick = () => { const [id, i] = b.dataset.obsNote.split(':'); noteAdd((id === 'scr1' ? 'Скрин №1' : 'Скрин №2') + ' · ' + OBS[id][+i][0] + ': ' + OBS[id][+i][1]); api.toast?.('Сохранено в заметки', 'fa-note-sticky'); });
    const sel = root.querySelector('[data-acc-suspect]'); if (sel) sel.onchange = () => { accDraft.suspect = sel.value; };
    root.querySelectorAll('[data-acc-clue]').forEach(c => c.onchange = () => { c.checked ? accDraft.clues.add(c.dataset.accClue) : accDraft.clues.delete(c.dataset.accClue); api.render(); });
    root.querySelectorAll('[data-acc-go]').forEach(b => b.onclick = () => {
        if (!accDraft.suspect) { api.toast?.('Выбери, кого обвиняешь', 'fa-triangle-exclamation'); return; }
        f.acc = { suspect: accDraft.suspect, clues: [...accDraft.clues], motive: (drafts.motive || accDraft.motive || '').trim().slice(0, 300), time: Date.now() };
        accDraft.motive = f.acc.motive; saveMeta(); api.render();
    });
    root.querySelectorAll('[data-acc-chat]').forEach(b => b.onclick = () => api.openThread(CHAT_NAME, { group: true, draft: accText(f, unlocked()) }));
    root.querySelectorAll('[data-acc-dm]').forEach(b => b.onclick = () => { const n = f.acc.suspect; api.openThread(n, { draft: 'Я знаю, что это ты. ' + accText(f, unlocked()).replace(/^Я знаю, кто сделал скрины\. Это [^.]*\. /, '') }); });
    root.querySelectorAll('[data-acc-clear]').forEach(b => b.onclick = () => { f.acc = null; accDraft = null; saveMeta(); api.render(); });
}
