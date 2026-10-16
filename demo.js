// Demo-Modus: Beispieldaten im Speicher statt Supabase (nur für die Vorschau).

const at = (dayOffset, h, m) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const seed = () => [
  { id: 'd1', kind: 'event', title: 'Team-Standup', starts_at: at(0, 9, 30), all_day: false, done: false },
  { id: 'd2', kind: 'event', title: 'Mittagessen mit Lena', starts_at: at(0, 12, 30), all_day: false, done: false },
  { id: 'd3', kind: 'event', title: 'Zahnarzt', starts_at: at(1, 15, 0), all_day: false, done: false },
  { id: 'd4', kind: 'event', title: 'Geburtstag von Oma', starts_at: at(2, 0, 0), all_day: true, done: false },
  { id: 'd5', kind: 'event', title: 'Meeting mit Steuerberater', starts_at: at(4, 9, 30), all_day: false, done: false },
  { id: 'd6', kind: 'event', title: 'Yoga', starts_at: at(-1, 18, 0), all_day: false, done: false },
  { id: 't1', kind: 'task', title: 'Milch und Eier kaufen', starts_at: null, all_day: false, done: false },
  { id: 't2', kind: 'task', title: 'Paket bei der Post abholen', starts_at: null, all_day: false, done: false },
  { id: 't3', kind: 'task', title: 'Wäsche aufhängen', starts_at: null, all_day: false, done: true },
  { id: 't4', kind: 'task', title: 'Steuerunterlagen sortieren', starts_at: null, all_day: false, done: true },
  { id: 'l1', kind: 'list', title: 'Einkaufsliste', starts_at: at(0, 0, 0), all_day: true, done: false, created_at: '2026-01-01T10:00:00.000Z' },
  { id: 'l1a', kind: 'item', parent_id: 'l1', title: 'Milch', done: true, created_at: '2026-01-01T10:00:00.001Z' },
  { id: 'l1b', kind: 'item', parent_id: 'l1', title: 'Eier', done: false, created_at: '2026-01-01T10:00:00.002Z' },
  { id: 'l1c', kind: 'item', parent_id: 'l1', title: 'Haferflocken', done: false, created_at: '2026-01-01T10:00:00.003Z' },
  { id: 'l1d', kind: 'item', parent_id: 'l1', title: 'Äpfel', done: true, created_at: '2026-01-01T10:00:00.004Z' },
  { id: 'l2', kind: 'list', title: 'Einkaufsliste', starts_at: at(1, 0, 0), all_day: true, done: false, created_at: '2026-01-01T10:01:00.000Z' },
  { id: 'l2a', kind: 'item', parent_id: 'l2', title: 'Brot', done: false, created_at: '2026-01-01T10:01:00.001Z' },
  { id: 'l2b', kind: 'item', parent_id: 'l2', title: 'Käse', done: false, created_at: '2026-01-01T10:01:00.002Z' },
];

export const DEMO_PHRASES = [
  'Erstelle mir Einkaufsliste für übermorgen',
  'Milch und Butter auf die Einkaufsliste',
  'Zahnarzt morgen um 15 Uhr',
  'Am 20. muss ich Brot und Käse einkaufen',
  'Milch kaufen',
];

export function createDemoClient() {
  let rows = seed();
  let n = 0;
  let session = null;
  const subs = new Set();
  const emit = (event) => subs.forEach((cb) => cb(event, session));

  const builder = (run) => {
    const b = {
      _eq: null,
      order() { return b; },
      eq(col, val) { b._eq = [col, val]; return b; },
      then(res, rej) { return Promise.resolve(run(b)).then(res, rej); },
    };
    return b;
  };

  return {
    from() {
      return {
        select: () => builder(() => ({ data: rows.map((r) => ({ ...r })), error: null })),
        insert: (row) => builder(() => {
          const add = (Array.isArray(row) ? row : [row]).map((r) => ({
            id: `n${++n}`, done: false, created_at: new Date().toISOString(), starts_at: null, all_day: false, ...r,
          }));
          rows = [...add, ...rows];
          return { error: null };
        }),
        update: (row) => builder((b) => {
          rows = rows.map((r) => (r.id === b._eq[1] ? { ...r, ...row } : r));
          return { error: null };
        }),
        delete: () => builder((b) => {
          rows = rows.filter((r) => r.id !== b._eq[1] && r.parent_id !== b._eq[1]);
          return { error: null };
        }),
      };
    },
    auth: {
      onAuthStateChange(cb) {
        subs.add(cb);
        setTimeout(() => cb('INITIAL_SESSION', session), 0);
        return { data: { subscription: { unsubscribe: () => subs.delete(cb) } } };
      },
      async signInWithPassword({ email }) {
        session = { user: { id: 'demo', email } };
        emit('SIGNED_IN');
        return { data: { session, user: session.user }, error: null };
      },
      async signUp() { return { data: { session: null, user: { id: 'demo' } }, error: null }; },
      async verifyOtp({ email, token }) {
        if (!token) return { data: {}, error: { message: 'invalid' } };
        session = { user: { id: 'demo', email } };
        emit('SIGNED_IN');
        return { data: { session, user: session.user }, error: null };
      },
      async resend() { return { error: null }; },
      async resetPasswordForEmail() { return { error: null }; },
      async updateUser() { return { data: { user: session?.user }, error: null }; },
      async signOut() { session = null; emit('SIGNED_OUT'); return { error: null }; },
    },
  };
}
