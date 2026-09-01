-- CreateEnum
CREATE TYPE "QualityGateResult" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "task_evaluations" ADD COLUMN     "prompt_version" TEXT,
ADD COLUMN     "result" "QualityGateResult";
