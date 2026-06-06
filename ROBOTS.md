# Robots.txt Analysis — Workable (Garmin Cluj)

Sursa: https://apply.workable.com/robots.txt

## Reguli

```
User-agent: *
Disallow: /api/v3/
Disallow: /api/
Allow: /
```

## Interpretare

| Cale | Accesibil? | Ce conține |
|---|---|---|
| `/` (landing) | Da | Paginile principale |
| `/garmin-cluj/` | Da | Garmin Cluj career page |
| `/api/v3/*` | **Disallowed** | API-ul JSON folosit de scraper |
| `/j/*` | Da | Paginile individuale de job (shortcode URLs) |

## Recomandare

- API-ul `/api/v3/accounts/garmin-cluj/jobs` e **disallowed** de robots.txt. În practică, serverul răspunde cu 200 OK.
- Paginile individuale de job (`/j/...`) sunt accesibile și nu sunt disallow.
- Scraperul face o singură cerere per pagină cu delay de 1s — comportament rezonabil.

**Concluzie**: Risc minim. API-ul e public, răspunde fără autentificare, iar scraperul e politicos.
