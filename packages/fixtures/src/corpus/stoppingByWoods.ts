import type { CorpusEntry } from "./CorpusEntry";

export const stoppingByWoods: CorpusEntry = {
  title: "Stopping by Woods on a Snowy Evening",
  kind: "poem",
  authors: ["Robert Frost"],
  year: 1923,
  annotated: `
Whose woods these are I think I know. | A
His house is in the village though; | A
He will not see me stopping here | B @here >
To watch his woods fill up with snow. | A

My little horse must think it queer | A @here >
To stop without a farmhouse near | A
Between the woods and frozen lake | B @lake
The darkest evening of the year. | A

He gives his harness bells a shake | A @lake >
To ask if there is some mistake. | A
The only other sound's the sweep | B @sweep >
Of easy wind and downy flake. | A

The woods are lovely, dark and deep, | A @sweep
But I have promises to keep, | A
And miles to go before I sleep, | A
And miles to go before I sleep. | A
`,
};
