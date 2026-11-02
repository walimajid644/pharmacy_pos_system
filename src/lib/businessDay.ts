/** Calendar days follow the desktop's local timezone; invoices store UTC timestamps. */
export function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function localDayBounds(dateKey: string): [string, string] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('Invalid calendar date')
  const [year, month, day] = dateKey.split('-').map(Number)
  const start = new Date(year, month - 1, day)
  if (localDateKey(start) !== dateKey) throw new Error('Invalid calendar date')
  const end = new Date(year, month - 1, day + 1)
  return [start.toISOString(), end.toISOString()]
}
