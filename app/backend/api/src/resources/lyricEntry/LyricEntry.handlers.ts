import { ORPCError } from "@orpc/server";
import type { ContractImplementer } from "../../app/createOrpcRouter";

export function createLyricEntryHandlers(os: ContractImplementer) {
  const preventIdor = os.middleware(async ({ context, next }, input: { id: string }) => {
    const userId = context.session?.userId;
    if (!userId) {
      throw new ORPCError("UNAUTHORIZED");
    }
    if (!(await context.LyricEntryController.userOwns(userId, input.id))) {
      throw new ORPCError("NOT_FOUND");
    }
    return next();
  });

  return {
    create: os.lyricEntries.create.handler(async ({ context }) => {
      return context.LyricEntryController.create(context.session?.userId!);
    }),
    list: os.lyricEntries.list.handler(async ({ context }) => {
      return context.LyricEntryController.listForLibrary(context.session?.userId!);
    }),
    getItem: os.lyricEntries.getItem.use(preventIdor).handler(async ({ context, input }) => {
      return context.LyricEntryController.getDetails(input.id);
    }),
    updateBody: os.lyricEntries.updateBody.use(preventIdor).handler(async ({ context, input }) => {
      return context.db.$transaction(async (tx) =>
        context.LyricEntryController.updateBody(input.id, input.body, tx),
      );
    }),
    updateStructure: os.lyricEntries.updateStructure
      .use(preventIdor)
      .handler(async ({ context, input }) => {
        return context.db.$transaction(async (tx) =>
          context.LyricEntryController.updateStructure(input.id, input.structure, tx),
        );
      }),
    delete: os.lyricEntries.delete.use(preventIdor).handler(async ({ context, input }) => {
      await context.LyricEntryController.delete(input.id);
      return { ok: true as const };
    }),
  };
}
