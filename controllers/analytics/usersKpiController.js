const db = require('../../db/database');
const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL;

const getUsersKpi = async (req, res) => {
    try {
        const currentDate = new Date();
        const startOfCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const startOfPreviousMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);

        // --- 1) Total customers for current period ---
        const [totalCustomersResult] = await db.query(
            `SELECT COUNT(DISTINCT user_id) AS total_customers 
             FROM orders 
             WHERE payment_status = 'Paid' AND created_at >= ?`,
            [startOfCurrentMonth]
        );

        // --- Previous month total customers ---
        const [lastMonthCustomersResult] = await db.query(
            `SELECT COUNT(DISTINCT user_id) AS total_customers 
             FROM orders 
             WHERE payment_status = 'Paid' AND created_at >= ? AND created_at < ?`,
            [startOfPreviousMonth, startOfCurrentMonth]
        );

        const currentCustomers = parseInt(totalCustomersResult[0]?.total_customers) || 0;
        const previousCustomers = parseInt(lastMonthCustomersResult[0]?.total_customers) || 0;

        const customersChange =
            previousCustomers === 0
                ? null
                : ((currentCustomers - previousCustomers) / previousCustomers) * 100;

        // --- 2) New registered users in current period ---
        const [newUsers] = await db.query(
            `SELECT id, name, email, avatar FROM user WHERE created_at >= ?`,
            [startOfCurrentMonth]
        );

        // --- 3) First time purchase users ---
        const [firstTimePurchaseUsers] = await db.query(
            `SELECT DISTINCT u.id, u.name, u.email, u.avatar
             FROM user u
             JOIN orders o ON u.id = o.user_id
             WHERE o.payment_status = 'Paid' AND o.created_at >= ?
             AND o.user_id NOT IN (
                 SELECT user_id FROM orders WHERE created_at < ?
             )`,
            [startOfCurrentMonth, startOfCurrentMonth]
        );

        // Response
        res.json({
            totalCustomers: {
                count: currentCustomers,
                change: customersChange !== null
                    ? (customersChange > 0 ? '+' : '') + customersChange.toFixed(0) + '%'
                    : null
            },
            newUsers: newUsers.map(user => ({
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar ? IMAGE_BASE_URL + user.avatar : null
            })),
            firstTimePurchaseUsers: firstTimePurchaseUsers.map(user => ({
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar ? IMAGE_BASE_URL + user.avatar : null
            }))
        });
    } catch (error) {
        console.error('Error fetching users KPI:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = getUsersKpi;