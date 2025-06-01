const db = require('../../db/database');

const getRecommendedVariants = async (req, res) => {

    const tagIds = [1, 2];

    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const placeholders = tagIds.map(() => '?').join(', ');

        const [variants] = await db.query(
            `
            SELECT v.*, 
                   p.name AS productName, 
                   p.sub_category_id AS product_sub_category_id 
            FROM variant v
            JOIN product p ON v.product_id = p.id
            JOIN product_tag pt ON p.id = pt.product_id
            WHERE pt.tag_id IN (${placeholders})
            LIMIT ? OFFSET ?
            `,
            [...tagIds, limit, offset]
        );

        return res.status(200).json({ variants });
    } catch (err) {
        console.error('Error fetching recommended variants:', err);
        return res.status(500).json({
            message: 'Failed to fetch recommended variants',
            error: err.message
        });
    }
};

module.exports = {
    getRecommendedVariants
};