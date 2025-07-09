const db = require('../../db/database');

// Create a new coupon
const createCoupon = async (req, res) => {
    const {
        code,
        discount_type,
        discount_value,
        min_purchase_amount,
        start_date,
        end_date,
        usage_limit,
        applies_to_type,
        sub_category_ids,
        product_ids
    } = req.body;

    // Basic validation
    if (!code || !discount_type || !discount_value || !applies_to_type) {
        return res.status(400).json({ error: 'Missing required fields: code, discount_type, discount_value, applies_to_type' });
    }
    if (!['percentage', 'fixed'].includes(discount_type)) {
        return res.status(400).json({ error: 'Discount type must be "percentage" or "fixed"' });
    }
    if (!['all', 'subcategories', 'products'].includes(applies_to_type)) {
        return res.status(400).json({ error: 'applies_to_type must be "all", "subcategories", or "products"' });
    }

    if (applies_to_type === 'subcategories') {
        if (!sub_category_ids || !Array.isArray(sub_category_ids) || sub_category_ids.length === 0) {
            return res.status(400).json({ error: 'sub_category_ids must be a non-empty array for applies_to_type "subcategories"' });
        }
        // Check if sub_category_ids exist
        const [existingSubCategories] = await db.query('SELECT id FROM sub_category WHERE id IN (?)', [sub_category_ids]);
        const existingIds = existingSubCategories.map(row => row.id);
        const invalidIds = sub_category_ids.filter(id => !existingIds.includes(id));
        if (invalidIds.length > 0) {
            return res.status(400).json({ error: `Invalid sub_category_ids: ${invalidIds.join(', ')}` });
        }
    } else if (applies_to_type === 'products') {
        if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
            return res.status(400).json({ error: 'product_ids must be a non-empty array for applies_to_type "products"' });
        }
        // Check if product_ids exist
        const [existingProducts] = await db.query('SELECT id FROM products WHERE id IN (?)', [product_ids]);
        const existingIds = existingProducts.map(row => row.id);
        const invalidIds = product_ids.filter(id => !existingIds.includes(id));
        if (invalidIds.length > 0) {
            return res.status(400).json({ error: `Invalid product_ids: ${invalidIds.join(', ')}` });
        }
    }

    try {
        const [result] = await db.query(
            `INSERT INTO coupons (
                code, discount_type, discount_value, min_purchase_amount,
                start_date, end_date, usage_limit, applies_to_type, used_count, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
            [
                code,
                discount_type,
                discount_value,
                min_purchase_amount || null,
                start_date || null,
                end_date || null,
                usage_limit || null,
                applies_to_type
            ]
        );
        const coupon_id = result.insertId;

        if (applies_to_type === 'subcategories') {
            const values = sub_category_ids.map(id => [coupon_id, id]);
            await db.query('INSERT INTO coupon_subcategories (coupon_id, sub_category_id) VALUES ?', [values]);
        } else if (applies_to_type === 'products') {
            const values = product_ids.map(id => [coupon_id, id]);
            await db.query('INSERT INTO coupon_products (coupon_id, product_id) VALUES ?', [values]);
        }

        res.status(201).json({ message: 'Coupon created', coupon_id });
    } catch (error) {
        console.error('Error creating coupon:', error);
        res.status(500).json({ error: 'Database error' });
    }
};


// Get all coupons
const getAllCoupons = async (req, res) => {
   
    try {
        const [rows] = await db.query('SELECT * FROM coupons');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).json({ error: 'Database error' });
    }
};

// Update a coupon
const updateCoupon = async (req, res) => {
    const { id } = req.params;
    const {
        code,
        discount_type,
        discount_value,
        min_purchase_amount,
        start_date,
        end_date,
        usage_limit,
        is_active,
        applies_to_type,
        sub_category_ids,
        product_ids
    } = req.body;

    // Validation
    if (applies_to_type) {
        if (!['all', 'subcategories', 'products'].includes(applies_to_type)) {
            return res.status(400).json({ error: 'Invalid applies_to_type' });
        }
        if (applies_to_type === 'subcategories') {
            if (!sub_category_ids || !Array.isArray(sub_category_ids) || sub_category_ids.length === 0) {
                return res.status(400).json({ error: 'sub_category_ids must be a non-empty array' });
            }
            const [existingSubCategories] = await db.query('SELECT id FROM sub_categories WHERE id IN (?)', [sub_category_ids]);
            const existingIds = existingSubCategories.map(row => row.id);
            const invalidIds = sub_category_ids.filter(id => !existingIds.includes(id));
            if (invalidIds.length > 0) {
                return res.status(400).json({ error: `Invalid sub_category_ids: ${invalidIds.join(', ')}` });
            }
        } else if (applies_to_type === 'products') {
            if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
                return res.status(400).json({ error: 'product_ids must be a non-empty array' });
            }
            const [existingProducts] = await db.query('SELECT id FROM products WHERE id IN (?)', [product_ids]);
            const existingIds = existingProducts.map(row => row.id);
            const invalidIds = product_ids.filter(id => !existingIds.includes(id));
            if (invalidIds.length > 0) {
                return res.status(400).json({ error: `Invalid product_ids: ${invalidIds.join(', ')}` });
            }
        }
    }

    if (discount_type && !['percentage', 'fixed'].includes(discount_type)) {
        return res.status(400).json({ error: 'Discount type must be "percentage" or "fixed"' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [coupons] = await connection.query('SELECT * FROM coupons WHERE coupon_id = ?', [id]);
        if (coupons.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Coupon not found' });
        }

        const updates = [];
        const params = [];
        if (code) { updates.push('code = ?'); params.push(code); }
        if (discount_type) { updates.push('discount_type = ?'); params.push(discount_type); }
        if (discount_value !== undefined) { updates.push('discount_value = ?'); params.push(discount_value); }
        if (min_purchase_amount !== undefined) { updates.push('min_purchase_amount = ?'); params.push(min_purchase_amount); }
        if (start_date !== undefined) { updates.push('start_date = ?'); params.push(start_date); }
        if (end_date !== undefined) { updates.push('end_date = ?'); params.push(end_date); }
        if (usage_limit !== undefined) { updates.push('usage_limit = ?'); params.push(usage_limit); }
        if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
        if (applies_to_type) { updates.push('applies_to_type = ?'); params.push(applies_to_type); }

        if (updates.length > 0) {
            params.push(id);
            await connection.query(`UPDATE coupons SET ${updates.join(', ')} WHERE coupon_id = ?`, params);
        }

        if (applies_to_type) {
            await connection.query('DELETE FROM coupon_subcategories WHERE coupon_id = ?', [id]);
            await connection.query('DELETE FROM coupon_products WHERE coupon_id = ?', [id]);
            if (applies_to_type === 'subcategories') {
                const values = sub_category_ids.map(sub_id => [id, sub_id]);
                await connection.query('INSERT INTO coupon_subcategories (coupon_id, sub_category_id) VALUES ?', [values]);
            } else if (applies_to_type === 'products') {
                const values = product_ids.map(prod_id => [id, prod_id]);
                await connection.query('INSERT INTO coupon_products (coupon_id, product_id) VALUES ?', [values]);
            }
        }

        await connection.commit();
        res.json({ message: 'Coupon updated' });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating coupon:', error);
        res.status(500).json({ error: 'Database error' });
    } finally {
        connection.release();
    }
};

// Delete a coupon
const deleteCoupon = async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [coupons] = await connection.query('SELECT * FROM coupons WHERE coupon_id = ?', [id]);
        if (coupons.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Coupon not found' });
        }

        await connection.query('DELETE FROM coupon_subcategories WHERE coupon_id = ?', [id]);
        await connection.query('DELETE FROM coupon_products WHERE coupon_id = ?', [id]);
        await connection.query('DELETE FROM coupons WHERE coupon_id = ?', [id]);

        await connection.commit();
        res.json({ message: 'Coupon deleted' });
    } catch (error) {
        await connection.rollback();
        console.error('Error deleting coupon:', error);
        res.status(500).json({ error: 'Database error' });
    } finally {
        connection.release();
    }
};

module.exports = {
    createCoupon,
    updateCoupon,
    deleteCoupon
};