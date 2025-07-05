const db = require('../../db/database');

const getProductInsightsKpi = async (req, res) => {
    try {
        // --- Total Products ---
        const totalProductsResult = await db.query('SELECT COUNT(*) AS total FROM product');
        const totalProducts = totalProductsResult[0][0]; // Extract the first row's 'total'

        // --- Top Products by Sales ---
        const topProductsResult = await db.query(
            `SELECT 
                p.id, p.name,
                COUNT(DISTINCT o.id) AS product_order_count,
                ROUND(
                    COUNT(DISTINCT o.id) * 100.0 / NULLIF(total_orders.total_paid_orders, 0), 
                    2
                ) AS percentage_share, 
                SUM(oi.quantity) AS total_sales
            FROM product p
            JOIN order_items oi ON p.id = oi.product_id
            JOIN \`orders\` o ON oi.order_id = o.id
            CROSS JOIN (
                SELECT COUNT(DISTINCT id) AS total_paid_orders
                FROM \`orders\`
                WHERE payment_status = 'Paid'
            ) AS total_orders
            WHERE o.payment_status = 'Paid'
            GROUP BY p.id, p.name, total_orders.total_paid_orders
            ORDER BY percentage_share DESC
            LIMIT 10;`
        );
        const topProducts = topProductsResult[0]; // Extract the first result set

        // --- Top Sub-Category by Sales ---
        const topSubCategoriesResult = await db.query(
            `SELECT 
                sc.id, sc.name,
                COUNT(DISTINCT o.id) AS sub_category_order_count,
                ROUND(
                    COUNT(DISTINCT o.id) * 100.0 / NULLIF(total_orders.total_paid_orders, 0), 
                    2
                ) AS percentage_share, 
                SUM(oi.quantity) AS total_sales
            FROM sub_category sc
            JOIN product p ON sc.id = p.sub_category_id
            JOIN order_items oi ON p.id = oi.product_id
            JOIN \`orders\` o ON oi.order_id = o.id
            CROSS JOIN (
                SELECT COUNT(DISTINCT id) AS total_paid_orders
                FROM \`orders\`
                WHERE payment_status = 'Paid'
            ) AS total_orders
            WHERE o.payment_status = 'Paid'
            GROUP BY sc.id, sc.name, total_orders.total_paid_orders
            ORDER BY percentage_share DESC
            LIMIT 10;`
        );
        const topSubCategories = topSubCategoriesResult[0]; // Extract the first result set

        // Return the cleaned-up JSON response
        return res.status(200).json({
            totalProducts,
            topProducts,
            topSubCategories
        });

    } catch (error) {
        console.error('Error fetching inventory KPI:', error.message, error.stack);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const getStockReport = async (req, res) => {
    try {
        const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL;

        const stockReport = await db.query(
            `SELECT 
                v.id, 
                v.name, 
                v.price, 
                v.stock, 
                v.updated_at,
                vi.variant_id,
                vi.path,
                CASE 
                    WHEN v.stock <= 0 THEN 'Out of Stock'
                    WHEN v.stock <= 20 THEN 'Low Stock'
                    ELSE 'In Stock'
                END AS stock_status
            FROM variant v
            LEFT JOIN (
                SELECT vi.variant_id, vi.path
                FROM variant_image vi
                JOIN (
                    SELECT variant_id, MIN(id) AS min_id
                    FROM variant_image
                    GROUP BY variant_id
                ) AS min_ids ON vi.variant_id = min_ids.variant_id AND vi.id = min_ids.min_id
            ) vi ON v.id = vi.variant_id
            ORDER BY v.updated_at DESC`
        );


        // Check if stockReport is an array and extract rows
        const rows = Array.isArray(stockReport) && stockReport[0] ? stockReport[0] : stockReport;

        const dataWithFullImageUrl = rows.map(item => ({
            ...item,
            path: item.path ? `${IMAGE_BASE_URL}${item.path}` : null
        }));

        res.status(200).json(dataWithFullImageUrl);
    } catch (error) {
        console.error('Error fetching stock report:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getProductInsightsKpi,
    getStockReport,
};