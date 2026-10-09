export const CURRENCIES = [
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'Pound sterling (GBP)' },
  { code: 'USD', label: 'US dollar (USD)' },
  { code: 'CHF', label: 'Swiss franc (CHF)' },
  { code: 'SEK', label: 'Swedish krona (SEK)' },
  { code: 'NOK', label: 'Norwegian krone (NOK)' },
  { code: 'DKK', label: 'Danish krone (DKK)' },
  { code: 'PLN', label: 'Polish złoty (PLN)' },
  { code: 'CZK', label: 'Czech koruna (CZK)' },
  { code: 'CAD', label: 'Canadian dollar (CAD)' },
  { code: 'AUD', label: 'Australian dollar (AUD)' },
  { code: 'NZD', label: 'New Zealand dollar (NZD)' },
]

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

let cachedZones: string[] | null = null

export function timezones(): string[] {
  if (!cachedZones) {
    let zones: string[] = []
    try {
      zones = Intl.supportedValuesOf('timeZone')
    } catch {
      zones = []
    }
    cachedZones = Array.from(new Set(['UTC', browserTimezone(), ...zones])).sort((a, b) => a.localeCompare(b))
  }
  return cachedZones
}
