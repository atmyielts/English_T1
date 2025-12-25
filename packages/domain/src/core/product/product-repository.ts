import type { Product, ProductType, ProductStatus, CreateProductInput, UpdateProductInput } from './product.js';

/**
 * Product Repository Interface
 * 
 * Persistence operations for product records.
 * Products are typically created by admins and queried by the system.
 */
export interface ProductRepository {
    /** Find a single product by ID */
    findById(id: string): Promise<Product | null>;

    /** Find all products of a specific type */
    findByType(type: ProductType): Promise<Product[]>;

    /** Find all products with a specific status */
    findByStatus(status: ProductStatus): Promise<Product[]>;

    /** Get all products (optionally filtered by status) */
    findAll(filter?: { status?: ProductStatus }): Promise<Product[]>;

    /** Create a new product */
    create(input: CreateProductInput): Promise<Product>;

    /** Update an existing product */
    update(id: string, input: UpdateProductInput): Promise<Product>;

    /** Check if a product exists and is active */
    isActive(id: string): Promise<boolean>;
}
