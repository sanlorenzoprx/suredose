type PhotoInputLike = {
  files: { 0?: File; length: number } | null;
  value: string;
};

export async function readPhotoInput(
  input: PhotoInputLike,
  readFile: (file: File) => Promise<string>,
  onCapture: (dataUrl: string) => void | Promise<void>,
): Promise<void> {
  const file = input.files?.[0];
  if (!file) {
    input.value = "";
    return;
  }

  try {
    if (file.type && !file.type.startsWith("image/")) {
      throw new Error("Choose an image file to continue.");
    }
    await onCapture(await readFile(file));
  } finally {
    input.value = "";
  }
}
