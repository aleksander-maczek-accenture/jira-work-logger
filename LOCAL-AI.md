# Lokalne podsumowania dni

1. Zainstaluj i uruchom Ollama na Macu.
2. W Terminalu pobierz lokalny model: `ollama pull qwen3:8b`.
3. Przeładuj rozszerzenie w `chrome://extensions` (dodano dostęp do localhost).
4. W Ustawieniach dodatku znajdziesz „Lokalne podsumowania AI · Ollama”.
   Domyślny adres to `http://127.0.0.1:11434`, model `qwen3:8b`.
5. Jeśli połączenie zwraca 403, wykonaj dokładne polecenie `launchctl setenv OLLAMA_ORIGINS ...`
   pokazane przez dodatek. Zawiera ono ID Twojego rozszerzenia. Zamknij Ollama i uruchom ponownie.
6. Kliknij „Sprawdź połączenie”, a potem pobierz worklogi.

Karta dodatku musi pozostać otwarta podczas generowania. Zadania wykonywane są po kolei,
po jednym dniu, najnowsze najpierw. Gdy lokalny serwer jest niedostępny, próba jest
ponawiana co minutę; można też kliknąć „Ponów podsumowania”. Model jest zwalniany po
2 minutach bezczynności. Odświeżanie worklogów przerywa poprzednią kolejkę.

Podsumowanie ma do trzech punktów i 60 słów. Godziny liczy dodatek.
Podsumowania są przypisane do instancji Jiry, konta i daty; zapisuje się je lokalnie.
Zmienione dane lub model powodują ponowne wygenerowanie. Usunięcie ostatniego worklogu
dnia usuwa jego automatyczne podsumowanie. Własna wersja zapisana przez użytkownika
nie jest nadpisywana. Aby wrócić do AI, wyczyść własną wersję i ponów podsumowania.

## Kontekst

Dla ticketów z worklogami pobierane są obecny opis, powiązane klucze, komentarze oraz
historia zmian statusu, przypisania, opisu, tytułu i rozwiązania. Kontekst ticketu jest
buforowany w pamięci karty przez 5 minut. Dla bardzo dużych ticketów pobierane są
ostatnie 200 komentarzy i zdarzeń; ograniczenie jest oznaczane przy podsumowaniu.
Brak dostępu do części kontekstu nie blokuje podsumowania dostępnych worklogów.

Datowane komentarze i zmiany są wybierane osobno dla każdego dnia. Autorzy są
porównywani z kontem Jiry, a model otrzymuje tylko informację, czy jest to własna
aktywność. Aktualny opis zadania jest oznaczany jako kontekst, nie dowód wykonania
pracy w przeszłości. Commity i pull requesty nie są pobierane.

Model otrzymuje tytuły i komentarze worklogów oraz ograniczony kontekst Jiry.
Nie otrzymuje tokenu Jiry, prywatnych notatek ani możliwości wykonywania operacji.
Zapytania do modelu są dozwolone wyłącznie na `http://127.0.0.1` i `http://localhost`.
Wybierz model lokalny, np. `qwen3:8b`, aby dane nie trafiały do usługi chmurowej.

Weryfikacja: `node tests/local-ai.test.mjs`.

## Bartek z lokalnym AI

Otwórz panel Bartka. Przy pierwszym otwarciu przygotuje krótką ocenę danych.
W sekcji „Zapytaj Bartka · lokalne AI” możesz pytać o wczorajszą pracę,
cel miesiąca i wpisy wymagające sprawdzenia albo wpisać własne pytanie.

Bartek korzysta z tej samej konfiguracji Ollama co podsumowania dni. Zapytania są
wykonywane po kolei we wspólnej kolejce. Odpowiedź można przerwać; odświeżanie
worklogów przerywa aktywne pytanie. Rozmowa jest przechowywana tylko w pamięci
otwartej karty, osobno dla konta Jiry. „Wyczyść” usuwa bieżącą rozmowę.

Model otrzymuje obliczone cele i godziny, daty, wybrane worklogi oraz zapisane
podsumowania dni. Nie otrzymuje tokenów, adresu email ani prywatnych notatek.
Historia jest ograniczona, a duży zbiór danych oznaczany jako niepełny.
Bartek odpowiada na podstawie pobranych danych; nie pobiera sam nowych zakresów
ani nie zmienia wpisów w Jira.

Test czatu: `node tests/bartek-ai.test.mjs`.
