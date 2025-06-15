const db = require('../../db/database')

const addReview = async (req, res) => {
    const userId = req.user?.id;
    const { productId } = req.params;
    const { rating, comment } = req.body;

    // Validate inputs
    if (!userId || !productId || !rating || !comment) {
        return res.status(400).json({ message: 'userId, productId, rating, and comment are required.' });
    }

    if (rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
    }

    try {
        // Check if product exists
        const [productRows] = await db.query('SELECT id FROM product WHERE id = ?', [productId]);
        if (productRows.length === 0) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        // Check for existing review by the same user for the same product
        const [existing] = await db.query(
            'SELECT id FROM review WHERE user_id = ? AND product_id = ? LIMIT 1',
            [userId, productId]
        );

        if (existing.length > 0) {
            return res.status(409).json({ message: 'You have already reviewed this product.' });
        }

        // Insert new review
        await db.query(
            'INSERT INTO review (user_id, product_id, rating, comment) VALUES (?, ?, ?, ?)',
            [userId, productId, rating, comment]
        );

        return res.status(200).json({ message: 'Review added successfully.' });
    } catch (error) {
        console.error('Add Review Error:', error);
        return res.status(500).json({
            message: 'Unexpected error occurred.',
            error: error.message || error,
        });
    }
};

const getReviews = async (req, res) => {
    const { productId } = req.query;
    const imageBaseUrl = process.env.IMAGE_BASE_URL || '';

    if (!productId || isNaN(productId)) {
        return res.status(400).json({ message: 'Invalid or missing productId', productId });
    }

    try {
        const [productRows] = await db.query('SELECT id FROM product WHERE id = ?', [productId]);

        if (productRows.length === 0) {
            return res.status(404).json({ message: 'Product not found.', productId });
        }

        const [reviews] = await db.query(`
            SELECT r.id, r.user_id, r.product_id, r.rating, r.comment, r.created_at, r.updated_at,
                   u.name AS user_name, u.avatar AS user_avatar
            FROM review r
            JOIN user u ON r.user_id = u.id
            WHERE r.product_id = ?
            ORDER BY r.created_at DESC
        `, [productId]);

        // Prepend imageBaseUrl to avatar if it exists
        const updatedReviews = reviews.map(review => ({
            ...review,
            user_avatar: review.user_avatar ? imageBaseUrl + review.user_avatar : null
        }));

        return res.status(200).json({ reviews: updatedReviews });
    } catch (error) {
        console.error('Get Reviews Error:', error);
        return res.status(500).json({
            message: 'Unexpected error occurred.',
            error: error.message || error
        });
    }
};

module.exports = {
    addReview,
    getReviews
}