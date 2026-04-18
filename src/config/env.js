import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().url("Must be a valid MongoDB URI"),
  DATABASE_NAME: z.string().min(1, "Database name cannot be empty"),
  AWS_REGION: z.string().min(1, "AWS Region must be set"),
  AWS_PROFILE: z.string().min(1, "AWS Profile must be set"),
  COMPLETION_MODEL: z.string().min(1, "Completion model must be set"),
  EMBEDDING_MODEL: z.string().min(1, "Embedding model must be set"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

// Parse the environment variables right away.
// If missing or invalid, Zod throws a helpful error string naturally.
export const env = envSchema.parse(process.env);
