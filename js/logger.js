/**
 * Logger - Sistema de log para a interface do OpenAI Realtime
 *
 * Gerencia a exibição de logs na interface, com diferentes níveis de severidade
 * (info, success, warning, error) e formatação automática de timestamp.
 */
class Logger {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error("Elemento de log não encontrado:", containerId);
      return;
    }

    this.maxEntries = 100; // Limite máximo de entradas de log para evitar sobrecarga
  }

  /**
   * Formata a hora atual para exibição nos logs
   * @returns {string} Hora formatada como HH:MM:SS
   */
  getTimestamp() {
    const now = new Date();
    return now.toTimeString().split(" ")[0];
  }

  /**
   * Método genérico para adicionar uma entrada de log
   * @param {string} message - Mensagem a ser exibida
   * @param {string} level - Nível do log (info, success, warning, error)
   */
  log(message, level = "info") {
    if (!this.container) return;

    // Cria o elemento de log
    const logEntry = document.createElement("div");
    logEntry.classList.add("log-entry", `log-${level}`);

    // Adiciona o timestamp
    const timestamp = document.createElement("span");
    timestamp.classList.add("timestamp");
    timestamp.textContent = this.getTimestamp();

    // Adiciona a mensagem
    const content = document.createElement("span");
    content.classList.add("log-message");
    content.textContent = message;

    // Monta a entrada de log
    logEntry.appendChild(timestamp);
    logEntry.appendChild(content);

    // Adiciona ao container
    this.container.appendChild(logEntry);

    // Rola para o fim para mostrar a entrada mais recente
    this.container.scrollTop = this.container.scrollHeight;

    // Limita o número de entradas
    this.trimLogEntries();

    // Também loga no console para facilitar o debugging
    console[level === "error" ? "error" : "log"](
      `[${level.toUpperCase()}] ${message}`
    );
  }

  /**
   * Remove entradas antigas se exceder o limite máximo
   */
  trimLogEntries() {
    while (this.container.children.length > this.maxEntries) {
      this.container.removeChild(this.container.firstChild);
    }
  }

  /**
   * Limpa todas as entradas de log
   */
  clear() {
    if (this.container) {
      this.container.innerHTML = "";
      this.log("Log limpo", "info");
    }
  }

  /**
   * Adiciona um log de nível informativo
   * @param {string} message - Mensagem a ser exibida
   */
  info(message) {
    this.log(message, "info");
  }

  /**
   * Adiciona um log de sucesso
   * @param {string} message - Mensagem a ser exibida
   */
  success(message) {
    this.log(message, "success");
  }

  /**
   * Adiciona um log de aviso
   * @param {string} message - Mensagem a ser exibida
   */
  warning(message) {
    this.log(message, "warning");
  }

  /**
   * Adiciona um log de erro
   * @param {string} message - Mensagem a ser exibida
   */
  error(message) {
    this.log(message, "error");
  }

  /**
   * Loga um objeto JSON de forma formatada
   * @param {Object} data - O objeto a ser logado
   * @param {string} label - Um rótulo opcional para o objeto
   * @param {string} level - Nível do log (info, success, warning, error)
   */
  logObject(data, label = "Objeto", level = "info") {
    try {
      // Mostra apenas informações essenciais para eventos comuns
      let simpleObject = data;

      // Se é um objeto grande, simplifica para o log
      if (typeof data === "object" && data !== null) {
        // Copia apenas propriedades principais para evitar objetos muito grandes
        if (data.type) {
          // Para eventos, mostra apenas tipo e ID
          simpleObject = {
            type: data.type,
            event_id: data.event_id || "N/A",
          };

          // Adiciona outras propriedades chave se existirem
          if (data.item_id) simpleObject.item_id = data.item_id;
          if (data.response_id) simpleObject.response_id = data.response_id;
          if (data.delta) simpleObject.delta = data.delta;
        }
      }

      const message = `${label}: ${JSON.stringify(simpleObject)}`;
      this.log(message, level);
    } catch (error) {
      this.error(`Erro ao logar objeto: ${error.message}`);
    }
  }
}

// Inicializa a instância global do logger
const logger = new Logger("logContent");
