# Sprachplaner – Termine, To-dos & Listen per Sprache

Android-App: Mikrofon-Button drücken, sprechen – die App erkennt, ob es ein **Termin**, ein **To-do** oder eine **Liste** ist, und trägt es nach kurzer Bestätigung ein. Nutzer legen in der App ein Konto mit E-Mail an, bestätigen es mit einem Code aus der Mail und sind fertig. Dass dahinter Supabase läuft, sieht niemand.

| Du sagst | Ergebnis |
|---|---|
| „Zahnarzt morgen 15 Uhr“ | Termin, morgen 15:00 |
| „Meeting am Montag um halb zehn“ | Termin, nächster Montag 09:30 |
| „Geburtstag von Oma am 20. November“ | Termin, ganztägig |
| „Milch kaufen“ | To-do zum Abhaken |
| „Erstelle mir Einkaufsliste für heute den 16.“ | Neue Liste „Einkaufsliste“ mit Datum 16.10. |
| „Am 17. muss ich Brot und Käse einkaufen“ | Eigene Einkaufsliste für den 17.10. mit Brot, Käse |
| „Milch und Eier auf die Einkaufsliste“ | Punkte werden zur passenden Liste hinzugefügt |

## Einmalige Einrichtung (nur du als Entwickler, ca. 10 Minuten)

### 1. Supabase vorbereiten
1. **SQL Editor** → Inhalt von `supabase/schema.sql` einfügen → **Run** (das Skript kann gefahrlos wiederholt werden).
2. **Project Settings → API**: den Schlüssel **anon public** kopieren und in `src/config.js` bei `SUPABASE_ANON_KEY` einfügen (die URL steht schon drin). Das ist der öffentliche App-Schlüssel, er darf im Code stehen. Das Datenbank-Passwort gehört nirgends hinein.
3. **Authentication → Emails → Templates**: Bei **Confirm signup** und bei **Reset password** den Code in die Mail aufnehmen, zum Beispiel:

   ```html
   <h2>Dein Code für Sprachplaner</h2>
   <p>Gib diesen Code in der App ein:</p>
   <h1>{{ .Token }}</h1>
   ```

   Die App fragt den Code direkt ab, die Nutzer müssen keinen Link öffnen.
4. **Mail-Versand für echte Nutzer:** Der eingebaute Mail-Dienst von Supabase ist laut Supabase nur zum Testen gedacht (sehr wenige Mails pro Stunde, nicht für beliebige Empfänger). Richte unter **Authentication → Emails → SMTP Settings** einen eigenen Versender ein, z. B. Resend, Brevo oder Postmark (kostenlose Tarife reichen).

### 2. Auf GitHub hochladen & APK bauen lassen
1. Neues GitHub-Repository erstellen und den kompletten Ordner hochladen (inkl. `.github/`).
2. Reiter **Actions** → „Android APK bauen“ läuft automatisch (oder **Run workflow**), Dauer ca. 5–8 Minuten.
3. Danach unter **Artifacts** → `sprachplaner-apk` herunterladen (ZIP, darin `sprachplaner.apk`). Mit einem Tag wie `v1.0` wird die APK zusätzlich als **Release** veröffentlicht, den Link kannst du weitergeben.

*Alternative zu `src/config.js`:* Unter **Settings → Secrets and variables → Actions → Variables** `SUPABASE_URL` und `SUPABASE_ANON_KEY` anlegen. Sie haben Vorrang vor `src/config.js`.

### 3. Installieren
APK aufs Handy übertragen und öffnen. Android fragt einmalig nach „Installation aus unbekannten Quellen“. Beim ersten Sprechen das Mikrofon erlauben.

## Für Nutzer
Konto erstellen → E-Mail eingeben und Passwort wählen → Code aus der Mail eintippen → fertig. „Passwort vergessen?“ funktioniert genauso mit einem Code.

## Hinweise
- Die APK ist eine *Debug-APK* (mit Debug-Schlüssel signiert): zum Weitergeben per Link in Ordnung, für den Play Store müsste man eine Release-Signatur einrichten.
- Spracherkennung läuft über den Google-Spracherkenner des Handys (Deutsch). Der erkannte Text wird vor dem Speichern angezeigt und kann korrigiert werden.
- Uhrzeiten von 1–5 Uhr ohne Zusatz werden als nachmittags gedeutet („um 3“ → 15:00).
- Listen: Es kann mehrere Listen mit gleichem Namen geben (z. B. eine Einkaufsliste pro Tag). Beim Hinzufügen wird die Liste mit passendem Datum vorgeschlagen, sonst die nächste anstehende.

## Lokal entwickeln
```bash
npm install
npm run dev            # im Browser testen
npm run build:preview  # klickbare Demo mit Beispieldaten (dist-preview/index.html)
npm test               # Tests der Spracherkennung
```
