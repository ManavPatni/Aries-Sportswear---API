const db = require('../../db/database');
const subCategoryModel = require('../../models/subCategoryModel');
const productModel = require('../../models/productModel');
const variantModel = require('../../models/variantModel');
const variantImageModel = require('../../models/variantImageModel');
const productTagModel = require('../../models/productTagModel');
const tagModel = require('../../models/tagModel');

const addProduct = async (req, res) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    try {
        const { productId, subCategoryId, name } = req.body;
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
                subCategoryId: subCategoryId,
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

    const { id: productId } = req.params;

    const { name, subCategoryId } = req.body;
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

    const { id: variantId } = req.params;

    const {
        description, color, size,
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
                   p.id AS productId, 
                   p.sub_category_id AS product_sub_category_id 
            FROM variant v
            JOIN product p ON v.product_id = p.id
            LIMIT ? OFFSET ?
            `,
            [parseInt(limit), parseInt(offset)]
        );

        if (variants.length === 0) {
            return res.status(200).json({ variants: [] });
        }

        // Get all productIds from the variants
        const productIds = [...new Set(variants.map(v => v.productId))];

        // Get all tags for those productIds
        const placeholders = productIds.map(() => '?').join(',');
        const [tagRows] = await db.query(`
            SELECT pt.product_id, t.name 
            FROM product_tag pt
            JOIN tag t ON pt.tag_id = t.id
            WHERE pt.product_id IN (${placeholders})
        `, productIds);

        // Map productId -> tags[]
        const tagMap = {};
        for (const row of tagRows) {
            if (!tagMap[row.product_id]) tagMap[row.product_id] = [];
            tagMap[row.product_id].push(row.name);
        }

        // Add tags to each variant
        for (const variant of variants) {
            variant.tags = tagMap[variant.productId] || [];
        }

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
                   p.id AS productId,
                   p.sub_category_id AS product_sub_category_id, 
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

        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [variants] = await db.query(query, params);

        if (variants.length === 0) {
            return res.status(200).json({ variants: [] });
        }

        // Get unique product IDs from variants
        const productIds = [...new Set(variants.map(v => v.productId))];

        // Fetch tag names for these product IDs
        const placeholders = productIds.map(() => '?').join(',');
        const [tagRows] = await db.query(`
            SELECT pt.product_id, t.name 
            FROM product_tag pt
            JOIN tag t ON pt.tag_id = t.id
            WHERE pt.product_id IN (${placeholders})
        `, productIds);

        // Map tags by productId
        const tagMap = {};
        for (const row of tagRows) {
            if (!tagMap[row.product_id]) tagMap[row.product_id] = [];
            tagMap[row.product_id].push(row.name);
        }

        // Attach tags to each variant
        for (let variant of variants) {
            variant.tags = tagMap[variant.productId] || [];
        }

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

        //  Get variants
        const [variants] = await db.query(`
            SELECT * FROM variant 
            WHERE product_id = ? 
        `, [id]);

        for (let variant of variants) {
            const [images] = await db.query(`SELECT * FROM variant_image WHERE variant_id = ?`, [variant.id]);
            variant.images = images;
        }

        // Get tags (names) for product
        const [tags] = await db.query(`
            SELECT tag.name 
            FROM tag 
            INNER JOIN product_tag ON product_tag.tag_id = tag.id 
            WHERE product_tag.product_id = ?
        `, [id]);

        product.tags = tags.map(tag => tag.name); // just the names as array

        res.json({
            product,
            variants
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch product', error: err.message });
    }
};

const addTagToProduct = async (req, res) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    const { productId, tagId } = req.body;

    if (!productId || !Array.isArray(tagId) || tagId.length === 0) {
        return res.status(400).json({ message: 'productId and tagId[] are required.' });
    }

    try {
        // Check if product exists
        const [productRows] = await productModel.findById(productId);
        if (productRows.length === 0) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        // Validate all tag IDs
        const placeholders = tagId.map(() => '?').join(',');
        const [tagRows] = await db.query(`SELECT id FROM tag WHERE id IN (${placeholders})`, tagId);

        const foundTagIds = tagRows.map(tag => tag.id.toString());
        const notFound = tagId.filter(id => !foundTagIds.includes(id.toString()));
        if (notFound.length > 0) {
            return res.status(404).json({ message: 'Some tags not found.', notFound });
        }

        // Get current tag IDs for the product
        const [currentTags] = await db.query(
            'SELECT tag_id FROM product_tag WHERE product_id = ?',
            [productId]
        );
        const currentTagIds = currentTags.map(row => row.tagId.toString());

        // Determine tags to add & remove
        const tagsToAdd = foundTagIds.filter(id => !currentTagIds.includes(id));
        const tagsToRemove = currentTagIds.filter(id => !foundTagIds.includes(id));

        // Add missing tags
        for (const id of tagsToAdd) {
            await db.query('INSERT INTO product_tag (product_id, tag_id) VALUES (?, ?)', [productId, id]);
        }

        // Remove extra tags
        for (const id of tagsToRemove) {
            await db.query('DELETE FROM product_tag WHERE product_id = ? AND tag_id = ?', [productId, id]);
        }

        return res.status(200).json({
            message: 'Tags synced successfully.',
            added: tagsToAdd,
            removed: tagsToRemove
        });

    } catch (err) {
        console.error('Error syncing tags for product:', err);
        return res.status(500).json({
            message: 'Failed to sync tags for product',
            error: err.message,
        });
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
    getProductById,
    addTagToProduct
};

/*
TODO 
-   Update variant image
*/