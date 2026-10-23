/** A public-domain piece in hand-annotated markup. See {@link parseAnnotatedBody}. */
export interface CorpusEntry {
  title: string;
  kind: "poem" | "song";
  authors: string[];
  year: number;
  annotated: string;
}
