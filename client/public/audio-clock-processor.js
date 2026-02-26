// audio-clock-processor.js
// 
// 🎯 OBJETIVO CRÍTICO: Generar un tono CONTINUO de 20Hz.
// 
// ¿Por qué 20Hz? Es el límite inferior de la audición humana (prácticamente inaudible)
// pero Chrome SÍ lo detecta como "señal de audio real" y activa la Media Session
// notification en la pantalla de bloqueo de Android. Sin esto, Chrome clasifica
// el silencio como "sin media" y Android mata el proceso a los ~2 minutos.
//
class AudioClockProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samplesCount = 0;
    this.tickIntervalSamples = 48000 * 8; // Tick cada ~8 segundos
    
    // Generador de onda sinusoidal a 20Hz
    // Frecuencia elegida: 18Hz (por debajo del umbral de audición humana ~20Hz)
    // pero absolutamente detectable por el hardware y Chrome
    this.frequency = 18; // Hz
    this.phase = 0;      // Fase actual de la onda
    this.amplitude = 0.003; // 0.3% de volumen — inaudible pero no "silencio"
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channel = output[0];

    if (channel) {
      const sr = sampleRate; // 'sampleRate' es global en AudioWorklet context
      const phaseIncrement = (2 * Math.PI * this.frequency) / sr;

      // Generar onda sinusoidal de 18Hz
      for (let i = 0; i < channel.length; i++) {
        channel[i] = Math.sin(this.phase) * this.amplitude;
        this.phase += phaseIncrement;
        // Evitar desbordamiento de la fase
        if (this.phase > 2 * Math.PI) {
          this.phase -= 2 * Math.PI;
        }
      }

      // Contar muestras para el tick de tiempo
      this.samplesCount += channel.length;
      if (this.samplesCount >= this.tickIntervalSamples) {
        this.samplesCount = 0;
        this.port.postMessage({ type: 'tick', timestamp: Date.now() });
      }
    }

    return true; // Mantener vivo el procesador
  }
}

registerProcessor('audio-clock-processor', AudioClockProcessor);
