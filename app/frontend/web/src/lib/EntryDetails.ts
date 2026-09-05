import { splitSections, type EntrySummary } from "@rhymelab/api-contract";

class EntryDetails {
  #sections: EntrySection[];

  constructor(schema: EntrySummary) {
    this.#sections = splitSections(schema)
  }
}

class EntrySection {

}

class SectionLine {
  #section: EntrySection;
  #text: string = ''

  constructor(
    content: string,
    section: EntrySection
  ) {
    this.#section = section;
  }
}