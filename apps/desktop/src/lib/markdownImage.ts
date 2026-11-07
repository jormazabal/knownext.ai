/** Format a literal description and destination without interpreting Markdown. */
export function markdownImage(alt: string, source: string) {
  const description = alt.replace(/[\r\n]/g, " ").replace(/[\\[\]`*_!&<>]/g, "\\$&");
  const destination = source.replace(/[\r\n]/g, character => character === "\r" ? "%0D" : "%0A").replace(/[\\()<> &]/g, character => character === " " ? "%20" : `\\${character}`);
  return `![${description}](${destination})`;
}
