/**
 * Converts Quill editor HTML to email-friendly HTML with inline styles.
 * Email clients typically strip CSS classes, so we need inline styles.
 */

const TABLE_STYLES = {
  table: 'border-collapse: collapse; width: 100%; margin: 16px 0; font-family: Arial, sans-serif;',
  th: 'border: 1px solid #374151; padding: 12px 16px; background-color: #f3f4f6; font-weight: 600; text-align: left;',
  td: 'border: 1px solid #d1d5db; padding: 10px 16px; text-align: left;',
  tr_even: 'background-color: #f9fafb;',
  tr_odd: 'background-color: #ffffff;',
}

/**
 * Converts HTML content with Quill table classes to email-friendly inline styles
 */
export function convertToEmailHtml(html: string): string {
  if (!html) return html

  // Create a temporary DOM element to parse the HTML
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Process all tables
  const tables = doc.querySelectorAll('table')
  tables.forEach((table) => {
    table.setAttribute('style', TABLE_STYLES.table)
    table.setAttribute('cellpadding', '0')
    table.setAttribute('cellspacing', '0')

    // Process rows
    const rows = table.querySelectorAll('tr')
    rows.forEach((row, index) => {
      const bgStyle = index % 2 === 0 ? TABLE_STYLES.tr_odd : TABLE_STYLES.tr_even
      row.setAttribute('style', bgStyle)

      // Process cells
      const cells = row.querySelectorAll('td, th')
      cells.forEach((cell) => {
        const isHeader = cell.tagName.toLowerCase() === 'th'
        const baseStyle = isHeader ? TABLE_STYLES.th : TABLE_STYLES.td

        // Preserve any existing inline styles (like background-color from the editor)
        const existingStyle = cell.getAttribute('style') || ''
        const mergedStyle = existingStyle ? `${baseStyle} ${existingStyle}` : baseStyle
        cell.setAttribute('style', mergedStyle)
      })
    })
  })

  // Process blockquotes
  const blockquotes = doc.querySelectorAll('blockquote')
  blockquotes.forEach((bq) => {
    bq.setAttribute('style', 'border-left: 4px solid #d1d5db; margin: 16px 0; padding: 8px 16px; color: #4b5563;')
  })

  // Process code blocks
  const codeBlocks = doc.querySelectorAll('pre')
  codeBlocks.forEach((pre) => {
    pre.setAttribute('style', 'background-color: #1f2937; color: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace;')
  })

  // Process inline code
  const inlineCodes = doc.querySelectorAll('code')
  inlineCodes.forEach((code) => {
    if (code.parentElement?.tagName.toLowerCase() !== 'pre') {
      code.setAttribute('style', 'background-color: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em;')
    }
  })

  // Process links
  const links = doc.querySelectorAll('a')
  links.forEach((link) => {
    link.setAttribute('style', 'color: #2563eb; text-decoration: underline;')
  })

  // Process headers
  const headers = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')
  headers.forEach((header) => {
    const level = parseInt(header.tagName.charAt(1))
    const fontSize = Math.max(24 - (level - 1) * 4, 14)
    header.setAttribute('style', `font-size: ${fontSize}px; font-weight: 600; margin: 16px 0 8px 0; color: #111827;`)
  })

  // Process lists
  const lists = doc.querySelectorAll('ul, ol')
  lists.forEach((list) => {
    list.setAttribute('style', 'margin: 8px 0; padding-left: 24px;')
  })

  const listItems = doc.querySelectorAll('li')
  listItems.forEach((li) => {
    li.setAttribute('style', 'margin: 4px 0;')
  })

  // Return the processed HTML
  return doc.body.innerHTML
}

/**
 * Wraps content in a basic email template
 */
export function wrapInEmailTemplate(content: string, subject?: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject || 'Report'}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 800px; margin: 0 auto; padding: 20px;">
  ${content}
</body>
</html>
  `.trim()
}
