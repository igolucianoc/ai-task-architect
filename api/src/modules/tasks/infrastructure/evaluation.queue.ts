import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/** Nome canônico da fila de avaliação (LLM-as-Judge assíncrono — ADR-006). */
export const EVALUATION_QUEUE = 'evaluation';

/**
 * Payload mínimo do job de avaliação. Carregamos apenas o `taskId`: o worker
 * reidrata a `description` e a especificação a partir do banco. Assim o job
 * permanece pequeno e não duplica dados que já estão persistidos.
 */
export interface EvaluationJobData {
  taskId: string;
}

/**
 * Serviço de enfileiramento da avaliação. Encapsula a fila BullMQ para que os
 * chamadores (ex.: o controller SSE) não dependam diretamente do SDK.
 */
@Injectable()
export class EvaluationQueue {
  private readonly logger = new Logger(EvaluationQueue.name);

  constructor(@InjectQueue(EVALUATION_QUEUE) private readonly queue: Queue<EvaluationJobData>) {}

  /**
   * Enfileira a avaliação de uma task. Usa `jobId = taskId` (determinístico)
   * para que reabrir o stream da mesma task não crie avaliações duplicadas — o
   * BullMQ descarta um job cujo id já existe na fila.
   */
  async enqueue(payload: EvaluationJobData): Promise<void> {
    await this.queue.add('evaluate', payload, { jobId: payload.taskId });
    this.logger.log(`avaliação enfileirada taskId=${payload.taskId}`);
  }
}
