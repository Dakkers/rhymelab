import type { PrismaClient, Prisma } from "@rhymelab/database";

type ModelName = Prisma.ModelName;
type Delegate<M extends ModelName> = PrismaClient[Uncapitalize<M>];

export abstract class BaseModel<M extends ModelName> {
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

    async get<A extends Prisma.Args<Delegate<M>, "findUnique">>(
        args: Prisma.Exact<A, Prisma.Args<Delegate<M>, "findUnique">>,
    ): Promise<Prisma.Result<Delegate<M>, A, "findUnique">> {
        return this.delegate.findUnique(args as Prisma.Args<Delegate<M>, "findUnique">) as Promise<
            Prisma.Result<Delegate<M>, A, "findUnique">
        >;
    }

    async create<A extends Prisma.Args<Delegate<M>, "create">>(
        args: Prisma.Exact<A, Prisma.Args<Delegate<M>, "create">>,
    ): Promise<Prisma.Result<Delegate<M>, A, "create">> {
        return this.delegate.create(args as Prisma.Args<Delegate<M>, "create">) as Promise<
            Prisma.Result<Delegate<M>, A, "create">
        >;
    }

    // getAll / update / updateMany / deleteMany follow the same shape,
    // one per Prisma.Args<Delegate<M>, "<op>">
}