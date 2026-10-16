import { parseInput } from '../src/parser.js';

// Fester Zeitpunkt: Freitag, 16.10.2026, 06:34
const NOW = new Date(2026, 9, 16, 6, 34);
let failed = 0;

function check(input, expected) {
  const r = parseInput(input, NOW);
  const got = {
    kind: r.kind,
    title: r.title,
    when: r.date
      ? `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}-${String(r.date.getDate()).padStart(2, '0')} ${String(r.date.getHours()).padStart(2, '0')}:${String(r.date.getMinutes()).padStart(2, '0')}`
      : null,
    allDay: r.allDay,
  };
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(ok ? 'OK  ' : 'FAIL', JSON.stringify(input), ok ? '' : `\n   erwartet ${JSON.stringify(expected)}\n   erhalten ${JSON.stringify(got)}`);
}

check('Termin Zahnarzt morgen 15 Uhr', { kind: 'event', title: 'Zahnarzt', when: '2026-10-17 15:00', allDay: false });
check('Zahnarzt morgen um 15:30', { kind: 'event', title: 'Zahnarzt', when: '2026-10-17 15:30', allDay: false });
check('Meeting am Montag um 9 Uhr', { kind: 'event', title: 'Meeting', when: '2026-10-19 09:00', allDay: false });
check('Trag mir übermorgen halb vier Friseur ein', { kind: 'event', title: 'Friseur', when: '2026-10-18 15:30', allDay: false });
check('Geburtstag von Oma am 20. November', { kind: 'event', title: 'Geburtstag von Oma', when: '2026-11-20 00:00', allDay: true });
check('Arzt am 3.12.2026 um 10 Uhr', { kind: 'event', title: 'Arzt', when: '2026-12-03 10:00', allDay: false });
check('Telefonat heute Abend um 7', { kind: 'event', title: 'Telefonat', when: '2026-10-16 19:00', allDay: false });
check('Milch kaufen', { kind: 'task', title: 'Milch kaufen', when: null, allDay: false });
check('Erinnere mich daran, die Wäsche aufzuhängen', { kind: 'task', title: 'Die Wäsche aufzuhängen', when: null, allDay: false });
check('Termin beim Steuerberater', { kind: 'event', title: 'Beim Steuerberater', when: '2026-10-16 00:00', allDay: true });

function checkList(input, expected) {
  const r = parseInput(input, NOW);
  const got = {
    kind: r.kind,
    mode: r.mode,
    title: r.title,
    date: r.date ? `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}-${String(r.date.getDate()).padStart(2, '0')}` : null,
    items: r.items,
  };
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(ok ? 'OK  ' : 'FAIL', JSON.stringify(input), ok ? '' : `\n   erwartet ${JSON.stringify(expected)}\n   erhalten ${JSON.stringify(got)}`);
}

checkList('Erstelle mir Einkaufsliste heute den 16.', { kind: 'list', mode: 'create', title: 'Einkaufsliste', date: '2026-10-16', items: [] });
checkList('Erstelle mir eine Einkaufsliste für morgen', { kind: 'list', mode: 'create', title: 'Einkaufsliste', date: '2026-10-17', items: [] });
checkList('Am 17. muss ich Brot und Käse einkaufen', { kind: 'list', mode: 'create', title: 'Einkaufsliste', date: '2026-10-17', items: ['Brot', 'Käse'] });
checkList('Am 17. muss ich Brot Käse und Butter einkaufen', { kind: 'list', mode: 'create', title: 'Einkaufsliste', date: '2026-10-17', items: ['Brot', 'Käse', 'Butter'] });
checkList('Milch und Eier auf die Einkaufsliste', { kind: 'list', mode: 'add', title: 'Einkaufsliste', date: null, items: ['Milch', 'Eier'] });
checkList('Füge Butter zur Einkaufsliste am 17. hinzu', { kind: 'list', mode: 'add', title: 'Einkaufsliste', date: '2026-10-17', items: ['Butter'] });
checkList('Erstelle eine Packliste für den 20. Oktober mit Zelt, Schlafsack und Taschenlampe', { kind: 'list', mode: 'create', title: 'Packliste', date: '2026-10-20', items: ['Zelt', 'Schlafsack', 'Taschenlampe'] });
check('Milch kaufen', { kind: 'task', title: 'Milch kaufen', when: null, allDay: false });
check('Zahnarzt am 17. um 15 Uhr', { kind: 'event', title: 'Zahnarzt', when: '2026-10-17 15:00', allDay: false });

if (failed) {
  console.error(`\n${failed} Test(s) fehlgeschlagen`);
  process.exit(1);
}
console.log('\nAlle Tests bestanden');
