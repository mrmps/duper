"use client";

import React, { useState, useMemo, useEffect } from "react";
import { uploadImage, getInitialResults, getDetectedObjectResults } from "./actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CloudUpload, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UploadFormProps {
  onUploadSuccess: (imageId: string, imageUrl: string) => void;
}

export interface DetectedObject {
  name: string;
  croppedImageUrl: string;
  products: Product[];
}

export interface Product {
  title: string;
  link: string;
  thumbnail: string;
  price?: {
    value: string;
    extracted_value: number;
    currency: string;
  };
  source: string;
  category: string;
  croppedImageUrl: string;
}

function UploadForm({ onUploadSuccess }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", file);
      const result = await uploadImage(formData);

      if ("error" in result) {
        throw new Error(result.error);
      }

      if (result.imageId && result.imageUrl) {
        onUploadSuccess(result.imageId, result.imageUrl);
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      setError("Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Upload Image</CardTitle>
        <CardDescription>
          Upload an image to find similar fashion items
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="picture">Picture</Label>
            <Input
              id="picture"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
      <CardFooter>
        <Button
          type="submit"
          disabled={!file || uploading}
          onClick={handleSubmit}
          className="w-full"
        >
          {uploading ? "Uploading..." : "Upload and Find Similar Items"}
          <CloudUpload className="ml-2 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}

function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {products.filter((product) => product.price).map((product, index) => (
        <Card key={index} className="overflow-hidden">
          <img
            src={product.thumbnail}
            alt={product.title}
            className="w-full h-48 object-cover"
          />
          <CardHeader className="p-4">
            <CardTitle className="text-lg truncate">{product.title}</CardTitle>
            <CardDescription className="text-sm">{product.source}</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {renderPrice(product.price)}
          </CardContent>
          <CardFooter className="p-4">
            <Button asChild className="w-full">
              <a href={product.link} target="_blank" rel="noopener noreferrer">
                View Product
              </a>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

function renderPrice(price: Product["price"]) {
  if (!price || !price.extracted_value) {
    return <p>Price not available</p>;
  }

  return <p className="text-lg font-bold">${price.extracted_value.toFixed(2)}</p>;
}

function ObjectSelector({
  objects,
  selectedObject,
  onObjectChange,
}: {
  objects: DetectedObject[];
  selectedObject: DetectedObject | null;
  onObjectChange: (object: DetectedObject | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <Button
        variant={selectedObject === null ? "default" : "outline"}
        onClick={() => onObjectChange(null)}
        className="flex items-center gap-2"
      >
        All Products
      </Button>
      {objects.map((object) => (
        <Button
          key={object.croppedImageUrl}
          variant={selectedObject === object ? "default" : "outline"}
          onClick={() => onObjectChange(object)}
          className="flex items-center gap-2"
        >
          <img
            src={object.croppedImageUrl}
            alt={object.name}
            className="w-6 h-6 object-cover rounded"
          />
          {object.name}
        </Button>
      ))}
    </div>
  );
}

export default function Home() {
  const [uploadedImageId, setUploadedImageId] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [initialProducts, setInitialProducts] = useState<Product[]>([]);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<DetectedObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const handleUploadSuccess = async (imageId: string, imageUrl: string) => {
    setUploadedImageId(imageId);
    setUploadedImageUrl(imageUrl);
    setLoading(true);
    setSelectedObject(null);
    setInitialProducts([]);
    setDetectedObjects([]);
  
    try {
      // Get initial results
      const initialResults: Product[] = await getInitialResults(imageId);
      setInitialProducts(initialResults);
  
      // Get detected object results
      const objectResults: DetectedObject[] = await getDetectedObjectResults(imageId);
      setDetectedObjects(objectResults);
    } catch (error) {
      console.error("Error fetching results:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleObjectChange = (object: DetectedObject | null) => {
    setSelectedObject(object);
  };

  const sortedProducts = useMemo(() => {
    const productsToSort = selectedObject ? selectedObject.products : initialProducts;
    return [...productsToSort].sort((a, b) => {
      const priceA = a.price?.extracted_value || 0;
      const priceB = b.price?.extracted_value || 0;
      return sortOrder === "asc" ? priceA - priceB : priceB - priceA;
    });
  }, [selectedObject, initialProducts, sortOrder]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8 text-center">Fashion Finder</h1>
        {!uploadedImageId && (
          <UploadForm onUploadSuccess={handleUploadSuccess} />
        )}
        {loading && (
          <div className="flex justify-center items-center">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading similar products...
          </div>
        )}
        {uploadedImageId && !loading && (
          <>
            <h2 className="text-2xl font-bold my-4 text-center">
              Similar Products
            </h2>
            {uploadedImageUrl && (
              <div className="mb-4 text-center">
                <img
                  src={uploadedImageUrl}
                  alt="Uploaded Image"
                  className="max-w-full h-auto mx-auto"
                  style={{ maxHeight: "300px" }}
                />
              </div>
            )}
            {detectedObjects.length > 0 && (
              <ObjectSelector
                objects={detectedObjects}
                selectedObject={selectedObject}
                onObjectChange={handleObjectChange}
              />
            )}
            {/* {JSON.stringify(selectedObject)} */}
            <Select onValueChange={(value) => setSortOrder(value as "asc" | "desc")}>
              <SelectTrigger className="w-[180px] mb-4">
                <SelectValue placeholder="Sort by price" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Price: Low to High</SelectItem>
                <SelectItem value="desc">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
            <ProductGrid products={sortedProducts} />
          </>
        )}
      </div>
    </main>
  );
}