// Renders WhatsApp's lightweight message markup (*bold*) as real bold text,
// so the preview bubble matches what actually shows up in the app.
export function WhatsAppText({ text }) {
  if (!text) return null;
  const parts = text.split(/\*([^*\n]+)\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}
