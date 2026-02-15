const fs = require('fs');
const path = require('path');

// Un MP3 de silencio de 1 segundo (LAME encoded)
const silenceBase64 = 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU2LjYwLjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAAAHAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////8AAAAATGF2YzU2LjYwAAAAAAAAAAAAAAAAJAAAAAAAAAAAASAAAAEAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAAAHAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////8AAAAATGF2YzU2LjYwAAAAAAAAAAAAAAAAJAAAAAAAAAAAASAAAAEAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAAAHAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////8AAAAATGF2YzU2LjYwAAAAAAAAAAAAAAAAJAAAAAAAAAAAASAAAAEAAA==';
// Un WebM minimalista de 1x1 negro (válido)
const webmBase64 = 'GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYX4BNQi1jxPpYt4EEd2VibUKHgQOVgouBCCHHgQKMgpOBACTINwEBQ7Z1AQAAAAAAAHunW4IvQeBninhF67jtI97TS124qF3bC0W+u4KihYECQoWBAIW1gQJChYEAm5yBAlWFA4KBAx8A64Y=';

const publicDir = path.join(__dirname, 'client', 'public');

// Intentamos crear archivos un poco más grandes para que el navegador los tome en serio
const silenceBuffer = Buffer.from(silenceBase64, 'base64');
// ~1MB de silencio para ser "sustancial"
const longSilence = Buffer.concat(Array(2000).fill(silenceBuffer)); 

fs.writeFileSync(path.join(publicDir, 'silence.mp3'), longSilence);

// WebM: Usamos el mismo pero nos aseguraremos de que sea tratado como un loop de video real
fs.writeFileSync(path.join(publicDir, 'screenshare.webm'), Buffer.from(webmBase64, 'base64'));

console.log('✅ Archivos de "Keep-Alive" generados en:', publicDir);
console.log('📊 Tamaño silence.mp3:', longSilence.length, 'bytes');
console.log('📊 Tamaño screenshare.webm:', Buffer.from(webmBase64, 'base64').length, 'bytes');
