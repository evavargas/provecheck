/** English uses the en-GB order so dates stay dd/mm/aaaa in every language (spec). */
const order = (locale: string) => (locale.startsWith('en') ? 'en-GB' : locale);

/** dd/mm/aaaa hh:mm, 24 hours, in the organization's zone (spec: dates are always dd/mm/aaaa). */
export const formatDateTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(order(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Montevideo',
  }).format(new Date(iso));

export const formatTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(order(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Montevideo',
  }).format(new Date(iso));

export const formatMoney = (amount: number, locale: string) =>
  new Intl.NumberFormat(order(locale), { style: 'currency', currency: 'UYU' }).format(amount);

export const formatDayMonth = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(order(locale), {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Montevideo',
  }).format(new Date(iso));
