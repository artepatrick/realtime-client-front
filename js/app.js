/**
 * App.js - Aplicativo principal para o cliente OpenAI Realtime
 *
 * Coordena os módulos de WebSocket, AudioManager e Logger para criar
 * uma interface de usuário para conversa em tempo real com a API OpenAI.
 */
document.addEventListener("DOMContentLoaded", () => {
  // Elementos da UI
  const connectBtn = document.getElementById("connectBtn");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const clearLogBtn = document.getElementById("clearLogBtn");
  const chatMessages = document.getElementById("chatMessages");

  // Estado da aplicação
  let isRecording = false;
  let currentUserMessage = "";
  let currentAssistantMessage = "";
  let audioBufferSent = false;

  // Inicializa o sistema de áudio
  audioManager.initialize().then((initialized) => {
    if (!initialized) {
      logger.error("Falha ao inicializar o sistema de áudio");
    }
  });

  // Configura os callbacks do WebSocketManager
  webSocketManager.onConnect = () => {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    connectBtn.innerHTML = '<i class="fas fa-times-circle"></i> Desconectar';
    connectBtn.classList.remove("primary");
    connectBtn.classList.add("danger");

    logger.success("Conectado ao servidor OpenAI Realtime");
  };

  webSocketManager.onDisconnect = () => {
    startBtn.disabled = true;
    stopBtn.disabled = true;
    connectBtn.innerHTML = '<i class="fas fa-plug"></i> Conectar';
    connectBtn.classList.remove("danger");
    connectBtn.classList.add("primary");

    // Se estiver gravando, para a gravação
    if (isRecording) {
      stopRecording();
    }

    logger.info("Desconectado do servidor OpenAI Realtime");
  };

  webSocketManager.onTextResponse = (text, isDone) => {
    // Adiciona texto à mensagem atual do assistente
    if (text) {
      currentAssistantMessage += text;
      updateOrCreateAssistantMessage(currentAssistantMessage);
    }

    // Se a resposta está completa, limpa a mensagem atual
    if (isDone) {
      currentAssistantMessage = "";
    }
  };

  webSocketManager.onAudioResponse = (audioData, isDone) => {
    // Se temos dados de áudio, adiciona à fila de reprodução
    if (audioData) {
      audioManager.enqueueAudio(audioData);
    }
  };

  // Configura os callbacks do AudioManager
  let audioDataBuffer = []; // Buffer para acumular dados de áudio
  let bufferTimeoutId = null; // ID do timeout para enviar buffer

  audioManager.onAudioData = (audioData) => {
    // Adicionar os dados ao buffer
    audioDataBuffer.push(audioData);

    // Armazenar quantidade aproximada de áudio acumulado
    const durationMs = (audioData.length / audioManager.sampleRate) * 1000;
    logger.info(`Adicionando ${durationMs.toFixed(2)}ms de áudio ao buffer`);

    // Se já temos buffer agendado para envio, cancelar
    if (bufferTimeoutId) {
      clearTimeout(bufferTimeoutId);
    }

    // Enviar o buffer para o servidor a cada 500ms
    bufferTimeoutId = setTimeout(() => {
      if (audioDataBuffer.length > 0) {
        // Calcular o tamanho total necessário
        let totalLength = 0;
        for (const buffer of audioDataBuffer) {
          totalLength += buffer.length;
        }

        // Criar buffer combinado
        const combinedBuffer = new Int16Array(totalLength);
        let offset = 0;

        for (const buffer of audioDataBuffer) {
          combinedBuffer.set(buffer, offset);
          offset += buffer.length;
        }

        // Enviar para o servidor
        webSocketManager.appendAudioBuffer(combinedBuffer);
        audioBufferSent = true;

        // Log da quantidade enviada
        const totalDurationMs = (totalLength / audioManager.sampleRate) * 1000;
        logger.info(
          `Enviando ${totalDurationMs.toFixed(2)}ms de áudio acumulado`
        );

        // Limpar o buffer
        audioDataBuffer = [];
      }
    }, 300); // Enviar a cada 300ms
  };

  audioManager.onRecordingStart = () => {
    isRecording = true;
    audioBufferSent = false;
    audioDataBuffer = []; // Limpar buffer anterior

    if (bufferTimeoutId) {
      clearTimeout(bufferTimeoutId);
      bufferTimeoutId = null;
    }

    // Atualiza a UI
    startBtn.classList.add("recording");
    startBtn.disabled = true;
    stopBtn.disabled = false;

    // Adiciona uma nova mensagem do usuário
    currentUserMessage = "Gravando...";
    createUserMessage(currentUserMessage);
  };

  audioManager.onRecordingStop = () => {
    isRecording = false;

    // Enviar qualquer áudio restante no buffer
    if (audioDataBuffer.length > 0) {
      let totalLength = 0;
      for (const buffer of audioDataBuffer) {
        totalLength += buffer.length;
      }

      const combinedBuffer = new Int16Array(totalLength);
      let offset = 0;

      for (const buffer of audioDataBuffer) {
        combinedBuffer.set(buffer, offset);
        offset += buffer.length;
      }

      // Enviar para o servidor
      webSocketManager.appendAudioBuffer(combinedBuffer);
      audioBufferSent = true;

      // Limpar o buffer
      audioDataBuffer = [];
    }

    // Cancelar timeout pendente
    if (bufferTimeoutId) {
      clearTimeout(bufferTimeoutId);
      bufferTimeoutId = null;
    }

    // Atualiza a UI
    startBtn.classList.remove("recording");
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Atualiza a mensagem do usuário
    currentUserMessage = "Mensagem de voz enviada";
    updateUserMessage(currentUserMessage);

    // Confirma o buffer de áudio com o servidor (quando em modo manual)
    // Só confirma se tiver enviado áudio
    if (audioBufferSent) {
      webSocketManager.commitAudioBuffer();
      audioBufferSent = false;
    } else {
      logger.warning("Nenhum áudio foi enviado nesta gravação");
    }
  };

  // Configura os event listeners dos botões
  connectBtn.addEventListener("click", () => {
    if (webSocketManager.isConnected) {
      webSocketManager.disconnect();
    } else {
      webSocketManager.connect();
    }
  });

  startBtn.addEventListener("click", () => {
    if (!webSocketManager.isConnected) {
      logger.warning("Conecte-se ao servidor primeiro");
      return;
    }

    startRecording();
  });

  stopBtn.addEventListener("click", () => {
    stopRecording();
  });

  clearLogBtn.addEventListener("click", () => {
    logger.clear();
  });

  // Função para iniciar a gravação
  function startRecording() {
    if (isRecording) return;

    logger.info("Iniciando gravação...");
    audioManager.startRecording();
  }

  // Função para parar a gravação
  function stopRecording() {
    if (!isRecording) return;

    logger.info("Parando gravação...");
    audioManager.stopRecording();
  }

  // Função para criar uma nova mensagem do usuário
  function createUserMessage(text) {
    // Remove mensagem temporária anterior, se existir
    const tempMessage = chatMessages.querySelector(".temp-message");
    if (tempMessage) {
      chatMessages.removeChild(tempMessage);
    }

    const messageElement = document.createElement("div");
    messageElement.classList.add("message", "user-message", "temp-message");
    messageElement.textContent = text;
    chatMessages.appendChild(messageElement);

    // Rola para mostrar a mensagem mais recente
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Função para atualizar a mensagem do usuário
  function updateUserMessage(text) {
    const tempMessage = chatMessages.querySelector(".temp-message");
    if (tempMessage) {
      tempMessage.textContent = text;
      tempMessage.classList.remove("temp-message");
    } else {
      createUserMessage(text);
    }
  }

  // Função para criar ou atualizar a mensagem do assistente
  function updateOrCreateAssistantMessage(text) {
    let assistantMessage = chatMessages.querySelector(
      ".assistant-message.temp-message"
    );

    if (!assistantMessage) {
      assistantMessage = document.createElement("div");
      assistantMessage.classList.add(
        "message",
        "assistant-message",
        "temp-message"
      );
      chatMessages.appendChild(assistantMessage);
    }

    assistantMessage.textContent = text;

    // Rola para mostrar a mensagem mais recente
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Inicia o aplicativo desabilitando os botões de controle
  startBtn.disabled = true;
  stopBtn.disabled = true;

  // Loga início da aplicação
  logger.info('Aplicativo inicializado. Clique em "Conectar" para iniciar.');
});
