-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'STREAMING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "GenerationRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('PENDING', 'COMPLETED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "LlmOperation" AS ENUM ('GENERATION', 'EVALUATION');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_generation_runs" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "status" "GenerationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "model" TEXT NOT NULL,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "task_generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_artifacts" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "generation_run_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "content_format" TEXT NOT NULL DEFAULT 'markdown',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_evaluations" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "score" DECIMAL(4,2),
    "rationale" TEXT,
    "dimensions" JSONB,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_usages" (
    "id" UUID NOT NULL,
    "operation" "LlmOperation" NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL,
    "completion_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generation_run_id" UUID,
    "evaluation_id" UUID,

    CONSTRAINT "llm_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");

-- CreateIndex
CREATE INDEX "refresh_sessions_expires_at_idx" ON "refresh_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "tasks_user_id_created_at_idx" ON "tasks"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "task_generation_runs_task_id_idx" ON "task_generation_runs"("task_id");

-- CreateIndex
CREATE INDEX "task_generation_runs_status_idx" ON "task_generation_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "task_artifacts_generation_run_id_key" ON "task_artifacts"("generation_run_id");

-- CreateIndex
CREATE INDEX "task_artifacts_task_id_idx" ON "task_artifacts"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_evaluations_task_id_key" ON "task_evaluations"("task_id");

-- CreateIndex
CREATE INDEX "task_evaluations_status_idx" ON "task_evaluations"("status");

-- CreateIndex
CREATE INDEX "llm_usages_operation_idx" ON "llm_usages"("operation");

-- CreateIndex
CREATE INDEX "llm_usages_generation_run_id_idx" ON "llm_usages"("generation_run_id");

-- CreateIndex
CREATE INDEX "llm_usages_evaluation_id_idx" ON "llm_usages"("evaluation_id");

-- CreateIndex
CREATE INDEX "llm_usages_created_at_idx" ON "llm_usages"("created_at");

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_generation_runs" ADD CONSTRAINT "task_generation_runs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_artifacts" ADD CONSTRAINT "task_artifacts_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_artifacts" ADD CONSTRAINT "task_artifacts_generation_run_id_fkey" FOREIGN KEY ("generation_run_id") REFERENCES "task_generation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_evaluations" ADD CONSTRAINT "task_evaluations_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_usages" ADD CONSTRAINT "llm_usages_generation_run_id_fkey" FOREIGN KEY ("generation_run_id") REFERENCES "task_generation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_usages" ADD CONSTRAINT "llm_usages_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "task_evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
