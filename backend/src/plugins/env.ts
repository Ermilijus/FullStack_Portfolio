import { config as loadDotEnv } from "dotenv";

loadDotEnv();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}

export type AppConfig = {
  PORT: number;
  HOST: string;
  DATABASE_URL: string;
  FRONTEND_ORIGIN: string;
  JWT_SECRET: string;
};

export const loadEnv = (): AppConfig => {
  const port = Number(process.env.PORT ?? "4000");
  const host = process.env.HOST ?? "127.0.0.1";
  const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
  const jwtSecret = process.env.JWT_SECRET ?? "sos123";

  return {
    PORT: port,
    HOST: host,
    DATABASE_URL: databaseUrl,
    FRONTEND_ORIGIN: frontendOrigin,
    JWT_SECRET: jwtSecret,
  };
};
