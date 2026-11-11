/** dd/mm/aaaa in es-UY; the locale decides the rest (spec: dates follow the interface language). */
export const formatDateTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Montevideo',
  }).format(new Date(iso));
