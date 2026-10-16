// Verbindung zum Backend (Supabase). Wird beim Bauen fest in die App eingebaut,
// die Nutzer sehen davon nichts.
//
// Die URL deines Projekts ist schon eingetragen. Es fehlt nur noch der Schlüssel
// "anon public" aus Supabase: Project Settings → API → Project API keys.
// Dieser Schlüssel ist für Apps gedacht und darf öffentlich im Code stehen.
// Das Datenbank-Passwort gehört hier NICHT hinein.
//
// Alternative: statt hier einzutragen, in GitHub unter
// Settings → Secrets and variables → Actions → Variables
// die Variablen SUPABASE_URL und SUPABASE_ANON_KEY anlegen.

export const SUPABASE_URL = 'https://jfoakfqnymvsfjxwwaus.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impmb2FrZnFueW12c2ZqeHd3YXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMDcxNDIsImV4cCI6MjEwNzY4MzE0Mn0.jIMQ-LRIvd0gj5qstwXbF72Vam1f293buNbr80v8YRA';
