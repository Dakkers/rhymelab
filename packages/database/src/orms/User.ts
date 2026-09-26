import type { PrismaClient } from "@rhymelab/database";
import { BaseOrm } from "./Base";

export class UserOrm extends BaseOrm<"User"> {
  constructor(db: PrismaClient) {
    super({ model: "User", db });
  }
}
