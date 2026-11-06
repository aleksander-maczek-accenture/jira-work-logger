# Sprawdzanie rozszerzenia

Testy logiki nie wymagają dodatkowych zależności:

```sh
node tests/local-ai.test.mjs
node tests/bitbucket-context.test.mjs
node tests/bartek-ai.test.mjs
node tests/worklog-proposals.test.mjs
node tests/time-metrics.test.mjs
```

Test nowego interfejsu używa Playwright i osobnego profilu Chrome. Cały ruch do Jiry i Ollamy jest zastąpiony fikcyjnymi odpowiedziami; test nie korzysta z danych ani tokenów zainstalowanego rozszerzenia.

```sh
npm install --prefix /tmp/worklog-ux-qa playwright --no-audit --no-fund
PLAYWRIGHT_MODULE=/tmp/worklog-ux-qa/node_modules/playwright/index.mjs node tests/workspace-browser.test.mjs
```

Domyślna lokalizacja Chrome jest ustawiona dla macOS. Można ją zmienić przez `CHROME_EXECUTABLE`. Test sprawdza trzy zakładki, rozwijanie dni, filtrowanie braków, notatkę, datę spotkań, wybór ticketu, panel nowego wpisu, ustawienia, asystenta, zwijanie wykresu i wszystkie motywy. Zrzuty szerokiego/wąskiego widoku oraz panelu wpisu zapisują się w `/tmp/worklog-ux-*.png`.
