'use server'

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Product } from "./page";

// Set up the S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY!,
  },
});

export async function uploadImage(formData: FormData) {
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
// Dupe API types
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
  
  // SerpAPI types
  export interface ProductPrice {
    value: string;
    extracted_value: number;
    currency: string;
  }
  
  export interface SerpApiResponse {
    visual_matches: Product[];
    // Add other fields from SerpAPI response as needed
  }
  
  // Component props
  export interface InteractiveFashionImageProps {
    imageUrl: string;
    onObjectClick: (object: DetectedObject) => void;
  }
  
  // Upload response type
  export interface UploadResponse {
    imageId: string;
    imageUrl: string;
  }
  
  // Error response type
  export interface ErrorResponse {
    error: string;
  }
  
  // Union type for upload result
  export type UploadResult = UploadResponse | ErrorResponse;
  
  // Function types
  export type UploadImageFunction = (formData: FormData) => Promise<UploadResult>;
  export type GetVisualMatchesFunction = (imageId: string) => Promise<Product[]>;


export async function getVisualMatches(imageId: string) {
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
  
    // Step 2: Fetch products for each detected object using SerpAPI
    const allProducts: Product[] = [];

    console.log(JSON.stringify(detectedObjects), "detectedObjects")
  
    for (const object of detectedObjects) {
      console.log(`https://serpapi.com/search.json?engine=google_lens&api_key=${process.env.SERPAPI_KEY}&url=${encodeURIComponent(imageUrl)}&crop=${object.boundingPoly.normalizedVertices.map(v => `${v.x},${v.y}`).join(',')}`)
      const serpApiResponse = await fetch(
        `https://serpapi.com/search.json?engine=google_lens&api_key=${process.env.SERPAPI_KEY}&url=${encodeURIComponent(imageUrl)}&crop=${object.boundingPoly.normalizedVertices.map(v => `${v.x},${v.y}`).join(',')}`
      );
  
      if (!serpApiResponse.ok) {
        console.error(`Failed to fetch data from SerpAPI for object: ${object.name}`);
        continue;
      }
  
      const serpData = await serpApiResponse.json();
      const products = serpData.visual_matches || [];
  
      // Add object name to each product for reference
      const productsWithCategory = products.map((product: Product) => ({
        ...product,
        category: object.name
      }));
  
      allProducts.push(...productsWithCategory);
    }
  
    return allProducts;
  }



// export async function getVisualMatches(imageId: string) {
//     if (!process.env.SERPAPI_KEY) {
//       throw new Error("SERPAPI_KEY is not defined");
//     }
//     const imageUrl = `${process.env.CLOUDFLARE_PUBLIC_URL}/${imageId}`;
//     const response = await fetch(
//       `https://serpapi.com/search.json?engine=google_lens&api_key=${process.env.SERPAPI_KEY}&url=${encodeURIComponent(
//         imageUrl
//       )}`
//     );
  
//     if (!response.ok) {
//       throw new Error("Failed to fetch data from SerpAPI");
//     }
  
//     const data = await response.json();

//     return data.visual_matches as Product[] || [];
//   }