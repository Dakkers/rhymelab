import type { ContractImplementer } from "../../app/createOrpcRouter";
import { RlNotFoundError, RlUnauthorizedError } from "@rhymelab/utils";

export function createLyricEntryHandlers(os: ContractImplementer) {
  const preventIdor = os.middleware(async ({ context, next }, input: { id: string }) => {
    const userId = context.session?.userId;
    if (!userId) {
      throw new RlUnauthorizedError();
    }
    if (!(await context.LyricEntryController.userOwns(userId, input.id))) {
      throw new RlNotFoundError();
    }
    return next();
  });

  return {
    create: os.lyricEntries.create.handler(async ({ context, input }) => {
      return context.LyricEntryController.create({ ...input, userId: context.userId });
    }),
    list: os.lyricEntries.list.handler(async ({ context }) => {
      return context.LyricEntryController.listForLibrary(context.userId);
    }),
    getItem: os.lyricEntries.getItem.use(preventIdor).handler(async ({ context, input }) => {
      const result = await context.LyricEntryController.getDetails(input.id);
      if (!result) {
        throw new RlNotFoundError();
      }
      return result;
    }),
    updateBody: os.lyricEntries.updateBody.use(preventIdor).handler(async ({ context, input }) => {
      await context.db.$transaction(async (tx) =>
        context.LyricEntryController.updateBody(input.id, input.body, tx),
      );
      return context.reply.status(204).send();
    }),
    updateStructure: os.lyricEntries.updateStructure
      .use(preventIdor)
      .handler(async ({ context, input }) => {
        await context.db.$transaction(async (tx) =>
          context.LyricEntryController.updateStructure(input.id, input.structure, tx),
        );
        return context.reply.status(204).send();
      }),
    delete: os.lyricEntries.delete.use(preventIdor).handler(async ({ context, input }) => {
      await context.LyricEntryController.delete(input.id);
      return context.reply.status(204).send();
    }),
  };
}
