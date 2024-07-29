import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Product } from "@/app/page"

export default function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {products.map((product, index) => (
        <Card key={index}>
          <CardHeader>
            <CardTitle className="text-lg">{product.title}</CardTitle>
            <CardDescription>{product.source}</CardDescription>
          </CardHeader>
          <CardContent>
            <img src={product.thumbnail} alt={product.title} className="w-full h-48 object-cover mb-2" />
            {product.price && <p className="text-lg font-bold">{product.price.value?.value}</p>}
          </CardContent>
          <CardFooter>
            <Button asChild className="w-full">
              <a href={product.link} target="_blank" rel="noopener noreferrer">View Product</a>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}