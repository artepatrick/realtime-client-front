/**
 * WebSocketManager - Gerencia a conexão WebSocket com o servidor OpenAI Realtime
 *
 * Responsável por estabelecer e gerenciar a conexão WebSocket, enviar comandos
 * para o servidor e processar as respostas.
 */
class WebSocketManager {
  constructor(serverUrl) {
    // Estado da conexão
    this.socket = null;
    this.serverUrl = serverUrl || "ws://localhost:8080/";
    this.isConnected = false;
    this.isConnecting = false;
    this.eventId = 0;

    // Para tratamento de reconexão
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000; // Tempo inicial entre tentativas (ms)

    // Estado da conversa
    this.sessionId = null;
    this.conversationId = null;
    this.currentResponseId = null;

    // Estado do buffer de áudio
    this.pendingAudioBuffers = 0;

    // Referência para os elementos da UI
    this.statusElement = document.querySelector(".connection-status");

    // Callbacks
    this.onConnect = null;
    this.onDisconnect = null;
    this.onTextResponse = null;
    this.onAudioResponse = null;
  }

  /**
   * Conecta ao servidor WebSocket
   */
  connect() {
    if (this.isConnected || this.isConnecting) {
      logger.warning("Já está conectado ou conectando");
      return;
    }

    this.isConnecting = true;
    this.updateConnectionStatus("connecting");
    logger.info(`Conectando ao servidor: ${this.serverUrl}`);

    try {
      this.socket = new WebSocket(this.serverUrl);

      // Define handlers para eventos WebSocket
      this.socket.onopen = this.handleOpen.bind(this);
      this.socket.onclose = this.handleClose.bind(this);
      this.socket.onerror = this.handleError.bind(this);
      this.socket.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      logger.error(`Erro ao criar WebSocket: ${error.message}`);
      this.isConnecting = false;
      this.updateConnectionStatus("offline");
    }
  }

  /**
   * Desconecta do servidor WebSocket
   */
  disconnect() {
    if (!this.isConnected && !this.socket) {
      logger.warning("Não está conectado");
      return;
    }

    logger.info("Desconectando do servidor");

    if (this.socket) {
      // Limpar os handlers para evitar chamadas indesejadas
      this.socket.onopen = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;

      // Fechar a conexão
      this.socket.close();
      this.socket = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.updateConnectionStatus("offline");

    // Limpar o estado da conversa
    this.sessionId = null;
    this.conversationId = null;
    this.currentResponseId = null;
    this.pendingAudioBuffers = 0;

    // Chamar o callback de desconexão
    if (this.onDisconnect) {
      this.onDisconnect();
    }
  }

  /**
   * Handler para quando a conexão WebSocket é aberta
   */
  handleOpen() {
    logger.success("Conexão WebSocket estabelecida");
    this.isConnected = true;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.updateConnectionStatus("online");

    // Chamar o callback de conexão
    if (this.onConnect) {
      this.onConnect();
    }
  }

  /**
   * Handler para quando a conexão WebSocket é fechada
   * @param {Event} event - Evento de fechamento
   */
  handleClose(event) {
    if (this.isConnected) {
      logger.warning(
        `Conexão WebSocket fechada: ${event.code} - ${event.reason}`
      );
      this.isConnected = false;
    }

    this.isConnecting = false;
    this.updateConnectionStatus("offline");

    // Tenta reconectar automaticamente se não for um fechamento intencional
    if (
      event.code !== 1000 &&
      this.reconnectAttempts < this.maxReconnectAttempts
    ) {
      this.attemptReconnect();
    } else {
      // Chamar o callback de desconexão
      if (this.onDisconnect) {
        this.onDisconnect();
      }
    }
  }

  /**
   * Handler para erros na conexão WebSocket
   * @param {Event} error - Evento de erro
   */
  handleError(error) {
    logger.error("Erro na conexão WebSocket");
    this.updateConnectionStatus("offline");
  }

  /**
   * Tenta reconectar ao servidor com backoff exponencial
   */
  attemptReconnect() {
    this.reconnectAttempts++;
    const delay =
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

    logger.info(
      `Tentando reconectar em ${delay / 1000} segundos (tentativa ${
        this.reconnectAttempts
      }/${this.maxReconnectAttempts})...`
    );

    setTimeout(() => {
      if (!this.isConnected && !this.isConnecting) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Atualiza o indicador visual de status de conexão
   * @param {string} status - Status da conexão ('offline', 'connecting', 'online')
   */
  updateConnectionStatus(status) {
    if (!this.statusElement) return;

    // Remove classes antigas
    this.statusElement.classList.remove("offline", "connecting", "online");

    // Adiciona a nova classe
    this.statusElement.classList.add(status);

    // Atualiza o texto
    const statusTextElement = this.statusElement.querySelector(".status-text");
    if (statusTextElement) {
      switch (status) {
        case "offline":
          statusTextElement.textContent = "Desconectado";
          break;
        case "connecting":
          statusTextElement.textContent = "Conectando...";
          break;
        case "online":
          statusTextElement.textContent = "Conectado";
          break;
      }
    }
  }

  /**
   * Processa as mensagens recebidas do servidor
   * @param {MessageEvent} event - Evento de mensagem
   */
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);

      // Loga a mensagem recebida
      logger.logObject(data, `Recebido: ${data.type}`);

      // Processa a mensagem de acordo com o tipo
      switch (data.type) {
        case "session.created":
          this.handleSessionCreated(data);
          break;

        case "conversation.created":
          this.handleConversationCreated(data);
          break;

        case "input_audio_buffer.committed":
          logger.info(`Buffer de áudio confirmado, item_id: ${data.item_id}`);
          break;

        case "response.created":
          this.currentResponseId = data.response.id;
          logger.info(`Nova resposta criada: ${this.currentResponseId}`);
          break;

        case "response.text.delta":
          // Processa o delta de texto
          if (this.onTextResponse) {
            this.onTextResponse(data.delta, false);
          }
          break;

        case "response.text.done":
          // Processa o fim do texto
          if (this.onTextResponse) {
            this.onTextResponse(data.text, true);
          }
          break;

        case "response.audio.delta":
          // Processa dados de áudio
          if (this.onAudioResponse && data.delta) {
            // Decodifica o base64 para um array de bytes
            const audioBytes = this.base64ToUint8Array(data.delta);
            this.onAudioResponse(audioBytes, false);
          }
          break;

        case "response.audio.done":
          // Sinaliza que o streaming de áudio terminou
          if (this.onAudioResponse) {
            this.onAudioResponse(null, true);
          }
          break;

        case "error":
          this.handleError(data.error);
          break;

        default:
          // Para outros tipos de eventos, apenas loga
          break;
      }
    } catch (error) {
      logger.error(`Erro ao processar mensagem: ${error.message}`);
    }
  }

  /**
   * Processa a criação da sessão
   * @param {Object} data - Dados do evento
   */
  handleSessionCreated(data) {
    this.sessionId = data.session.id;
    logger.success(`Sessão criada: ${this.sessionId}`);

    // Configura as modalidades para áudio e texto
    this.updateSession({
      modalities: ["audio", "text"],
      voice: "alloy",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      turn_detection: {
        type: "semantic_vad", // "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 700,
      },
    });
  }

  /**
   * Processa a criação da conversa
   * @param {Object} data - Dados do evento
   */
  handleConversationCreated(data) {
    this.conversationId = data.conversation.id;
    logger.info(`Conversa criada: ${this.conversationId}`);
  }

  /**
   * Processa erros do servidor
   * @param {Object} error - Objeto de erro
   */
  handleError(error) {
    logger.error(`Erro do servidor: ${error.message || JSON.stringify(error)}`);
  }

  /**
   * Gera um novo ID de evento
   * @returns {string} ID do evento
   */
  generateEventId() {
    return `evt_${Date.now()}_${++this.eventId}`;
  }

  /**
   * Envia uma mensagem para o servidor
   * @param {Object} message - Mensagem a ser enviada
   */
  sendMessage(message) {
    if (!this.isConnected || !this.socket) {
      logger.error("Não conectado ao servidor");
      return;
    }

    try {
      // Adiciona um ID de evento se não tiver
      if (!message.event_id) {
        message.event_id = this.generateEventId();
      }

      // Converte para string e envia
      const messageString = JSON.stringify(message);
      this.socket.send(messageString);

      // Loga a mensagem enviada (simplificada)
      logger.logObject(message, `Enviado: ${message.type}`);

      return message.event_id;
    } catch (error) {
      logger.error(`Erro ao enviar mensagem: ${error.message}`);
      return null;
    }
  }

  /**
   * Atualiza a configuração da sessão
   * @param {Object} config - Novas configurações
   */
  updateSession(config) {
    const message = {
      type: "session.update",
      session: config,
    };

    return this.sendMessage(message);
  }

  /**
   * Adiciona áudio ao buffer de entrada
   * @param {Int16Array} audioData - Dados de áudio PCM16
   */
  appendAudioBuffer(audioData) {
    if (!this.isConnected) {
      logger.warning("Não conectado ao servidor, não é possível enviar áudio");
      return null;
    }

    // Incrementa o contador de buffers pendentes
    this.pendingAudioBuffers++;

    // Converte os dados de áudio para base64
    const base64Audio = this.arrayToBase64(audioData);

    const message = {
      type: "input_audio_buffer.append",
      audio: base64Audio,
    };

    console.log(`Enviando buffer de áudio (${audioData.length} amostras)`);

    return this.sendMessage(message);
  }

  /**
   * Confirma o buffer de áudio (envia para processamento)
   */
  commitAudioBuffer() {
    if (this.pendingAudioBuffers <= 0) {
      logger.warning("Nenhum buffer de áudio para confirmar");
      return null;
    }

    const message = {
      type: "input_audio_buffer.commit",
    };

    // Resetar o contador de buffers pendentes
    this.pendingAudioBuffers = 0;

    logger.info("Confirmando buffer de áudio para processamento");
    return this.sendMessage(message);
  }

  /**
   * Limpa o buffer de áudio
   */
  clearAudioBuffer() {
    const message = {
      type: "input_audio_buffer.clear",
    };

    // Resetar o contador de buffers pendentes
    this.pendingAudioBuffers = 0;

    return this.sendMessage(message);
  }

  /**
   * Cria uma nova resposta (solicita ao modelo)
   */
  createResponse() {
    const message = {
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
      },
    };

    return this.sendMessage(message);
  }

  /**
   * Cancela uma resposta em andamento
   */
  cancelResponse() {
    if (!this.currentResponseId) {
      logger.warning("Nenhuma resposta ativa para cancelar");
      return null;
    }

    const message = {
      type: "response.cancel",
      response_id: this.currentResponseId,
    };

    return this.sendMessage(message);
  }

  /**
   * Converte um array para Base64
   * @param {TypedArray} buffer - Buffer de dados
   * @returns {string} - String em Base64
   */
  arrayToBase64(buffer) {
    // Garantir que estamos trabalhando com Uint8Array para conversão correta
    let bytes;

    if (buffer instanceof Int16Array) {
      // Converte diretamente o buffer de Int16Array para Uint8Array preservando os bytes
      bytes = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength
      );
    } else if (buffer instanceof Uint8Array) {
      bytes = buffer;
    } else {
      bytes = new Uint8Array(buffer);
    }

    // Converter para string binária
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    // Codificar em base64
    return window.btoa(binary);
  }

  /**
   * Converte uma string Base64 para Uint8Array
   * @param {string} base64 - String em Base64
   * @returns {Uint8Array} - Array de bytes
   */
  base64ToUint8Array(base64) {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

// Inicializa a instância global do gerenciador de websocket
const webSocketManager = new WebSocketManager("ws://localhost:8080/");
