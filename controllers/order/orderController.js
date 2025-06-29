const db = require('../../db/database');
const razorpay = require('../../utils/razorpay');

const paymentStatus = ['pending', 'processing' , 'succesful', 'failed'];
const orderStatus = ['ordered', 'processing', 'shipping', 'out-for-delivery']

const createOrder = async (req, res) => {
    try {
        const { orderData } = req.body;

        // Validate orderData
        if (!orderData || !Array.isArray(orderData) || orderData.length === 0) {
            return res.status(400).json({ message: "Invalid or empty 'orderData' array" });
        }

        // Validate individual product entries
        for (const item of orderData) {
            if (!item.id || typeof item.id !== "number") {
                return res.status(400).json({ message: "Each product must have a valid numeric 'id'" });
            }
            if (!item.quantity || typeof item.quantity !== "number" || item.quantity <= 0) {
                return res.status(400).json({ message: `Invalid quantity for product ID: ${item.id}` });
            }
        }

        // Fetch and validate product stock and calculate total
        let totalAmount = 0;

        for (const item of orderData) {
            const [rows] = await db.query(
                'SELECT stock, price FROM variant WHERE id = ?',
                [item.id]
            );

            const product = rows[0];
            if (!product) {
                return res.status(404).json({ message: `Product with ID ${item.id} not found` });
            }

            if (item.quantity > product.stock) {
                return res.status(400).json({ 
                    message: 'Order quantity exceeds available stock', 
                    productId: item.id 
                });
            }

            totalAmount += product.price * item.quantity;
        }

        // Create Razorpay order
        const options = {
            amount: totalAmount * 100, // amount in paise
            currency: 'INR'
        };

        const order = await razorpay.orders.create(options);

        return res.json({
            success: true,
            orderId: order.id,
            amount: order.amount/100,
            currency: order.currency,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("Error in createOrder:", error);
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};

module.exports = {
    createOrder
}