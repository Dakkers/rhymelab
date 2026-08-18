/**
 * The API surface, implemented against the api-contract. The product surface
 * (entries / sections / annotations) has been stripped back to bare auth while the
 * UX is redesigned from the ground up; new procedures get assembled here as the
 * shape settles.
 */
import { os } from "./orpc";
import { login, logout, me } from "./handlers/auth";
import {
  create as entriesCreate,
  get as entriesGet,
  list as entriesList,
  remove as entriesRemove,
  updateBody as entriesUpdateBody,
  updateStructure as entriesUpdateStructure,
} from "./handlers/entries";

export const router = os.router({
  auth: { login, logout, me },
  entries: {
    list: entriesList,
    create: entriesCreate,
    get: entriesGet,
    updateBody: entriesUpdateBody,
    updateStructure: entriesUpdateStructure,
    delete: entriesRemove,
  },
});
