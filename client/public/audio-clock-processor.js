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
      for (let i = 0; i < channel.length; i++) {
        // Ruido blanco de volumen extremadamente bajo para asegurar que el buffer no se considere "vacio"
        // aunque el usuario dijo que no era por falta de ruido, esto ayuda a la prioridad del hilo.
        channel[i] = (Math.random() * 2 - 1) * 0.0001;
      }
      
      this.samplesCount += channel.length;
      
      // Enviar tick cada ~8 segundos (basado en conteo de muestras real)
      if (this.samplesCount >= this.tickIntervalSamples) {
        this.samplesCount = 0;
        this.port.postMessage({ type: 'tick', timestamp: Date.now() });
      }
    }

    return true; // Mantener vivo el procesador
  }
}

registerProcessor('audio-clock-processor', AudioClockProcessor);
