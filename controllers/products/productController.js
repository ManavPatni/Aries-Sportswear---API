const db = require('../../db/database');
const mediaController = require('../mediaController');

// ====================================================================
// HELPERS
// ====================================================================

/**
 * A higher-order function to wrap database operations in a transaction.
 * @param {Function} callback - The function to execute within the transaction. It receives the connection object.
 * @returns {Function} An Express route handler function.
 */
const withTransaction = (callback) => async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        await callback(req, res, connection);
        await connection.commit();
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Transactional Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Internal server error', error: error.message });
        }
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Helper to fetch and attach images and tags to a list of variants.
 * @param {Array} variants - The list of variant objects to enrich.
 * @param {object} connection - An active database connection.
 */
const _attachDataToVariants = async (variants, connection) => {
    if (variants.length === 0) return variants;
    
    const variantIds = variants.map(v => v.id);
    const imageBaseUrl = process.env.IMAGE_BASE_URL || '';

    const [images] = await connection.query(
        `SELECT variant_id, path FROM variant_image WHERE variant_id IN (?)`,
        [variantIds]
    );

    // Fetching tags based on variant_id
    const [tags] = await connection.query(`
        SELECT pt.variant_id, t.name
        FROM product_tag pt
        JOIN tag t ON pt.tag_id = t.id
        WHERE pt.variant_id IN (?)
    `, [variantIds]);

    // Map data for efficient lookup
    const imageMap = images.reduce((acc, image) => {
        if (!acc[image.variant_id]) acc[image.variant_id] = [];
        const fullUrl = `${imageBaseUrl.replace(/\/$/, '')}${image.path}`;
        acc[image.variant_id].push(fullUrl);
        return acc;
    }, {});

    // Mapping tags by variant_id
     const tagMap = tags.reduce((acc, tag) => {
        if (!acc[tag.variant_id]) acc[tag.variant_id] = [];
        acc[tag.variant_id].push(tag.name);
        return acc;
    }, {});

    variants.forEach(variant => {
        variant.images = imageMap[variant.id] || [];
        variant.tags = tagMap[variant.id] || [];
    });

    return variants;
};

// ====================================================================
// PRODUCT & VARIANT CREATION
// ====================================================================

const addProduct = withTransaction(async (req, res, connection) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    const { productId, subCategoryId, name, variants } = req.body;
    let finalProductId = productId;

    if (!Array.isArray(variants) || variants.length === 0) {
        return res.status(400).json({ message: 'At least one variant is required.' });
    }

    // --- 1. Create or Validate Product ---
    if (!finalProductId) {
        const [result] = await connection.query(
            'INSERT INTO product (sub_category_id, name) VALUES (?, ?)',
            [subCategoryId, name]
        );
        finalProductId = result.insertId;
    } else {
        const [existingProduct] = await connection.query('SELECT 1 FROM product WHERE id = ?', [finalProductId]);
        if (existingProduct.length === 0) {
            return res.status(404).json({ message: 'Invalid productId provided. Product not found.' });
        }
    }

    // --- 2. Check for Existing Base Variant ---
    const [baseCheck] = await connection.query('SELECT 1 FROM variant WHERE product_id = ? AND is_base = 1 LIMIT 1', [finalProductId]);
    let baseVariantExists = baseCheck.length > 0;

    // --- 3. Insert Variants ---
    for (const variant of variants) {
        if (variant.is_base && baseVariantExists) {
            throw new Error('Only one base variant is allowed per product.');
        }

        const [variantResult] = await connection.query(
            'INSERT INTO variant (product_id, is_base, name, description, color, size, price, stock, external_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [finalProductId, !!variant.is_base, variant.name, variant.description, variant.color, variant.size, variant.price, variant.stock, variant.external_link || null]
        );

        if (variant.is_base) baseVariantExists = true;

        // We also do a bulk insert for efficiency.
        if (Array.isArray(variant.tags) && variant.tags.length > 0) {
            const tagValues = variant.tags.map(tagId => [variantResult.insertId, tagId]);
            await connection.query('INSERT INTO product_tag (variant_id, tag_id) VALUES ?', [tagValues]);
        }
    }

    return res.status(201).json({
        message: 'Product and variants added successfully',
        productId: finalProductId
    });
});

const uploadVariantImages = withTransaction(async (req, res, connection) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    const { variantId } = req.params;
    const uploadedFiles = req.files || [];

    if (uploadedFiles.length === 0) {
        return res.status(400).json({ message: 'No image files provided.' });
    }

    // Check if variant exists
    const [variant] = await connection.query('SELECT 1 FROM variant WHERE id = ?', [variantId]);
    if (variant.length === 0) {
        return res.status(404).json({ message: 'Variant not found.' });
    }

    const [rows] = await connection.query('SELECT COUNT(*) as count FROM variant_image WHERE variant_id = ?', [variantId]);
    if (rows[0].count + uploadedFiles.length > 5) {
        return res.status(400).json({ message: 'A variant cannot have more than 5 images.' });
    }

    const uploadedPaths = [];
    for (const file of uploadedFiles) {
        const fileName = `${variantId}-${Date.now()}`;
        const uploadPath = `/products/${fileName}`;

        await mediaController.uploadToServer(file.buffer, uploadPath);
        await connection.query(
            'INSERT INTO variant_image (variant_id, path) VALUES (?, ?)',
            [variantId, uploadPath]
        );
        uploadedPaths.push(uploadPath);
    }

    return res.status(201).json({
        message: 'Images uploaded and linked to variant successfully.',
        uploaded: uploadedPaths
    });
});


// ====================================================================
// READ OPERATIONS
// ====================================================================

const getProductById = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();
    try {
        const [[product]] = await connection.query(`SELECT * FROM product WHERE id = ?`, [id]);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Fetch all variants and their images in an optimized way
        let [variants] = await connection.query(`SELECT * FROM variant WHERE product_id = ?`, [id]);
        variants = await _attachDataToVariants(variants, connection);

        res.status(200).json({
            product,
            variants
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to fetch product', error: err.message });
    } finally {
        if(connection) connection.release();
    }
};

const getFilteredVariants = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const {
            color, size, priceMin, priceMax, categoryId, subCategoryId,
            is_base, available, limit = 10, offset = 0
        } = req.query;

        let query = `
            SELECT v.*, p.name AS productName, p.id AS productId
            FROM variant v
            JOIN product p ON v.product_id = p.id
            JOIN sub_category sc ON p.sub_category_id = sc.id
            WHERE 1 = 1
        `;
        const params = [];

        if (color) { query += ' AND v.color = ?'; params.push(color); }
        if (size) { query += ' AND v.size = ?'; params.push(size); }
        if (priceMin) { query += ' AND v.price >= ?'; params.push(parseFloat(priceMin)); }
        if (priceMax) { query += ' AND v.price <= ?'; params.push(parseFloat(priceMax)); }
        if (categoryId) { query += ' AND sc.category_id = ?'; params.push(parseInt(categoryId)); }
        if (subCategoryId) { query += ' AND p.sub_category_id = ?'; params.push(parseInt(subCategoryId)); }
        if (is_base !== undefined) { query += ' AND v.is_base = ?'; params.push(is_base === 'true' ? 1 : 0); }
        if (available !== undefined) { query += ' AND v.stock > 0'; }

        query += ' ORDER BY v.id DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        let [variants] = await connection.query(query, params);
        variants = await _attachDataToVariants(variants, connection);

        res.status(200).json({
            variants
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to filter variants', error: err.message });
    } finally {
        if(connection) connection.release();
    }
};


// ====================================================================
// UPDATE OPERATIONS
// ====================================================================

const updateProduct = withTransaction(async (req, res, connection) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    const { id: productId } = req.params;
    const { name, subCategoryId } = req.body;

    if (!name || !subCategoryId) {
        return res.status(400).json({ message: 'Product name and subCategoryId are required.' });
    }

    const [result] = await connection.query(
        'UPDATE product SET name = ?, sub_category_id = ? WHERE id = ?',
        [name, subCategoryId, productId]
    );

    if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Product not found.' });
    }

    return res.status(200).json({ message: 'Product updated successfully.' });
});

const updateVariant = withTransaction(async (req, res, connection) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    const { id: variantId } = req.params;
    const { name, description, color, size, price, stock, external_link, is_base } = req.body;

    const [variantRows] = await connection.query('SELECT product_id FROM variant WHERE id = ?', [variantId]);
    if (variantRows.length === 0) {
        return res.status(404).json({ message: 'Variant not found' });
    }
    const { product_id } = variantRows[0];

    // If setting this variant as base, unset all others for the same product first
    if (is_base) {
        await connection.query('UPDATE variant SET is_base = 0 WHERE product_id = ?', [product_id]);
    }

    const [result] = await connection.query(
        `UPDATE variant SET name = ?, description = ?, color = ?, size = ?, price = ?, stock = ?, external_link = ?, is_base = ? WHERE id = ?`,
        [name, description, color, size, price, stock, external_link || null, !!is_base, variantId]
    );

    if (result.affectedRows === 0) {
        // This case is unlikely if the first check passes but good for robustness
        return res.status(404).json({ message: 'Variant not found during update.' });
    }

    return res.status(200).json({ message: 'Variant updated successfully' });
});

const syncVariantTags = withTransaction(async (req, res, connection) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    const { variantId } = req.params;
    const { tagIds } = req.body;
    if (!variantId || !Array.isArray(tagIds)) {
        return res.status(400).json({ message: 'variantId and a tagIds array are required.' });
    }
    
    // First, remove all existing tags for the vaiant
    await connection.query('DELETE FROM product_tag WHERE variant_id = ?', [variantId]);
    
    // Then, add the new set of tags, if any are provided
    if (tagIds.length > 0) {
        const tagValues = tagIds.map(tagId => [variantId, tagId]);
        await connection.query('INSERT INTO product_tag (variant_id, tag_id) VALUES ?', [tagValues]);
    }
    
    return res.status(200).json({ message: 'Product tags synchronized successfully.' });
});


// ====================================================================
// DELETE OPERATIONS
// ====================================================================

const deleteProduct = withTransaction(async (req, res, connection) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });
    const { id: productId } = req.params;

    // 1. Find all image paths to delete from server
    const [images] = await connection.query(
        `SELECT path FROM variant_image WHERE variant_id IN (SELECT id FROM variant WHERE product_id = ?)`,
        [productId]
    );

    // 2. Delete physical files
    if (images.length > 0) {
        const deletePromises = images.map(img => mediaController.deleteImageFromServer(img.path));
        await Promise.all(deletePromises);
    }
    
    // 3. Delete DB records (cascading is handled by multiple queries for clarity)
    await connection.query('DELETE FROM variant_image WHERE variant_id IN (SELECT id FROM variant WHERE product_id = ?)', [productId]);
    await connection.query('DELETE FROM product_tag WHERE variant_id IN (SELECT id FROM variant WHERE product_id = ?)', [productId]);
    await connection.query('DELETE FROM variant WHERE product_id = ?', [productId]);
    const [result] = await connection.query('DELETE FROM product WHERE id = ?', [productId]);

    if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Product not found.' });
    }

    return res.status(200).json({ message: 'Product and all associated data deleted successfully.' });
});

const deleteVariant = withTransaction(async (req, res, connection) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });
    const { id: variantId } = req.params;

    const [images] = await connection.query('SELECT path FROM variant_image WHERE variant_id = ?', [variantId]);
    if (images.length > 0) {
        const deletePromises = images.map(img => mediaController.deleteImageFromServer(img.path));
        await Promise.all(deletePromises);
    }

    await connection.query('DELETE FROM variant_image WHERE variant_id = ?', [variantId]);
    await connection.query('DELETE FROM product_tag WHERE variant_id = ?', [variantId]);
    const [result] = await connection.query('DELETE FROM variant WHERE id = ?', [variantId]);
    
    if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Variant not found.' });
    }

    return res.status(200).json({ message: 'Variant deleted successfully.' });
});

const deleteVariantImage = withTransaction(async (req, res, connection) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });
    const { imageId } = req.params;

    const [[image]] = await connection.query('SELECT path FROM variant_image WHERE id = ?', [imageId]);
    if (!image) {
        return res.status(404).json({ message: 'Image not found.' });
    }
    
    await mediaController.deleteImageFromServer(image.path);
    await connection.query('DELETE FROM variant_image WHERE id = ?', [imageId]);
    
    return res.status(200).json({ message: 'Image deleted successfully.' });
});

module.exports = {
    addProduct,
    uploadVariantImages,
    getProductById,
    getFilteredVariants,
    updateProduct,
    updateVariant,
    syncVariantTags,
    deleteProduct,
    deleteVariant,
    deleteVariantImage,
};