const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const categoryController = require('../controllers/products/categoryController');
const productController = require('../controllers/products/productController');
const multer = require('multer');

const router = express.Router();

// Setup multe
const upload = multer({ storage: multer.memoryStorage() });

// Protected Routes
// Category
router.get('/categories', categoryController.getCategories);
router.post('/category', authenticateToken, categoryController.addCategory);
router.put('/category/', authenticateToken, categoryController.updateCategory);
router.delete('/category/:id', authenticateToken, categoryController.deleteCategory);

// Sub Category
router.post('/sub-category', authenticateToken, categoryController.addSubCategory);
router.put('/sub-category/', authenticateToken, categoryController.updateSubCategory);
router.delete('/sub-category/:id', authenticateToken, categoryController.deleteSubCategory);

// Products
router.post('/product', authenticateToken, upload.any(), productController.addProduct);
router.put('/product/:id', authenticateToken, productController.updateProduct);
router.put('/variant/:id', authenticateToken, productController.updateVariant);
router.delete('/product/:id', authenticateToken, productController.deleteProduct);
router.delete('/variant/:id', authenticateToken, productController.deleteVariant);
router.get('/products', productController.getAllVariants);
router.get('/products/filter', productController.getFilteredVariants);
router.get('/product/:id', productController.getProductById);

module.exports = router;
