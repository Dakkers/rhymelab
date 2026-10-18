import { main } from "./cli.mts";

process.exitCode = await main(process.argv.slice(2));
