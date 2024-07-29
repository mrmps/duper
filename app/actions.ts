'use server'

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from 'sharp';
import { Product } from "./page";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY!,
  },
});

export interface NormalizedVertex {
  x: number;
  y: number;
}

export interface BoundingPoly {
  normalizedVertices: NormalizedVertex[];
}

export interface DetectedObject {
  mid: string;
  name: string;
  score: number;
  boundingPoly: BoundingPoly;
}

export interface VisionApiResponse {
  localizedObjectAnnotations: DetectedObject[];
}

export interface ProductPrice {
  value: string;
  extracted_value: number;
  currency: string;
}

export interface SerpApiResponse {
  visual_matches: Product[];
}

export interface UploadResponse {
  imageId: string;
  imageUrl: string;
}

export interface ErrorResponse {
  error: string;
}

export type UploadResult = UploadResponse | ErrorResponse;

export async function uploadImage(formData: FormData): Promise<UploadResult> {
  const file = formData.get('image') as File
  
  if (!file) {
    return { error: 'No file uploaded' }
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const fileName = `${Date.now()}-${file.name}`;

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: file.type,
    }));

    const imageUrl = `${process.env.CLOUDFLARE_PUBLIC_URL}/${fileName}`;
    return { imageId: fileName, imageUrl };
  } catch (error) {
    console.error('Error saving file to Cloudflare R2:', error)
    return { error: 'Failed to save the file' }
  }
}

export async function getInitialResults(imageId: string): Promise<Product[]> {
  if (!process.env.SERPAPI_KEY) {
    throw new Error("SERPAPI_KEY is not defined");
  }

  const imageUrl = `${process.env.CLOUDFLARE_PUBLIC_URL}/${imageId}`;

  const serpApiResponse = await fetch(
    `https://serpapi.com/search.json?engine=google_lens&api_key=${process.env.SERPAPI_KEY}&url=${encodeURIComponent(imageUrl)}`
  );

  if (!serpApiResponse.ok) {
    throw new Error("Failed to fetch initial results from SerpAPI");
  }

  const serpData: SerpApiResponse = await serpApiResponse.json();
  return serpData.visual_matches.map(product => ({
    ...product,
    category: 'Initial',
    croppedImageUrl: imageUrl
  }));
}


async function cropAndUploadImage(imageBuffer: Buffer, object: DetectedObject, originalFileName: string): Promise<string> {
  const { normalizedVertices } = object.boundingPoly;
  
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const imageWidth = metadata.width || 0;
  const imageHeight = metadata.height || 0;

  const left = Math.floor(normalizedVertices[0].x * imageWidth);
  const top = Math.floor(normalizedVertices[0].y * imageHeight);
  const width = Math.floor((normalizedVertices[1].x - normalizedVertices[0].x) * imageWidth);
  const height = Math.floor((normalizedVertices[2].y - normalizedVertices[1].y) * imageHeight);
  
  const croppedBuffer = await image
    .extract({ left, top, width, height })
    .toBuffer();

  const croppedFileName = `cropped-${Date.now()}-${object.name}-${originalFileName}`;

  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_BUCKET_NAME,
    Key: croppedFileName,
    Body: croppedBuffer,
    ContentType: 'image/jpeg',
  }));

  return `${process.env.CLOUDFLARE_PUBLIC_URL}/${croppedFileName}`;
}

export async function getDetectedObjectResults(imageId: string): Promise<{ name: string; croppedImageUrl: string; products: Product[] }[]> {
  if (!process.env.SERPAPI_KEY) {
    throw new Error("SERPAPI_KEY is not defined");
  }

  const imageUrl = `${process.env.CLOUDFLARE_PUBLIC_URL}/${imageId}`;

  const DUPE_API_HASH = "8dobGpMaw";
  const dupeResponse = await fetch('https://dupe.com/api/vision', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
    },
    body: JSON.stringify({
      imageUrl,
      hash: DUPE_API_HASH
    })
  });

  if (!dupeResponse.ok) {
    throw new Error("Failed to fetch data from Dupe API");
  }

  const dupeData = await dupeResponse.json();
  const detectedObjects: DetectedObject[] = dupeData[0]?.localizedObjectAnnotations || [];

  const deduplicatedDetectedObjects = detectedObjects.filter((object, index) => {
    return detectedObjects.findIndex(otherObject => otherObject.boundingPoly.normalizedVertices[0].x === object.boundingPoly.normalizedVertices[0].x) === index;
  });

  const imageResponse = await fetch(imageUrl);
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  const objectResults = await Promise.all(deduplicatedDetectedObjects.map(async (object) => {
    try {
      const croppedImageUrl = await cropAndUploadImage(imageBuffer, object, imageId);

      const serpApiResponse = await fetch(
        `https://serpapi.com/search.json?engine=google_lens&api_key=${process.env.SERPAPI_KEY}&url=${encodeURIComponent(croppedImageUrl)}&crop=${object.boundingPoly.normalizedVertices.map(v => `${v.x},${v.y}`).join(',')}`
      );

      if (!serpApiResponse.ok) {
        throw new Error(`Failed to fetch data from SerpAPI for object: ${object.name}`);
      }

      const serpData: SerpApiResponse = await serpApiResponse.json();
      const products: Product[] = (serpData.visual_matches || []).map((product: Omit<Product, 'category' | 'croppedImageUrl'>) => ({
        ...product,
        category: object.name,
        croppedImageUrl
      }));

      return {
        name: object.name,
        croppedImageUrl,
        products
      };
    } catch (error) {
      console.error(`Error processing object ${object.name}:`, error);
      return null;
    }
  }));

  return objectResults.filter((result): result is { name: string; croppedImageUrl: string; products: Product[] } => result !== null);
}