// Instância única (singleton) do http client da aplicação.
//
// Os hooks ligam o client ao "token holder" (auth-token-holder), nunca à store
// diretamente — o que evita o ciclo de import store -> service -> store:
//   - getAccessToken: lê o token em memória do holder.
//   - onTokenRefreshed: atualiza o holder com o token renovado. A store, ao
//     escrever/registrar no holder, mantém seu estado sincronizado.
//   - onAuthError: notifica o holder, que dispara o handler registrado pela
//     store (limpeza de sessão).

import { createHttpClient, type HttpClient } from './http-client';
import { getAccessToken, setAccessToken, notifyAuthError } from './auth-token-holder';

/** Client HTTP compartilhado por services e stores. */
export const httpClient: HttpClient = createHttpClient({
  getAccessToken: () => getAccessToken(),
  onTokenRefreshed: (token: string) => {
    setAccessToken(token);
  },
  onAuthError: () => {
    notifyAuthError();
  },
});
