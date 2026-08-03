import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { HttpError } from "./http-error.js";

let configured = false;

function configureCloudinary() {
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  ) {
    throw new HttpError(
      503,
      "O upload de imagens ainda não foi configurado",
      "CLOUDINARY_NOT_CONFIGURED",
    );
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    configured = true;
  }
}

export type UploadedImage = {
  imageUrl: string;
  imagePublicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
};

export async function uploadProductImage(
  buffer: Buffer,
): Promise<UploadedImage> {
  configureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "mesa4/products",
        resource_type: "image",
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) {
  console.error(
    "[Cloudinary upload error]",
    error ?? {
      message:
        "O Cloudinary não retornou resultado nem erro",
    },
  );

  reject(
    new HttpError(
      502,
      "Não foi possível enviar a imagem ao Cloudinary",
      "CLOUDINARY_UPLOAD_FAILED",
    ),
  );

  return;
}

        resolve({
          imageUrl: result.secure_url,
          imagePublicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      },
    );

    stream.end(buffer);
  });
}

export async function deleteCloudinaryImage(
  publicId: string,
) {
  configureCloudinary();
  await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });
}
