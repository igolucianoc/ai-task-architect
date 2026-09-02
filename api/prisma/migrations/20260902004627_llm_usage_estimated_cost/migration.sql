-- AlterTable
ALTER TABLE "llm_usages" ADD COLUMN     "estimated_cost" DECIMAL(12,6) NOT NULL DEFAULT 0;
