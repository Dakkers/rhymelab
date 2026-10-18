import type { CorpusEntry } from "./CorpusEntry";

export const sonnet18: CorpusEntry = {
  title: "Sonnet 18",
  kind: "poem",
  authors: ["William Shakespeare"],
  year: 1609,
  annotated: `
[Stanza]
Shall I compare thee to a summer's day? | A
Thou art more lovely and more temperate: | B
Rough winds do shake the darling buds of May, | A
And summer's lease hath all too short a date; | B

[Stanza]
Sometime too hot the eye of heaven shines, | C
And often is his gold complexion dimm'd; | D
And every fair from fair sometime declines, | C
By chance or nature's changing course untrimm'd; | D

[Stanza]
But thy eternal summer shall not fade, | E
Nor lose possession of that fair thou ow'st; | F
Nor shall death brag thou wander'st in his shade, | E
When in eternal lines to time thou grow'st: | F

[Stanza]
So long as men can breathe or eyes can see, | G
So long lives this, and this gives life to thee. | G
`,
};
