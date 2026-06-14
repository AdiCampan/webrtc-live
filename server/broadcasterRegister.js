/**
 * @param {Record<string, object | null>} broadcasters
 * @param {string} language
 * @param {{ isBroadcaster?: boolean; language?: string | null }} ws
 */
export function isDuplicateBroadcasterRegistration(broadcasters, language, ws) {
  return (
    broadcasters[language] === ws &&
    ws.isBroadcaster === true &&
    ws.language === language
  );
}
