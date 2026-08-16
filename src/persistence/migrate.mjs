import { PostgresTripRepository } from "./postgres-trip-repository.mjs";

if (!process.env.DATABASE_URL) {
  process.stderr.write("DATABASE_URL is required for db:migrate\n");
  process.exitCode = 1;
} else {
  const repository = new PostgresTripRepository({ databaseUrl: process.env.DATABASE_URL });
  await repository.migrate();
  await repository.close();
  process.stdout.write("PostgreSQL trip schema is ready.\n");
}
