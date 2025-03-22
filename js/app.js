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
  audioManager.onAudioData = (audioData) => {
    // Envia os dados de áudio para o servidor
    webSocketManager.appendAudioBuffer(audioData);
  };

  audioManager.onRecordingStart = () => {
    isRecording = true;

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

    // Atualiza a UI
    startBtn.classList.remove("recording");
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Atualiza a mensagem do usuário
    currentUserMessage = "Mensagem de voz enviada";
    updateUserMessage(currentUserMessage);

    // Confirma o buffer de áudio com o servidor (quando em modo manual)
    webSocketManager.commitAudioBuffer();
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
