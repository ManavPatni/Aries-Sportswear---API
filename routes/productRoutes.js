const express = require('express');
const multer = require('multer');
const authenticateToken = require('../middleware/authMiddleware');
const categoryController = require('../controllers/products/categoryController');
const productController = require('../controllers/products/productController');
const recommendationController = require('../controllers/products/recommendationController');

// Corrected the typo in the line below
const tagController = require('../controllers/products/tagController');

const router = express.Router();

// Setup multer for memory storage, allowing controllers to handle the buffer.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit per file
});


// ====================================================================
// PUBLIC ROUTES (No Authentication Required)
// ====================================================================

// --- Categories & Sub-Categories ---
router.get('/categories', categoryController.getCategories);

// --- Products & Variants ---
// This single endpoint handles fetching all variants OR filtered variants
// based on query parameters. e.g., /products?color=blue&limit=20
router.get('/products', productController.getFilteredVariants);

router.get('/products/by-tag', recommendationController.getVariantsByTag);
router.get('/product/:id', productController.getProductById);


// ====================================================================
// PROTECTED ROUTES (Staff Authentication Required)
// ====================================================================

// --- Categories ---
router.post('/categories', authenticateToken, categoryController.addCategory);
router.put('/categories/:id', authenticateToken, categoryController.updateCategory);
router.delete('/categories/:id', authenticateToken, categoryController.deleteCategory);

// --- Sub-Categories ---
router.post('/sub-categories', authenticateToken, categoryController.addSubCategory);
router.put('/sub-categories/:id', authenticateToken, categoryController.updateSubCategory);
router.delete('/sub-categories/:id', authenticateToken, categoryController.deleteSubCategory);

// --- Tags ---
router.get('/tags', authenticateToken, tagController.getAllTags);
router.post('/tags', authenticateToken, tagController.addTag);
// Note: Deleting/updating tags would follow a similar pattern:
// router.put('/tags/:id', ...);
// router.delete('/tags/:id', ...);

// --- Products ---
// Create a new product. Note: This only handles product data, not images.
// Images are uploaded separately to a variant ID after the product is created.
router.post('/product', authenticateToken, upload.none(), productController.addProduct);

router.put('/products/:id', authenticateToken, productController.updateProduct);
router.delete('/products/:id', authenticateToken, productController.deleteProduct);

// Sync tags for a specific variant. This will add/remove tags to match the provided list.
router.put('/products/variant/:variantId/tags', authenticateToken, productController.syncVariantTags);


// --- Variants & Variant Images ---
router.put('/product/variant/:id', authenticateToken, productController.updateVariant);
router.delete('/product/variant/:id', authenticateToken, productController.deleteVariant);

// Upload one or more images (max 5) for a specific variant
router.post(
    '/product/variants/:variantId/images',
    authenticateToken,
    upload.array('images', 5), // 'images' is the field name in the form-data
    productController.uploadVariantImages
);

// Delete a single, specific image from a variant
router.delete('/variants/images/:imageId', authenticateToken, productController.deleteVariantImage);


module.exports = router;