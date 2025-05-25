const db = require('../../db/database');
const subCategoryModel = require('../../models/subCategoryModel');
const productModel = require('../../models/productModel');
const variantModel = require('../../models/variantModel');
const variantImageModel = require('../../models/variantImageModel');
const productTagModel = require('../../models/productTagModel');

const addProduct = async (req, res) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    try {
        const { productId, categoryId, name } = req.body;
        let finalProductId = productId;
        const variants = JSON.parse(req.body.variants);

        if (!Array.isArray(variants) || variants.length === 0) {
            return res.status(400).json({ message: 'At least one variant is required.' });
        }

        // Map image files to variant index (e.g., variantImages-0)
        const variantImagesMap = {};
        for (const file of req.files) {
            const match = file.fieldname.match(/^variantImages-(\d+)$/);
            if (match) {
                const index = match[1];
                if (!variantImagesMap[index]) variantImagesMap[index] = [];
                variantImagesMap[index].push(file);
            }
        }

        // Create product
        if (!finalProductId) {
            const [result] = await productModel.create({ 
                subCategoryId: categoryId,
                name: name 
            });

            finalProductId = result.insertId;
        } else {
            const [existingProduct] = await productModel.findById(finalProductId);
            if (!existingProduct || existingProduct.length === 0) {
                return res.status(400).json({ message: 'Invalid productId provided. Product not found.' });
            }
        }

        let baseVariantExists = await variantModel.baseVariantExists(finalProductId);

        for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];

            if (variant.isBase && baseVariantExists) {
                return res.status(400).json({ message: 'Only one base variant is allowed per product.' });
            }

            const [variantResult] = await variantModel.create({
                productId: finalProductId,
                isBase: variant.isBase ? 1 : 0,
                description: variant.description,
                color: variant.color,
                size: variant.size,
                price: variant.price,
                stock: variant.stock,
                external_link: variant.external_link || null
            });

            const variantId = variantResult.insertId;
            if (variant.isBase) baseVariantExists = true;

            // Handle images
            const variantFiles = variantImagesMap[i] || [];
            for (const file of variantFiles) {
                const uploaded = await mediaController.uploadToServer(file, `/uploads/products/${finalProductId}-${variantId}`);
                await variantImageModel.create({ variantId, path: uploaded.path });
            }

            // Tags
            if (Array.isArray(variant.tags)) {
                for (const tagId of variant.tags) {
                    await productTagModel.create({ productId: finalProductId, tagId });
                }
            }
        }

        return res.status(200).json({ message: 'Product and variants added successfully', productId: finalProductId });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const updateProduct = async (req, res) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    const { productId, name, subCategoryId } = req.body;
    if (!productId || !name || !subCategoryId) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        await db.query('UPDATE product SET name = ?, sub_category_id = ? WHERE id = ?', [name, subCategoryId, productId]);
        return res.status(200).json({ message: 'Product updated successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to update product', error: err.message });
    }
};

const updateVariant = async (req, res) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    const {
        variantId, description, color, size,
        price, stock, external_link, isBase
    } = req.body;

    if (!variantId) return res.status(400).json({ message: 'Variant ID is required' });

    try {
        await db.query(
            `UPDATE variant 
             SET description = ?, color = ?, size = ?, price = ?, stock = ?, external_link = ?, is_base = ? 
             WHERE id = ?`,
            [description, color, size, price, stock, external_link || null, isBase ? 1 : 0, variantId]
        );

        return res.status(200).json({ message: 'Variant updated successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to update variant', error: err.message });
    }
};

const deleteProduct = async (req, res) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    const { id } = req.params;

    try {
        // Delete variant images
        await db.query('DELETE FROM variant_image WHERE variant_id IN (SELECT id FROM variant WHERE product_id = ?)', [id]);

        // Delete product tags
        await db.query('DELETE FROM product_tag WHERE product_id = ?', [id]);

        // Delete variants
        await db.query('DELETE FROM variant WHERE product_id = ?', [id]);

        // Delete product
        await db.query('DELETE FROM product WHERE id = ?', [id]);

        return res.status(200).json({ message: 'Product and related data deleted successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to delete product', error: err.message });
    }
};

const deleteVariant = async (req, res) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    const { id } = req.params;

    try {
        // Delete variant images
        await db.query('DELETE FROM variant_image WHERE variant_id = ?', [id]);

        // Delete variant
        await db.query('DELETE FROM variant WHERE id = ?', [id]);

        return res.status(200).json({ message: 'Variant deleted successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to delete variant', error: err.message });
    }
};

const getAllVariants = async (req, res) => {
    try {
        const { limit = 10, offset = 0 } = req.query;

        const [variants] = await db.query(
            `
            SELECT v.*, 
                   p.name AS productName, 
                   p.sub_category_id AS productSubCategoryId 
            FROM variant v
            JOIN product p ON v.product_id = p.id
            LIMIT ? OFFSET ?
            `,
            [parseInt(limit), parseInt(offset)]
        );

        res.json({ variants });
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch variants', error: err.message });
    }
};

const getFilteredVariants = async (req, res) => {
    try {
        const {
            color,
            size,
            priceMin,
            priceMax,
            categoryId,
            subCategoryId,
            isBase,
            available,
            limit = 10,
            offset = 0
        } = req.query;

        let query = `
            SELECT v.*, 
                   p.name AS productName, 
                   p.sub_category_id AS productSubCategoryId, 
                   sc.category_id, 
                   c.name AS categoryName, 
                   sc.name AS subCategoryName
            FROM variant v
            JOIN product p ON v.product_id = p.id
            JOIN sub_category sc ON p.sub_category_id = sc.id
            JOIN category c ON sc.category_id = c.id
            WHERE 1 = 1
        `;

        const params = [];

        if (color) {
            query += ' AND v.color = ?';
            params.push(color);
        }

        if (size) {
            query += ' AND v.size = ?';
            params.push(size);
        }

        if (priceMin) {
            query += ' AND v.price >= ?';
            params.push(parseFloat(priceMin));
        }

        if (priceMax) {
            query += ' AND v.price <= ?';
            params.push(parseFloat(priceMax));
        }

        if (categoryId) {
            query += ' AND sc.category_id = ?';
            params.push(parseInt(categoryId));
        }

        if (subCategoryId) {
            query += ' AND p.sub_category_id = ?';
            params.push(parseInt(subCategoryId));
        }

        if (isBase !== undefined) {
            query += ' AND v.is_base = ?';
            params.push(isBase == 'true' ? 1 : 0);
        }

        if (available !== undefined) {
            query += ' AND v.stock > 0';
        }

        // Apply LIMIT and OFFSET for pagination
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [variants] = await db.query(query, params);

        res.status(200).json({ variants });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to filter variants', error: err.message });
    }
};

const getProductById = async (req, res) => {
    const { id } = req.params;

    try {
        const [[product]] = await db.query(`SELECT * FROM product WHERE id = ?`, [id]);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const [variants] = await db.query(`
            SELECT * FROM variant 
            WHERE product_id = ? 
        `, [id]);

        for (let variant of variants) {
            const [images] = await db.query(`SELECT * FROM variant_image WHERE variant_id = ?`, [variant.id]);
            variant.images = images;
        }

        res.json({
            product,
            variants
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch product', error: err.message });
    }
};

module.exports = {
    addProduct,
    updateProduct,
    updateVariant,
    deleteProduct,
    deleteVariant,
    getAllVariants,
    getFilteredVariants,
    getProductById
};

/*
TODO 
-   Update variant image
*/