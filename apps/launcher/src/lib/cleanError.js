// Electron wraps every rejected ipcRenderer.invoke() call in
// `Error invoking remote method '<channel>': Error: <message>` - useful
// for debugging in the terminal, but not something an operator should
// ever see on screen. Strips it down to the actual message.
export function cleanErrorMessage(err, fallback = 'A apărut o eroare.') {
  let message = err?.message || String(err || '');
  message = message.replace(/^Error invoking remote method '[^']*':\s*/, '');
  message = message.replace(/^Error:\s*/, '');
  return message || fallback;
}
