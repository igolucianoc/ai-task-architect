// Formatação de data legível em pt-BR usando Intl (sem libs externas).

/**
 * Formata uma data ISO em um texto legível em pt-BR (ex.: "5 de fev. de 2024, 14:30").
 * Retorna o próprio valor recebido quando a data é inválida, evitando "Invalid Date".
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
