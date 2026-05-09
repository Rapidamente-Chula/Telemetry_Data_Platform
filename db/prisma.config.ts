import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'

// Load the single root .env (one directory up from db/)
config({ path: '/.env' })

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
})
