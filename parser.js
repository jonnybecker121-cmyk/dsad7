// Deutsche Sprach-Erkennung für Termine und To-dos (regelbasiert, läuft offline).

const WEEKDAYS = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6,
};
const MONTHS = {
  januar: 0, jänner: 0, februar: 1, märz: 2, maerz: 2, april: 3, mai: 4, juni: 5,
  juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
};
const NUM = {
  ein: 1, einem: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7,
  acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
};
const DAYPART = { früh: 7, morgens: 8, vormittags: 10, mittags: 12, nachmittags: 15, abends: 19, abend: 19, nachts: 22 };

const NUMWORDS = Object.keys(NUM).join('|');
const MONTHWORDS = Object.keys(MONTHS).join('|');
const WEEKDAYWORDS = Object.keys(WEEKDAYS).join('|');

const toNum = (s) => {
  if (s == null) return null;
  s = String(s).toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  return NUM[s] ?? null;
};

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ---------- Listen-Erkennung ----------
const L = '\\p{L}';
const wordRe = (alts) => `(?<!${L})(?:${alts})(?!${L})`;
const LIST_WORD = new RegExp(`\\s([${L}-]*liste)(?=\\s)`, 'iu');
const CREATE_RE = new RegExp(wordRe(`erstell${L}*|anleg${L}*|neue[rns]?|mach${L}*|leg${L}*`), 'iu');
const ADD_RE = new RegExp(
  `${wordRe(`füg${L}*|hinzu|setz${L}*|schreib${L}*|pack${L}*|trag${L}*`)}|(?:auf|in|zu|zur|an)\\s+(?:die|der|meine|meiner|unsere|deine)?\\s*[${L}-]*liste`,
  'iu',
);
const BUY_RE = new RegExp(wordRe(`einkaufen|kaufen|besorgen`), 'iu');
const NOISE = new RegExp(
  wordRe(
    `erstell${L}*|anleg${L}*|leg${L}*|mach${L}*|neue[rns]?|bitte|mir|uns|ich|muss|musst|soll|sollte|will|noch|auch|einkaufen|kaufen|besorgen|füg${L}*|hinzu|setz${L}*|schreib${L}*|pack${L}*|trag${L}*|ein|eine|einen|auf|in|zu|zur|zum|an|am|den|die|der|das|mit|dass|dazu|unbedingt|für|von|meine|meiner`,
  ),
  'giu',
);

function splitItems(text) {
  const out = [];
  const pieces = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s*,\s*|\s+und\s+|\s+sowie\s+|\s+außerdem\s+/i);
  for (let p of pieces) {
    p = p.replace(/^(?:ein|eine|einen|einmal|etwas|noch|auch)\s+/i, '').trim();
    if (!p) continue;
    // "Brot Käse" ohne "und" gesprochen: mehrere großgeschriebene Wörter trennen
    const words = p.split(' ');
    if (words.length >= 2 && words.length <= 4 && words.every((w) => /^\p{Lu}/u.test(w))) out.push(...words);
    else out.push(p);
  }
  return out.map(capitalize);
}

function detectList(rest, hasTime) {
  const lw = LIST_WORD.exec(rest);
  if (lw) {
    const mode = CREATE_RE.test(rest) ? 'create' : ADD_RE.test(rest) ? 'add' : 'create';
    const remainder = rest.replace(lw[0], ' ').replace(NOISE, ' ').replace(/[.:\-]/g, ' ');
    const word = lw[1].replace(/^-+/, '');
    return { mode, title: capitalize(word.toLowerCase()), items: splitItems(remainder) };
  }
  if (!hasTime && BUY_RE.test(rest)) {
    const items = splitItems(rest.replace(NOISE, ' ').replace(/[.:\-]/g, ' '));
    if (items.length >= 2) return { mode: 'create', title: 'Einkaufsliste', items };
  }
  return null;
}

/**
 * @param {string} input  gesprochener Text
 * @param {Date} [now]
 * @returns {{kind:'event'|'task', title:string, date:Date|null, allDay:boolean}}
 */
export function parseInput(input, now = new Date()) {
  const original = (input || '').trim();
  let rest = ' ' + original.replace(/[,!?;]/g, ' ').replace(/\s+/g, ' ') + ' ';

  const take = (re) => {
    const m = re.exec(rest);
    if (m) rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
    return m;
  };

  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  // ---------- Datum ----------
  let day = null;
  let m;

  if ((m = take(/\s(übermorgen|morgen|heute)(?=\s)/i))) {
    const w = m[1].toLowerCase();
    day = addDays(base, w === 'heute' ? 0 : w === 'morgen' ? 1 : 2);
  } else if ((m = take(new RegExp(`\\sin\\s+(\\d+|${NUMWORDS})\\s+(tagen|tag|wochen|woche)(?=\\s)`, 'i')))) {
    const n = toNum(m[1]);
    day = addDays(base, /woche/i.test(m[2]) ? n * 7 : n);
  } else if ((m = take(/\s(?:am\s+|den\s+)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s)/i))) {
    let y = m[3] ? Number(m[3]) : base.getFullYear();
    if (y < 100) y += 2000;
    day = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && day < base) day = new Date(y + 1, Number(m[2]) - 1, Number(m[1]));
  } else if ((m = take(new RegExp(`\\s(?:am\\s+|den\\s+)?(\\d{1,2})\\.?\\s+(${MONTHWORDS})(?:\\s+(\\d{4}))?(?=\\s)`, 'i')))) {
    let y = m[3] ? Number(m[3]) : base.getFullYear();
    const mo = MONTHS[m[2].toLowerCase()];
    day = new Date(y, mo, Number(m[1]));
    if (!m[3] && day < base) day = new Date(y + 1, mo, Number(m[1]));
  } else if ((m = take(new RegExp(`\\s(?:(?:am|nächsten|nächste|kommenden|kommende)\\s+)*(${WEEKDAYWORDS})(?=\\s)`, 'i')))) {
    const wd = WEEKDAYS[m[1].toLowerCase()];
    const delta = (wd - base.getDay() + 7) % 7 || 7;
    day = addDays(base, delta);
  }

  // Nur Tag ohne Monat: "am 17.", "den 16." (auch zusätzlich zu "heute")
  const dm = take(/\s(?:für\s+|auf\s+)?(?:am|den)\s+(\d{1,2})\.(?=\s)/i);
  if (dm && !day) {
    const dn = Number(dm[1]);
    if (dn >= 1 && dn <= 31) {
      day = new Date(base.getFullYear(), base.getMonth(), dn);
      if (day < base) day = new Date(base.getFullYear(), base.getMonth() + 1, dn);
    }
  }

  // ---------- Uhrzeit ----------
  let hour = null;
  let minute = 0;

  if ((m = take(new RegExp(`\\s(?:um\\s+)?halb\\s+(\\d{1,2}|${NUMWORDS})(?:\\s+uhr)?(?=\\s)`, 'i')))) {
    const n = toNum(m[1]);
    hour = n === 1 ? 12 : n - 1;
    minute = 30;
  } else if ((m = take(new RegExp(`\\s(?:um\\s+)?dreiviertel\\s+(\\d{1,2}|${NUMWORDS})(?:\\s+uhr)?(?=\\s)`, 'i')))) {
    const n = toNum(m[1]);
    hour = n === 1 ? 12 : n - 1;
    minute = 45;
  } else if ((m = take(new RegExp(`\\s(?:um\\s+)?viertel\\s+(nach|vor)\\s+(\\d{1,2}|${NUMWORDS})(?:\\s+uhr)?(?=\\s)`, 'i')))) {
    const n = toNum(m[2]);
    if (m[1].toLowerCase() === 'nach') {
      hour = n;
      minute = 15;
    } else {
      hour = n === 1 ? 12 : n - 1;
      minute = 45;
    }
  } else if ((m = take(/\s(?:um\s+)?(\d{1,2}):(\d{2})(?:\s*uhr)?(?=\s)/i))) {
    hour = Number(m[1]);
    minute = Number(m[2]);
  } else if ((m = take(/\s(?:um\s+)?(\d{1,2})\.(\d{2})\s*uhr(?=\s)/i))) {
    hour = Number(m[1]);
    minute = Number(m[2]);
  } else if ((m = take(new RegExp(`\\s(?:um\\s+)?(\\d{1,2}|${NUMWORDS})\\s+uhr(?:\\s+(\\d{1,2}))?(?=\\s)`, 'i')))) {
    hour = toNum(m[1]);
    minute = m[2] ? Number(m[2]) : 0;
  } else if ((m = take(/\sum\s+(\d{1,2})(?=\s)/i))) {
    hour = Number(m[1]);
  }

  // ---------- Tageszeit ----------
  let part = null;
  if ((m = take(/\s(früh|morgens|vormittags|mittags|nachmittags|abends|abend|nachts)(?=\s)/i))) {
    part = m[1].toLowerCase();
  }

  let hasTime = false;
  if (hour != null && hour <= 24 && minute < 60) {
    hasTime = true;
    if ((part === 'nachmittags' || part === 'abends' || part === 'abend') && hour < 12) hour += 12;
    else if (!part && hour >= 1 && hour <= 5) hour += 12; // "um 3" meint meist nachmittags
    if (hour === 24) hour = 0;
  } else if (part) {
    hour = DAYPART[part];
    minute = 0;
    hasTime = true;
  }

  // Uhrzeit ohne Datum: heute, sonst morgen
  if (hasTime && !day) {
    const candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute);
    day = candidate <= now ? addDays(base, 1) : base;
  }

  let date = null;
  if (day) {
    date = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hasTime ? hour : 0, hasTime ? minute : 0);
  }

  // ---------- Listen ("Einkaufsliste", "… einkaufen") ----------
  const listIntent = detectList(rest, hasTime);
  if (listIntent) {
    return {
      kind: 'list',
      mode: listIntent.mode,
      title: listIntent.title,
      date: day ? new Date(day.getFullYear(), day.getMonth(), day.getDate()) : null,
      allDay: true,
      items: listIntent.items,
    };
  }

  const isEvent = Boolean(date) || /\btermin\b/i.test(original);
  if (isEvent && !date) date = new Date(base); // "Termin" ohne Datum: heute, ganztägig

  // ---------- Titel ----------
  let title = rest.replace(/\s+/g, ' ').trim();
  title = title
    .replace(
      /\b(bitte|eintragen|trag(?:e)?(?: mir| uns)?(?: bitte)?(?: ein)?|erinner(?:e)?(?: mich| mir)?(?: bitte)?(?: daran| an)?|neuer termin|neue notiz|neue aufgabe|termin|notiz|aufgabe|to-?do|schreib(?: auf)?|ich habe|ich hab|ich muss|dass)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  title = title
    .replace(/^(?:(?:ein|einen|eine|an|am|um|für|dass|:|-)\s+)+/i, '')
    .replace(/(?:\s+(?:ein|an|am|um|für|auf|den))+$/i, '')
    .replace(/^[:\-\s]+|[:\-\s]+$/g, '')
    .trim();
  if (!title) title = original;
  title = capitalize(title);

  return { kind: isEvent ? 'event' : 'task', title, date, allDay: isEvent ? !hasTime : false };
}
