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
      // Criar AudioContext com a taxa de amostragem correta
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext({
        sampleRate: this.sampleRate, // Usar a taxa de amostragem necessária
      });

      logger.info(
        `Sistema de áudio inicializado com taxa de amostragem ${this.audioContext.sampleRate}Hz`
      );
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
      // Verificar se o AudioContext está suspenso (pode acontecer devido a políticas do navegador)
      if (this.audioContext && this.audioContext.state === "suspended") {
        await this.audioContext.resume();
        logger.info("AudioContext retomado");
      }

      // Solicitar acesso ao microfone com configurações específicas
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // Mono (obrigatório para a API OpenAI)
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      logger.info("Acesso ao microfone obtido");

      // Criar fonte de áudio a partir do stream do microfone
      const sourceNode = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );

      // Criar processador de script para capturar dados de áudio
      const processorNode = this.audioContext.createScriptProcessor(
        this.bufferSize,
        1, // Um canal de entrada (mono)
        1 // Um canal de saída (mono)
      );

      // Configurar o callback de processamento de áudio
      processorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        // Obter os dados do buffer de entrada
        const inputBuffer = audioProcessingEvent.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);

        // Verificar se há dados de áudio (não silêncio total)
        const hasAudio = inputData.some((sample) => Math.abs(sample) > 0.1);

        if (hasAudio) {
          // Converter para Int16 (PCM16) - formato requerido pela API
          const pcmData = this.floatTo16BitPCM(inputData);

          // Enviar dados para o callback
          if (this.onAudioData) {
            this.onAudioData(pcmData);
          }
        }
      };

      // Conectar os nós de processamento de áudio
      sourceNode.connect(processorNode);
      processorNode.connect(this.audioContext.destination);

      // Salvar referências para limpeza posterior
      this.recorder = {
        sourceNode,
        processorNode,
      };

      // Atualizar estado
      this.isRecording = true;

      logger.success("Gravação iniciada com sucesso");

      // Notificar início da gravação
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
      // Desconectar nós de áudio
      if (this.recorder) {
        this.recorder.sourceNode.disconnect();
        this.recorder.processorNode.disconnect();
      }

      // Parar todas as faixas de mídia
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      }

      // Limpar estado
      this.isRecording = false;
      this.recorder = null;
      this.mediaStream = null;

      logger.info("Gravação interrompida");

      // Notificar fim da gravação
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
      // Limitar os valores entre -1 e 1
      const s = Math.max(-1, Math.min(1, input[i]));
      // Converter para Int16 (PCM16)
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
      int16Data = new Int16Array(
        input.buffer,
        input.byteOffset,
        input.byteLength / 2
      );
    } else {
      int16Data = input;
    }

    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      // Normalizar valores para entre -1 e 1 (formato Float32)
      float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7fff);
    }
    return float32Data;
  }
}

// Inicializa a instância global do gerenciador de áudio
const audioManager = new AudioManager();
