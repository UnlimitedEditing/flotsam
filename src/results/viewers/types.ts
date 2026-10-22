/** App services a viewer may use without importing them (keeps viewers self-contained and testable). */
export interface ViewerHost {
  /** The file's name and the panel title the user sees. */
  title?: string
  /** Close the result panel. */
  close: () => void
  /** Keep the opened file in the library, when the panel was given a way to (not for items already in it). */
  saveToLibrary?: () => Promise<void>
}

export interface ViewerProps {
  filename: string
  data: Uint8Array
  host?: ViewerHost
}
