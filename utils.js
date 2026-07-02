export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function normalizeErrorMessage(error, fallbackMessage = 'Não foi possível concluir a operação. Tente novamente.') {
  if (!error) return fallbackMessage;
  if (typeof error === 'string') return error;
  if (error.message) {
    const message = error.message.toLowerCase();
    if (message.includes('failed to fetch') || message.includes('network') || message.includes('load failed') || message.includes('err_network')) {
      return 'Conexão instável. Verifique a internet e tente novamente.';
    }
    if (message.includes('timeout')) {
      return 'A operação demorou demais. Tente novamente.';
    }
    if (message.includes('jwt') || message.includes('token')) {
      return 'Sua sessão expirou. Faça login novamente.';
    }
    if (message.includes('permission') || message.includes('forbidden')) {
      return 'Você não tem permissão para realizar esta ação.';
    }
    if (message.includes('duplicate') || message.includes('unique')) {
      return 'Essas informações já existem no sistema.';
    }
    if (message.includes('not found')) {
      return 'Registro não encontrado.';
    }
    return error.message;
  }
  return fallbackMessage;
}

export function isRetryableError(error) {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('socket') ||
    message.includes('err_network') ||
    (error.status >= 500 && error.status < 600) ||
    error.status === 408 ||
    error.status === 429;
}

export async function safeCall(fn, { onError, retries = 1, fallbackMessage = 'Não foi possível concluir a operação. Tente novamente.', showToast = true, toastType = 'error', toastFn } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      if (result && result.error) {
        throw result.error;
      }
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt >= retries) {
        break;
      }
      await delay(600 * (attempt + 1));
    }
  }

  const message = normalizeErrorMessage(lastError, fallbackMessage);
  if (typeof onError === 'function') {
    onError(lastError, message);
  } else if (showToast && typeof toastFn === 'function') {
    toastFn(message, toastType);
  }

  return { data: null, error: lastError, message };
}
