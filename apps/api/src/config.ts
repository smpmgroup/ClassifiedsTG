import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().min(1),
  TELEGRAM_GROUP_ID: z.preprocess((value) => value === "" || value == null ? undefined : value, z.coerce.bigint().optional()),
  TELEGRAM_GROUP_INVITE_URL: z.preprocess((value) => value === "" || value == null ? undefined : value, z.string().url().optional()),
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(3600), MEMBERSHIP_CACHE_SECONDS: z.coerce.number().int().positive().default(600),
  ACCESS_TOKEN_SECRET: z.string().min(32), ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REDIS_URL: z.string().url(), APP_URL: z.string().url(), UPLOAD_DIR: z.string().default('/app/uploads'),
  MAX_LISTING_IMAGES: z.coerce.number().int().min(1).max(20).default(10), MAX_IMAGE_SIZE_MB: z.coerce.number().positive().default(10),
  MAX_LISTING_TITLE_LENGTH: z.coerce.number().int().default(80), MAX_LISTING_DESCRIPTION_LENGTH: z.coerce.number().int().default(3000),
  STRIPE_SECRET_KEY: z.preprocess((value) => value === "" || value == null ? undefined : value, z.string().startsWith("sk_").optional()),
  STRIPE_WEBHOOK_SECRET: z.preprocess((value) => value === "" || value == null ? undefined : value, z.string().startsWith("whsec_").optional()),
  STRIPE_CONNECT_COUNTRY: z.string().length(2).default("ES"),
});
export type Config = z.infer<typeof schema>;
export function loadConfig(env = process.env): Config { const parsed=schema.safeParse(env); if(!parsed.success) throw new Error(`Invalid environment: ${parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')}`); return parsed.data; }
