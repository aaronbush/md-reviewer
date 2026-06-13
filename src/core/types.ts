export interface Span {
  start: number;
  end: number;
}

export interface TextEdit {
  start: number;
  end: number;
  newText: string;
}

export type AnchorState = 'ok' | 'moved' | 'stale';

export interface ReviewComment {
  id: number;
  /** The [^rc-N] reference in the body. */
  marker: Span;
  /** Snapshot phrase from the definition, unescaped. Absent for block comments. */
  anchorPhrase?: string;
  /** Where the phrase was found in the body (ok/moved only). */
  anchorRange?: Span;
  state: AnchorState;
  /** Optional status word, e.g. "done". */
  status?: string;
  /** Comment text; continuation lines joined with \n. */
  text: string;
  replies: string[];
  /** The whole definition block, including continuation lines and trailing newline. */
  def: Span;
  /** 0-based line number of the definition's first line. */
  defLine: number;
}

export interface OrphanedDef {
  id: number;
  def: Span;
  defLine: number;
}

export interface DanglingMarker {
  id: number;
  marker: Span;
}

export interface ParseResult {
  comments: ReviewComment[];
  orphanedDefs: OrphanedDef[];
  danglingMarkers: DanglingMarker[];
}
