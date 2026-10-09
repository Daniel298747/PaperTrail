export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
export const ACCEPT_ATTRIBUTE = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Quick client-side check for instant feedback; the server re-validates the actual bytes. */
export function checkStatementFile(file: File): string | null {
  const extensionOk = /\.(pdf|jpe?g|png)$/i.test(file.name)
  if (!ACCEPTED_TYPES.includes(file.type) && !extensionOk) return 'Choose a PDF, JPG or PNG file.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_UPLOAD_BYTES) return 'That file is larger than 10 MB.'
  return null
}
