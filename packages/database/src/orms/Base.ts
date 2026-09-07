import type { PrismaClient, Prisma } from "../_generated/prisma/client";

type ModelName = Prisma.ModelName;
type Delegate<M extends ModelName> = PrismaClient[Uncapitalize<M>];

export abstract class BaseOrm<M extends ModelName> {
  protected readonly db: PrismaClient;
  private readonly modelName: M;

  constructor(opts: { model: M; db: PrismaClient }) {
    this.db = opts.db;
    this.modelName = opts.model;
  }

  private get delegate(): Delegate<M> {
    const key = (this.modelName[0].toLowerCase() + this.modelName.slice(1)) as Uncapitalize<M>;
    return this.db[key] as Delegate<M>;
  }

  async findUnique<A extends Prisma.Args<Delegate<M>, "findUnique">>(
    args: Prisma.Exact<A, Prisma.Args<Delegate<M>, "findUnique">>,
  ): Promise<Prisma.Result<Delegate<M>, A, "findUnique">> {
    return this.delegate.findUnique(args as Prisma.Args<Delegate<M>, "findUnique">) as Promise<
      Prisma.Result<Delegate<M>, A, "findUnique">
    >;
  }

  async findFirst<A extends Prisma.Args<Delegate<M>, "findFirst">>(
    args: Prisma.Exact<A, Prisma.Args<Delegate<M>, "findFirst">>,
  ): Promise<Prisma.Result<Delegate<M>, A, "findFirst">> {
    return this.delegate.findFirst(args as Prisma.Args<Delegate<M>, "findFirst">) as Promise<
      Prisma.Result<Delegate<M>, A, "findFirst">
    >;
  }

  async findMany<A extends Prisma.Args<Delegate<M>, "findMany">>(
    args: Prisma.Exact<A, Prisma.Args<Delegate<M>, "findMany">>,
  ): Promise<Prisma.Result<Delegate<M>, A, "findMany">> {
    return this.delegate.findMany(args as Prisma.Args<Delegate<M>, "findMany">) as Promise<
      Prisma.Result<Delegate<M>, A, "findMany">
    >;
  }

  async create<A extends Prisma.Args<Delegate<M>, "create">>(
    args: Prisma.Exact<A, Prisma.Args<Delegate<M>, "create">>,
  ): Promise<Prisma.Result<Delegate<M>, A, "create">> {
    return this.delegate.create(args as Prisma.Args<Delegate<M>, "create">) as Promise<
      Prisma.Result<Delegate<M>, A, "create">
    >;
  }

  protected async softDeleteTemplate(
    tableName: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const db = tx ?? this.db;
    const affected = await db.$executeRaw`
      UPDATE "${tableName}"
      SET "deleted_at" = (NOW() AT TIME ZONE 'UTC')
      WHERE "id" = ${id}::uuid AND "deleted_at" IS NULL
    `;
    return affected > 0;
  }

  // getAll / update / updateMany / deleteMany follow the same shape,
  // one per Prisma.Args<Delegate<M>, "<op>">
}
