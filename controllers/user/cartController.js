const db = require('../../db/database');

const addToCart = async (req, res) => {
    const userId = req.user.id;
    const { variantId, quantity } = req.body;

    if (!variantId || !quantity) {
        return res.status(400).json({ message: 'variantId, and quantity are required' });
    }

    if (quantity <= 0) {
        return res.status(400).json({ message: 'Quantity must be greater than zero' });
    }

    try {
        // Check if variant exists and get stock
        const [variantRows] = await db.query('SELECT id, stock, price FROM variant WHERE id = ? LIMIT 1', [variantId]);
        if (variantRows.length === 0) {
            return res.status(404).json({ message: 'Variant not found for the given ID', variantId });
        }

        const variant = variantRows[0];

        if (variant.stock < quantity) {
            return res.status(400).json({ message: 'Insufficient stock for the variant' });
        }

        // Check if the item is already in cart
        const [cartRows] = await db.query(
            'SELECT id, quantity FROM cart_item WHERE user_id = ? AND variant_id = ? LIMIT 1',
            [userId, variantId]
        );

        if (cartRows.length > 0) {
            // Update existing cart item
            const newQuantity = cartRows[0].quantity + quantity;

            if (newQuantity > variant.stock) {
                return res.status(400).json({ message: 'Requested quantity exceeds available stock' });
            }

            await db.query(
                'UPDATE cart_item SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newQuantity, cartRows[0].id]
            );

            return res.status(200).json({ message: 'Cart item quantity updated successfully' });

        } else {
            // Insert new cart item
            await db.query(
                'INSERT INTO cart_item (user_id, variant_id, quantity) VALUES (?, ?, ?)',
                [userId, variantId, quantity]
            );

            return res.status(201).json({ message: 'Cart item added successfully' });
        }

    } catch (error) {
        console.error('Error adding to cart:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const removeFromCart = async (req, res) => {
    const userId = req.user.id;
    const { variantId, quantity } = req.body;

    if (!variantId || quantity == null) {
        return res.status(400).json({ message: 'variantId and quantity are required' });
    }

    if (quantity <= 0) {
        return res.status(400).json({ message: 'Quantity must be greater than zero' });
    }

    try {
        // Check if the item is already in cart
        const [cartRows] = await db.query(
            'SELECT id, quantity FROM cart_item WHERE user_id = ? AND variant_id = ? LIMIT 1',
            [userId, variantId]
        );

        if (cartRows.length === 0) {
            return res.status(404).json({ message: 'Cart item not found for the given variant' });
        }

        const cartItem = cartRows[0];
        const newQuantity = cartItem.quantity - quantity;

        if (newQuantity > 0) {
            // Just update the quantity
            await db.query(
                'UPDATE cart_item SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newQuantity, cartItem.id]
            );
            return res.status(200).json({ message: 'Cart item quantity updated successfully' });
        } else {
            // Quantity becomes 0 or negative, remove the item
            await db.query(
                'DELETE FROM cart_item WHERE id = ?',
                [cartItem.id]
            );
            return res.status(200).json({ message: 'Cart item removed successfully' });
        }

    } catch (error) {
        console.error('Error removing from cart:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getUserCart = async (req, res) => {
    const userId = req.user?.id;

    try {
        const [rows] = await db.query(`
            SELECT 
                c.id AS cart_id,
                c.quantity,
                v.id AS variant_id,
                v.name AS variant_name,
                v.description,
                v.color,
                v.size,
                v.price,
                v.stock,
                p.id AS product_id,
                p.name AS product_name,
                vi.path AS image_path
            FROM cart_item c
            JOIN variant v ON c.variant_id = v.id
            JOIN product p ON v.product_id = p.id
            LEFT JOIN (
                SELECT vi.variant_id, vi.path
                FROM variant_image vi
                INNER JOIN (
                    SELECT variant_id, MIN(id) AS min_id
                    FROM variant_image
                    GROUP BY variant_id
                ) first_images ON vi.variant_id = first_images.variant_id AND vi.id = first_images.min_id
            ) vi ON vi.variant_id = v.id
            WHERE c.user_id = ?
            ORDER BY c.created_at DESC
        `, [userId]);

        return res.status(200).json({
            message: 'Cart fetched successfully',
            cart: rows
        });

    } catch (error) {
        console.error('Error fetching cart:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    addToCart,
    removeFromCart,
    getUserCart
};