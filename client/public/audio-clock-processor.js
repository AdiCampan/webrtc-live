// audio-clock-processor.js
class AudioClockProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.lastTick = 0;
    this.sampleRate = 48000; // Valor inicial, se actualizará si es necesario
    this.tickIntervalSamples = this.sampleRate * 8; // Tick cada 8 segundos por defecto
    this.samplesCount = 0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channel = output[0];

    // Mantener el hilo de audio ocupado/activo con ruido inaudible si es necesario
    // Pero principalmente queremos contar muestras para el tick de tiempo real
    if (channel) {
      this.samplesCount += channel.length;
      
      const now = Date.now();
      // Enviar tick cada ~8 segundos para el WebSocket/UI
      if (this.samplesCount >= this.tickIntervalSamples) {
        this.samplesCount = 0;
        this.port.postMessage({ type: 'tick', timestamp: now });
      }

      // 💓 PULSO DE HARDWARE: Cada 5 segundos generamos un micro-pulso inaudible
      // pero que obliga al hardware a procesar una señal no-cero.
      if (Math.round(now / 1000) % 5 === 0 && (now % 1000) < 20) {
        // Un pulso de 20ms de ruido a volumen muy bajo
        for (let i = 0; i < channel.length; i++) {
          channel[i] = (Math.random() * 2 - 1) * 0.005; // 0.5% de volumen
        }
      } else {
        // Ruido de fondo casi nulo pero constante
        for (let i = 0; i < channel.length; i++) {
          channel[i] = (Math.random() * 2 - 1) * 0.0001;
        }
      }
    }

    return true; // Mantener vivo el procesador
  }
}

registerProcessor('audio-clock-processor', AudioClockProcessor);
