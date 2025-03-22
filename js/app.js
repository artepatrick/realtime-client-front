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
  let audioBufferHasData = false; // Flag para controlar se áudio foi enviado

  // Inicializa o sistema de áudio
  audioManager.initialize().then((initialized) => {
    if (!initialized) {
      logger.error("Falha ao inicializar o sistema de áudio");
    } else {
      logger.success("Sistema de áudio inicializado com sucesso");
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
    } else {
      logger.warning("Texto vazio recebido do servidor");
    }

    // Se a resposta está completa, limpa a mensagem atual
    if (isDone) {
      currentAssistantMessage = "";
    }
  };

  webSocketManager.onAudioResponse = (audioData, isDone) => {
    // Se temos dados de áudio, adiciona à fila de reprodução
    if (audioData) {
      console.log(`Dados de áudio recebidos: ${audioData.length} bytes`);
      audioManager.enqueueAudio(audioData);
    } else if (isDone) {
      logger.info("Reprodução de áudio concluída");
    }
  };

  // Configura os callbacks do AudioManager
  audioManager.onAudioData = (audioData) => {
    // Envia os dados de áudio para o servidor
    if (webSocketManager.isConnected && isRecording) {
      // Verifica se há dados de áudio válidos
      if (audioData && audioData.length > 0) {
        const success = webSocketManager.appendAudioBuffer(audioData);
        if (success) {
          audioBufferHasData = true; // Marca que áudio foi enviado com sucesso
          console.log(`Dados de áudio enviados: ${audioData.length} amostras`);
        } else {
          logger.error("Falha ao enviar dados de áudio");
        }
      } else {
        logger.warning("Tentativa de enviar dados de áudio vazios");
      }
    }
  };

  audioManager.onRecordingStart = () => {
    isRecording = true;
    audioBufferHasData = false; // Reset da flag a cada início de gravação

    // Atualiza a UI
    startBtn.classList.add("recording");
    startBtn.disabled = true;
    stopBtn.disabled = false;

    // Adiciona uma nova mensagem do usuário
    currentUserMessage = "Gravando...";
    createUserMessage(currentUserMessage);

    logger.info("Gravação iniciada, enviando áudio para o servidor");
  };

  audioManager.onRecordingStop = () => {
    isRecording = false;

    // Atualiza a UI
    startBtn.classList.remove("recording");
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Confirma o buffer de áudio somente se dados foram enviados
    if (audioBufferHasData) {
      logger.info("Enviando comando para processar o áudio");
      webSocketManager.commitAudioBuffer();
      currentUserMessage = "Mensagem de voz enviada";
    } else {
      currentUserMessage = "Nenhum áudio foi enviado nesta gravação";
      logger.warning("Nenhum áudio foi enviado nesta gravação");
    }

    updateUserMessage(currentUserMessage);
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

    logger.info("Iniciando gravação de áudio...");
    // Limpar qualquer buffer de áudio pendente
    webSocketManager.clearAudioBuffer();
    audioManager.startRecording().catch((error) => {
      logger.error(`Erro ao iniciar gravação: ${error.message}`);
    });
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
