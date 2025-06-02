const db = require('../../db/database');

const getVariantsByTags = async (req, res) => {
    const tagId = req.query;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!tagId || tagIds.length === 0) {
        return res.status(400).json({ message: 'Tag IDs are required.' });
    }

    try {
        const placeholders = tagId.map(() => '?').join(', ');

        // Get distinct product IDs matching the tags
        const [products] = await db.query(
            `
            SELECT DISTINCT p.id, p.name, p.sub_category_id 
            FROM product p
            JOIN product_tag pt ON p.id = pt.product_id
            WHERE pt.tag_id IN (${placeholders})
            LIMIT ? OFFSET ?
            `,
            [...tagId, limit, offset]
        );

        if (products.length === 0) {
            return res.status(200).json({ products: [] });
        }

        // Fetch variants for those products
        const productIds = products.map(p => p.id);
        const variantPlaceholders = productIds.map(() => '?').join(', ');
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

        const tagMap = {};
        for (const row of tagRows) {
            if (!tagMap[row.product_id]) tagMap[row.product_id] = [];
            tagMap[row.product_id].push(row.name);
        }

        // Structure response: group variants by product
        const productMap = {};
        for (const variant of variants) {
            if (!productMap[variant.product_id]) {
                productMap[variant.product_id] = [];
            }
            productMap[variant.product_id].push(variant);
        }

        const result = products.map(product => ({
            ...product,
            tags: tagMap[product.id] || [],
            variants: productMap[product.id] || []
        }));

        return res.status(200).json({ products: result });
    } catch (err) {
        console.error('Error fetching products by tags:', err);
        return res.status(500).json({
            message: 'Failed to fetch products by tags',
            error: err.message
        });
    }
};


module.exports = {
    getVariantsByTags
};