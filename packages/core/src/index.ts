/**
 * `@rhymelab/core` — framework-free shared domain used by both the web app and
 * the API: the enums the DB columns narrow to, the workbench colour/label
 * vocabularies, the lyrics parsing/section-detection, and annotation re-anchoring.
 * Nothing here may import a server or browser runtime.
 */
export * from "./constants";
export * from "./lyrics";
export * from "./anchor";
export * from "./annotations";
