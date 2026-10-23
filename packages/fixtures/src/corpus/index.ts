/**
 * Public-domain pieces in hand-annotated markup. Safe to commit and seed on a
 * fresh clone. Titles MUST be unique: the seed dedupes on them.
 */
import { amazingGrace } from "./amazingGrace";
import { battleHymn } from "./battleHymn";
import type { CorpusEntry } from "./CorpusEntry";
import { sonnet18 } from "./sonnet18";
import { stoppingByWoods } from "./stoppingByWoods";
import { theTyger } from "./theTyger";

export const CORPUS: readonly CorpusEntry[] = [
  sonnet18,
  theTyger,
  stoppingByWoods,
  amazingGrace,
  battleHymn,
];

export type { CorpusEntry } from "./CorpusEntry";
