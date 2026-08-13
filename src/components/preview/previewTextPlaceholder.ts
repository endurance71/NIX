export function placeholderColorForText(textColor: string): string {
  const upper = textColor.toUpperCase();
  if (upper === '#FFFFFF') {
    return 'rgba(255,255,255,0.55)';
  }
  return `${upper.length === 7 ? upper : upper.slice(0, 7)}99`;
}
