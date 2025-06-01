const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const categoryController = require('../controllers/products/categoryController');
const productController = require('../controllers/products/productController');
const recommendationController = require('../controllers/products/recommendationController');
const tagController = require('../controllers/products/tagController');
const multer = require('multer');

const router = express.Router();

// Setup multe
const upload = multer({ storage: multer.memoryStorage() });

// Public Routes
// Category
router.get('/categories', categoryController.getCategories);
// Products
router.get('/products', productController.getAllVariants);
router.get('/products/filter', productController.getFilteredVariants);
router.get('/product/:id', productController.getProductById);
router.get('/products/featured', recommendationController.getRecommendedProductsByTags);

// Protected Routes
// Category
router.post('/category', authenticateToken, categoryController.addCategory);
router.put('/category', authenticateToken, categoryController.updateCategory);
router.delete('/category/:id', authenticateToken, categoryController.deleteCategory);
// Sub Category
router.post('/sub-category', authenticateToken, categoryController.addSubCategory);
router.put('/sub-category', authenticateToken, categoryController.updateSubCategory);
router.delete('/sub-category/:id', authenticateToken, categoryController.deleteSubCategory);
// Products
router.post('/product', authenticateToken, upload.any(), productController.addProduct);
router.put('/product/:id', authenticateToken, productController.updateProduct);
router.put('/product/variant/:id', authenticateToken, productController.updateVariant);
router.delete('/product/:id', authenticateToken, productController.deleteProduct);
router.delete('/product/variant/:id', authenticateToken, productController.deleteVariant);
router.post('/product/tag', authenticateToken, productController.addTagToProduct);
//Tags
router.post('/tags', authenticateToken, tagController.addTag);
router.get('/tags', authenticateToken, tagController.getAllTags);


module.exports = router;
