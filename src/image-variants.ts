import sharp from "sharp";

export type ImageVariant = {
  label: "thumb" | "medium";
  filename: string;
  body: Buffer;
  contentType: "image/webp";
  width: number;
};

export async function createPfpVariants(input: {
  body: Buffer;
  basename: string;
}): Promise<ImageVariant[]> {
  const variants = await Promise.all([
    createVariant(input.body, input.basename, "thumb", 160, 72),
    createVariant(input.body, input.basename, "medium", 512, 80)
  ]);

  return variants.filter((variant): variant is ImageVariant => Boolean(variant));
}

async function createVariant(
  body: Buffer,
  basename: string,
  label: "thumb" | "medium",
  width: number,
  quality: number
) {
  try {
    const output = await sharp(body, { animated: false })
      .rotate()
      .resize({
        width,
        height: width,
        fit: "cover",
        withoutEnlargement: true
      })
      .webp({ quality, effort: 4 })
      .toBuffer();

    return {
      label,
      filename: `${basename}.${label}.webp`,
      body: output,
      contentType: "image/webp" as const,
      width
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown image processing error";
    console.warn(`Could not create ${label} variant: ${message}`);
    return undefined;
  }
}
