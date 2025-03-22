/**
 * AudioManager - Gerencia o áudio da aplicação OpenAI Realtime
 *
 * Responsável pela captura do microfone, formatação do áudio para
 * streaming e reprodução de áudio recebido do servidor.
 */
class AudioManager {
  constructor() {
    // Estado interno
    this.isRecording = false;
    this.audioContext = null;
    this.mediaStream = null;
    this.recorder = null;
    this.audioQueue = [];
    this.isPlaying = false;

    // Eventos
    this.onAudioData = null; // Callback para quando temos dados de áudio para enviar
    this.onRecordingStart = null;
    this.onRecordingStop = null;

    // Configurações de áudio
    this.sampleRate = 24000; // Sample rate requerido pela API OpenAI (24kHz)
    this.inputAudioFormat = "pcm16"; // Formato requerido pela API
    this.bufferSize = 4096; // Tamanho do buffer de áudio
  }

  /**
   * Inicializa o sistema de áudio e solicita permissão para o microfone
   */
  async initialize() {
    try {
      // Criar AudioContext
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)({
        sampleRate: this.sampleRate,
      });

      logger.info("Sistema de áudio inicializado");
      return true;
    } catch (error) {
      logger.error(`Erro ao inicializar o sistema de áudio: ${error.message}`);
      return false;
    }
  }

  /**
   * Solicita acesso ao microfone e inicia a captura
   */
  async startRecording() {
    if (this.isRecording) {
      logger.warning("Já está gravando");
      return false;
    }

    try {
      // Solicitar acesso ao microfone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // Mono
          echoCancellation: true, // Redução de eco
          noiseSuppression: true, // Supressão de ruído
          autoGainControl: true, // Controle automático de ganho
          sampleRate: this.sampleRate,
        },
      });

      // Criar o script processor node para processar áudio
      const sourceNode = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );

      // Verificar se AudioWorkletNode está disponível (API mais moderna)
      let processorNode;

      if (this.audioContext.audioWorklet) {
        // Implementação com AudioWorklet será adicionada em versão futura
        // Por agora, usamos ScriptProcessorNode que ainda é bem suportado
        processorNode = this.audioContext.createScriptProcessor(
          this.bufferSize,
          1,
          1
        );
      } else {
        // Fallback para ScriptProcessorNode
        processorNode = this.audioContext.createScriptProcessor(
          this.bufferSize,
          1,
          1
        );
      }

      // Função para processar o áudio capturado
      processorNode.onaudioprocess = (e) => {
        if (!this.isRecording) return;

        // Obter os dados de áudio do buffer
        const inputBuffer = e.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);

        // Converter para Int16 (PCM16)
        const pcmData = this.floatTo16BitPCM(inputData);

        // Enviar os dados de áudio via callback
        if (this.onAudioData) {
          this.onAudioData(pcmData);
        }
      };

      // Conectar os nós
      sourceNode.connect(processorNode);
      processorNode.connect(this.audioContext.destination);

      // Atualizar o estado
      this.isRecording = true;
      this.recorder = { sourceNode, processorNode };

      logger.success("Gravação iniciada");

      // Chamar o callback de início de gravação
      if (this.onRecordingStart) {
        this.onRecordingStart();
      }

      return true;
    } catch (error) {
      logger.error(`Erro ao iniciar gravação: ${error.message}`);
      return false;
    }
  }

  /**
   * Para a captura do microfone
   */
  stopRecording() {
    if (!this.isRecording) {
      logger.warning("Não está gravando");
      return false;
    }

    try {
      // Desconectar e limpar os nós
      this.recorder.sourceNode.disconnect();
      this.recorder.processorNode.disconnect();

      // Parar todas as faixas do stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      }

      // Atualizar o estado
      this.isRecording = false;
      this.recorder = null;
      this.mediaStream = null;

      logger.info("Gravação interrompida");

      // Chamar o callback de fim de gravação
      if (this.onRecordingStop) {
        this.onRecordingStop();
      }

      return true;
    } catch (error) {
      logger.error(`Erro ao parar gravação: ${error.message}`);
      return false;
    }
  }

  /**
   * Adiciona áudio à fila para reprodução
   * @param {Uint8Array} audioData - Dados de áudio no formato PCM16
   */
  enqueueAudio(audioData) {
    this.audioQueue.push(audioData);

    // Se não estiver reproduzindo, inicia a reprodução
    if (!this.isPlaying) {
      this.playNextAudioChunk();
    }
  }

  /**
   * Reproduz o próximo chunk de áudio da fila
   */
  async playNextAudioChunk() {
    // Se a fila estiver vazia, marca como não tocando e retorna
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;

    try {
      // Pega o próximo chunk de áudio
      const audioData = this.audioQueue.shift();

      // Certifica-se de que temos um AudioContext e ele está ativo
      if (!this.audioContext) {
        await this.initialize();
      }

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Converte o PCM16 para float (formato usado pelo AudioContext)
      const floatData = this.int16ToFloat32(audioData);

      // Cria um buffer de áudio com os dados
      const audioBuffer = this.audioContext.createBuffer(
        1,
        floatData.length,
        this.sampleRate
      );
      audioBuffer.getChannelData(0).set(floatData);

      // Cria uma fonte de buffer para reprodução
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      // Quando a reprodução terminar, toca o próximo chunk
      source.onended = () => {
        this.playNextAudioChunk();
      };

      // Inicia a reprodução
      source.start(0);
    } catch (error) {
      logger.error(`Erro ao reproduzir áudio: ${error.message}`);
      this.isPlaying = false;
    }
  }

  /**
   * Limpa a fila de áudio atual
   */
  clearAudioQueue() {
    this.audioQueue = [];
    this.isPlaying = false;
  }

  /**
   * Converte dados de áudio Float32 para PCM16 (Int16)
   * @param {Float32Array} input - Dados de áudio em Float32
   * @returns {Int16Array} - Dados de áudio em Int16
   */
  floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  /**
   * Converte dados de áudio PCM16 (Int16) para Float32
   * @param {Int16Array|Uint8Array} input - Dados de áudio em formato binário
   * @returns {Float32Array} - Dados de áudio em Float32
   */
  int16ToFloat32(input) {
    // Se input é Uint8Array, converte para Int16Array
    let int16Data;
    if (input instanceof Uint8Array) {
      int16Data = new Int16Array(input.buffer);
    } else {
      int16Data = input;
    }

    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7fff);
    }
    return float32Data;
  }

  /**
   * Converte array em Base64
   * @param {Uint8Array|Int16Array} buffer - Buffer de dados
   * @returns {string} - String em Base64
   */
  arrayToBase64(buffer) {
    const bytes = new Uint8Array(buffer.buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}

// Inicializa a instância global do gerenciador de áudio
const audioManager = new AudioManager();
