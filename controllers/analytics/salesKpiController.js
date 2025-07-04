const db = require('../../db/database');

const getSalesKpi = async (req, res) => {
    try {
        const currentDate = new Date();
        const startOfCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const startOfPreviousMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);

        // Get current total earnings
        const [currentEarningsResult] = await db.query(
            `SELECT SUM(o.shipping_fee + o.tax_amount - o.discount_amount + 
                    (SELECT SUM(oi.unit_price * oi.quantity) 
                     FROM order_items oi 
                     WHERE oi.order_id = o.id)) AS total_earnings
             FROM orders o
             WHERE o.payment_status = 'Paid' AND o.created_at >= ?`,
            [startOfCurrentMonth]
        );

        // Get current total orders
        const [currentOrdersResult] = await db.query(
            'SELECT COUNT(*) AS total_orders FROM orders WHERE payment_status = "Paid" AND created_at >= ?',
            [startOfCurrentMonth]
        );

        // Get previous month earnings
        const [previousEarningsResult] = await db.query(
            `SELECT SUM(o.shipping_fee + o.tax_amount - o.discount_amount + 
                    (SELECT SUM(oi.unit_price * oi.quantity) 
                     FROM order_items oi 
                     WHERE oi.order_id = o.id)) AS total_earnings
             FROM orders o
             WHERE o.payment_status = 'Paid' AND o.created_at >= ? AND o.created_at < ?`,
            [startOfPreviousMonth, startOfCurrentMonth]
        );

        // Get previous month orders
        const [previousOrdersResult] = await db.query(
            'SELECT COUNT(*) AS total_orders FROM orders WHERE payment_status = "Paid" AND created_at >= ? AND created_at < ?',
            [startOfPreviousMonth, startOfCurrentMonth]
        );

        // Extract values safely
        const currentEarnings = parseFloat(currentEarningsResult[0]?.total_earnings) || 0;
        const currentOrders = parseInt(currentOrdersResult[0]?.total_orders) || 0;
        const previousEarnings = parseFloat(previousEarningsResult[0]?.total_earnings) || 0;
        const previousOrders = parseInt(previousOrdersResult[0]?.total_orders) || 0;

        // Calculate percentage change
        const calcChange = (current, previous) => {
            if (previous === 0) return null;
            const change = ((current - previous) / previous) * 100;
            return (change > 0 ? '+' : '') + change.toFixed(0) + '%';
        };

        const earningsChange = calcChange(currentEarnings, previousEarnings);
        const ordersChange = calcChange(currentOrders, previousOrders);

        res.json({
            totalEarnings: parseFloat(currentEarnings.toFixed(2)),
            totalOrders: currentOrders,
            earningsChange,
            ordersChange
        });
    } catch (error) {
        console.error('Error fetching sales KPI:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = getSalesKpi;