declare module 'quill-better-table' {
  import Quill from 'quill'

  interface BetterTableOptions {
    operationMenu?: {
      items?: {
        unmergeCells?: {
          text?: string
        }
      }
    }
  }

  interface BetterTableModule {
    insertTable(rows: number, columns: number): void
    getTable(range?: { index: number; length: number }): [HTMLTableElement | null, HTMLTableRowElement | null, HTMLTableCellElement | null, number]
  }

  class QuillBetterTable {
    static keyboardBindings: Record<string, unknown>
    constructor(quill: Quill, options?: BetterTableOptions)
    insertTable(rows: number, columns: number): void
  }

  export default QuillBetterTable
  export { BetterTableOptions, BetterTableModule }
}
