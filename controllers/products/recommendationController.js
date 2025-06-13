const db = require('../../db/database');

/**
 * Fetches a list of variants that are associated with a specific tag.
 *
 * @route GET /products/by-tag?tagId=...  (Example of a clearer route)
 * @param {number} req.query.tagId - The ID of the tag to filter by.
 * @param {number} [req.query.limit=10] - The number of variants to return.
 * @param {number} [req.query.offset=0] - The starting offset for pagination.
 */
const getVariantsByTag = async (req, res) => {
    const tagId = parseInt(req.query.tagId, 10);
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    if (isNaN(tagId)) {
        return res.status(400).json({ message: 'A valid numeric tagId is required.' });
    }

    try {
        const [variants] = await db.query(
            `
            SELECT
                v.*,
                p.name AS productName,
                p.id AS productId
            FROM variant v
            INNER JOIN product_tag pt ON v.id = pt.variant_id
            INNER JOIN product p ON v.product_id = p.id
            WHERE
                pt.tag_id = ?
            ORDER BY v.id DESC
            LIMIT ? OFFSET ?
            `,
            [tagId, limit, offset]
        );

        if (variants.length === 0) {
            return res.status(200).json({
                message: 'No variants found for this tag.',
                data: { variants: [] },
            });
        }

        // --- Hydrate variants with their images and full list of tags ---

        const imageBaseUrl = process.env.IMAGE_BASE_URL || '';
        const variantIds = variants.map(v => v.id);

        // Fetch all images for the retrieved variants
        const [images] = await db.query(
            `SELECT id, variant_id, path FROM variant_image WHERE variant_id IN (?)`,
            [variantIds]
        );

        // Fetch ALL tags for the retrieved variants
        const [tags] = await db.query(
            `
            SELECT pt.variant_id, t.name
            FROM product_tag pt
            JOIN tag t ON pt.tag_id = t.id
            WHERE pt.variant_id IN (?)
            `,
            [variantIds]
        );

        // Map data for efficient lookup
        const imageMap = images.reduce((acc, image) => {
            if (!acc[image.variant_id]) acc[image.variant_id] = [];
            const fullUrl = `${imageBaseUrl.replace(/\/$/, '')}${image.path}`;
            acc[image.variant_id].push({ id: image.id, url: fullUrl });
            return acc;
        }, {});

        const tagMap = tags.reduce((acc, tag) => {
            if (!acc[tag.variant_id]) acc[tag.variant_id] = [];
            acc[tag.variant_id].push(tag.name);
            return acc;
        }, {});

        // Attach the full data to each variant object
        variants.forEach(variant => {
            variant.images = imageMap[variant.id] || [];
            variant.tags = tagMap[variant.id] || [];
        });

        return res.status(200).json({
            message: 'Variants fetched successfully by tag.',
            variants,
        });

    } catch (err) {
        console.error('Error fetching variants by tag:', err);
        return res.status(500).json({
            message: 'Failed to fetch variants by tag.',
            error: err.message,
        });
    }
};

module.exports = {
    getVariantsByTag,
};