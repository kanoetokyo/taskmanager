export const MAX_CUSTOMER_PHOTOS = 4;
export const MAX_CUSTOMER_PHOTO_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_CUSTOMER_PHOTO_UPLOAD_BYTES = 1_200_000;

export type PreparedCustomerPhoto = {
  dataBase64: string;
  fileName: string;
  mimeType: "image/jpeg";
  sizeBytes: number;
};

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("写真を読み取れませんでした。"));
    };
    image.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error("写真を圧縮できませんでした。"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

function renderImage(image: HTMLImageElement, maxDimension: number) {
  const scale = Math.min(
    1,
    maxDimension / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("写真を処理できませんでした。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const end = Math.min(bytes.length, offset + chunkSize);
    const characters: string[] = [];
    for (let index = offset; index < end; index += 1) {
      characters.push(String.fromCharCode(bytes[index]));
    }
    binary += characters.join("");
  }
  return btoa(binary);
}

function jpegFileName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").trim() || "photo";
  return `${base}.jpg`;
}

export async function prepareCustomerPhoto(
  file: File
): Promise<PreparedCustomerPhoto> {
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選択してください。");
  }
  if (file.size > MAX_CUSTOMER_PHOTO_SOURCE_BYTES) {
    throw new Error(
      "元の写真が大きすぎます。20MB以下の写真を選択してください。"
    );
  }

  const image = await loadImage(file);
  let maxDimension = 1600;
  let quality = 0.82;
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const canvas = renderImage(image, maxDimension);
    blob = await canvasToJpeg(canvas, quality);
    if (blob.size <= MAX_CUSTOMER_PHOTO_UPLOAD_BYTES) break;
    if (quality > 0.58) {
      quality -= 0.1;
    } else {
      maxDimension = Math.max(900, Math.round(maxDimension * 0.82));
      quality = 0.72;
    }
  }

  if (!blob || blob.size > MAX_CUSTOMER_PHOTO_UPLOAD_BYTES) {
    throw new Error("写真を送信用サイズまで圧縮できませんでした。");
  }

  return {
    dataBase64: await blobToBase64(blob),
    fileName: jpegFileName(file.name),
    mimeType: "image/jpeg",
    sizeBytes: blob.size,
  };
}
