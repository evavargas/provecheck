/** dd/mm/aaaa hh:mm, 24 hours, in the organization's zone (spec: dates are always dd/mm/aaaa). */
export const formatDateTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Montevideo',
  }).format(new Date(iso));

export const formatMoney = (amount: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'UYU' }).format(amount);
