const db = require('../../db/database');

const getVariantsByTags = async (req, res) => {
    const tagId = parseInt(req.query.tagId);
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (isNaN(tagId)) {
        return res.status(400).json({ message: 'Valid Tag ID is required.' });
    }

    try {
        // Get distinct products that have the given tag
        const [products] = await db.query(
            `
            SELECT DISTINCT p.id, p.name, p.sub_category_id 
            FROM product p
            JOIN product_tag pt ON p.id = pt.product_id
            WHERE pt.tag_id = ?
            LIMIT ? OFFSET ?
            `,
            [tagId, limit, offset]
        );

        if (products.length === 0) {
            return res.status(200).json({ products: [] });
        }

        const productIds = products.map(p => p.id);
        const variantPlaceholders = productIds.map(() => '?').join(', ');

        // Fetch variants for those products
        const [variants] = await db.query(
            `SELECT * FROM variant WHERE product_id IN (${variantPlaceholders})`,
            productIds
        );

        // Fetch tags for those products
        const [tagRows] = await db.query(
            `
            SELECT pt.product_id, t.name 
            FROM product_tag pt 
            JOIN tag t ON pt.tag_id = t.id 
            WHERE pt.product_id IN (${variantPlaceholders})
            `,
            productIds
        );

        // Map tags by product ID
        const tagMap = {};
        for (const row of tagRows) {
            if (!tagMap[row.product_id]) tagMap[row.product_id] = [];
            tagMap[row.product_id].push(row.name);
        }

        // Map variants by product ID
        const productMap = {};
        for (const variant of variants) {
            if (!productMap[variant.product_id]) {
                productMap[variant.product_id] = [];
            }
            productMap[variant.product_id].push(variant);
        }

        // Structure final response
        const result = products.map(product => ({
            ...product,
            tags: tagMap[product.id] || [],
            variants: productMap[product.id] || []
        }));

        return res.status(200).json({ products: result });
    } catch (err) {
        console.error('Error fetching products by tag:', err);
        return res.status(500).json({
            message: 'Failed to fetch products by tag',
            error: err.message
        });
    }
};

module.exports = {
    getVariantsByTags
};