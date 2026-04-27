/**
 * Converte logo para base64 para uso no jsPDF.
 * Tenta o caminho principal e, se falhar, usa um fallback do projeto.
 */
export const carregarLogoBase64 = (): Promise<string | null> =>
  new Promise((resolve) => {
    const tryLoad = (src: string, onError: () => void) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = src;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = onError;
    };

    tryLoad('/images/logo-ile.png', () => {
      tryLoad('/icons/Nação.png', () => resolve(null));
    });
  });
