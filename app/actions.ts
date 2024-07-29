'use server'

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from 'sharp';
import type { Product } from "./page";

// Set up the S3 client for Cloudflare R2
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

export interface InteractiveFashionImageProps {
  imageUrl: string;
  onObjectClick: (object: DetectedObject) => void;
}

export interface UploadResponse {
  imageId: string;
  imageUrl: string;
}

export interface ErrorResponse {
  error: string;
}

export type UploadResult = UploadResponse | ErrorResponse;

export type UploadImageFunction = (formData: FormData) => Promise<UploadResult>;
export type GetVisualMatchesFunction = (imageId: string) => Promise<(Product & { category: string; croppedImageUrl: string })[]>;

// Function to upload an image
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

// Function to crop and upload an image
async function cropAndUploadImage(imageBuffer: Buffer, object: DetectedObject, originalFileName: string): Promise<string> {
  const { normalizedVertices } = object.boundingPoly;
  
  // Get image dimensions using sharp
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const imageWidth = metadata.width || 0;
  const imageHeight = metadata.height || 0;

  // Calculate crop dimensions
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

// Function to get visual matches
export async function getVisualMatches(imageId: string): Promise<(Product & { category: string; croppedImageUrl: string })[]> {
  if (!process.env.SERPAPI_KEY) {
    throw new Error("SERPAPI_KEY is not defined");
  }

  const imageUrl = `${process.env.CLOUDFLARE_PUBLIC_URL}/${imageId}`;

  // FIXME: In a production environment, this hash should be stored securely and not hardcoded
  const DUPE_API_HASH = "8dobGpMaw";

  // Step 1: Use Dupe API to segment the image
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

  // Download the original image
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  // Step 2: Crop, upload, and fetch products for each detected object
  const allProducts: (Product & { category: string; croppedImageUrl: string })[] = [];

  for (const object of detectedObjects) {
    try {
      const croppedImageUrl = await cropAndUploadImage(imageBuffer, object, imageId);

      const serpApiResponse = await fetch(
        `https://serpapi.com/search.json?engine=google_lens&api_key=${process.env.SERPAPI_KEY}&url=${encodeURIComponent(croppedImageUrl)}`
      );

      if (!serpApiResponse.ok) {
        console.error(`Failed to fetch data from SerpAPI for object: ${object.name}`);
        continue;
      }

      const serpData: SerpApiResponse = await serpApiResponse.json();
      const products = serpData.visual_matches || [];

      // Add object name and cropped image URL to each product for reference
      const productsWithCategory = products.map((product: Product) => ({
        ...product,
        category: object.name,
        croppedImageUrl
      }));

      allProducts.push(...productsWithCategory);
    } catch (error) {
      console.error(`Error processing object ${object.name}:`, error);
    }
  }

  // log all croppedImageUrls
  console.log(allProducts.map(product => product.croppedImageUrl));

  return allProducts;
}