const db = require('../../db/database');

const getRecommendedProductsByTags = async (req, res) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    const tagIds = [1, 2];

    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const placeholders = tagIds.map(() => '?').join(', ');
        const [products] = await db.query(
            `
            SELECT DISTINCT p.*
            FROM product p
            JOIN product_tag pt ON p.id = pt.product_id
            WHERE pt.tag_id IN (${placeholders})
            LIMIT ? OFFSET ?
            `,
            [...tagIds]
        );

        for (let product of products) {
            const [variants] = await db.query(
                `SELECT * FROM variant WHERE product_id = ?`,
                [product.id]
            );

            for (let variant of variants) {
                const [images] = await db.query(
                    `SELECT * FROM variant_image WHERE variant_id = ?`,
                    [variant.id]
                );
                variant.images = images;
            }

            product.variants = variants;
        }

        return res.status(200).json({ products });
    } catch (err) {
        console.error('Error fetching recommended products by tags:', err);
        return res.status(500).json({
            message: 'Failed to fetch recommended products',
            error: err.message
        });
    }
};

module.exports = {
    getRecommendedProductsByTags
};