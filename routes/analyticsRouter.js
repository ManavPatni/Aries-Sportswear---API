const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const getSalesKpi = require('../controllers/analytics/salesKpiController');
const getUsersKpi = require('../controllers/analytics/usersKpiController');
const getInventoryKpi = require('../controllers/analytics/inventoryKpiController');

const router = express.Router();

// ====================================================================
// PROTECTED ROUTES (Staff Authentication Required)
// ====================================================================

router.get('/sales-kpi', authenticateToken, getSalesKpi);
router.get('/users-kpi', authenticateToken, getUsersKpi);
router.get('/products-insights-kpi', authenticateToken, getInventoryKpi.getProductInsightsKpi);
router.get('/stock-report', authenticateToken, getInventoryKpi.getStockReport);

module.exports = router;
