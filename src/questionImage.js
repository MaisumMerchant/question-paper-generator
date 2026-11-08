// Only bundled question images may be referenced by a bank or shared snapshot.
export function questionImageUrl(path, base = '/') {
  if (!path) return '';
  if (typeof path !== 'string' || !/^question-images\/[a-z0-9][a-z0-9-]*\.svg$/.test(path)) throw new Error('Invalid question diagram path.');
  return `${base.endsWith('/') ? base : base + '/'}${path}`;
}
export async function loadQuestionImage(path, base = '/') {
  const url = questionImageUrl(path, base);
  const image = new Image();
  image.src = url;
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error(`Question diagram could not be loaded: ${path}`)); });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0);
  return { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}
