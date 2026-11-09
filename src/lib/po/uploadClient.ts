/**
 * Envoi de fichier avec suivi de la progression d'upload.
 *
 * `fetch` ne sait pas rapporter la progression d'un envoi : on passe donc par
 * XMLHttpRequest pour les fichiers audio, qui peuvent peser plusieurs dizaines
 * de mégaoctets. Extrait de `page.tsx`.
 */
export function xhrPostWithUploadProgress(
  url: string,
  body: any,
  signal: AbortSignal | null,
  onProgress: (phase: 'upload' | 'processing', percent?: number) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.responseType = 'json';
    
    const onAbort = () => {
      xhr.abort();
      reject(new DOMException("Aborted", "AbortError"));
    };
    
    if (signal) {
      if (signal.aborted) {
        return reject(new DOMException("Aborted", "AbortError"));
      }
      signal.addEventListener("abort", onAbort);
    }
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress('upload', percentComplete);
      } else {
        onProgress('upload');
      }
    };
    
    xhr.onload = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject(new Error(xhr.response?.error || `Erreur serveur (${xhr.status})`));
      }
    };
    
    xhr.onerror = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(new Error("Erreur réseau ou connexion refusée."));
    };
    
    xhr.onabort = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    
    xhr.upload.onload = () => {
      onProgress('processing');
    };
    
    xhr.send(JSON.stringify(body));
  });
}

/**
 * Détermine le type MIME approprié pour un fichier audio en tenant compte
 * de son extension de fichier et du type rapporté par le navigateur.
 */
export function detectAudioMimeType(fileName: string, browserMimeType?: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'm4a': return 'audio/mp4';
    case 'ogg': return 'audio/ogg';
    case 'webm': return 'audio/webm';
    case 'aac': return 'audio/aac';
    case 'flac': return 'audio/flac';
    case 'caf': return 'audio/x-caf';
    case 'pdf': return 'application/pdf';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    default:
      if (browserMimeType && browserMimeType !== 'application/octet-stream' && browserMimeType.trim() !== '') {
        return browserMimeType;
      }
      return 'audio/mpeg';
  }
}
