const db = require('../../db/database');
const categoryModel = require('../../models/categoryModel');
const subCategoryModel = require('../../models/subCategoryModel');

// Common Controller
const getCategories = async (req, res) => {
    try {
        const [categories] = await categoryModel.getAllCategories();
        const [subCategories] = await subCategoryModel.getAllSubCategories();

        // Map subcategories by category_id
        const subCategoryMap = {};
        subCategories.forEach(sub => {
            if (!subCategoryMap[sub.category_id]) {
                subCategoryMap[sub.category_id] = [];
            }
            subCategoryMap[sub.category_id].push({
                id: sub.id,
                name: sub.name
            });
        });

        // Build the final structured response
        const result = categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            subCategories: subCategoryMap[cat.id] || []
        }));

        res.status(200).json({ categories: result });
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch categories', error: err.message });
    }
};

// CATEGORY CONTROLLERS
const addCategory = async (req, res) => {
  if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Category name is required' });

  try {
    await categoryModel.create({name: name});
    res.status(201).json({ message: 'Category added successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add category', error: err.message });
  }
};

const updateCategory = async (req, res) => {
  if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

  const { id } = req.params;
  const { name } = req.body;
  if (!id || !name) return res.status(400).json({ message: 'ID and name are required' });

  try {
    const [result] = await db.query('UPDATE category SET name = ? WHERE id = ?', [name, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json({ message: 'Category updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update category', error: err.message });
  }
};

const deleteCategory = async (req, res) => {
  if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

  const { id } = req.params;
  if (!id) return res.status(400).json({ message: 'Category ID is required' });

  try {
    const [result] = await db.query('DELETE FROM category WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete category', error: err.message });
  }
};

// SUBCATEGORY CONTROLLERS
const addSubCategory = async (req, res) => {
  if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

  const { categoryId, name } = req.body;
  if (!categoryId || !name) return res.status(400).json({ message: 'Category ID and sub-category name are required' });

  try {
    await subCategoryModel.create({categoryId: categoryId, name: name});
    res.status(201).json({ message: 'Sub-category added successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add sub-category', error: err.message });
  }
};

const updateSubCategory = async (req, res) => {
  if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

  const { id } = req.params;
  const { name } = req.body;
  if (!id || !name) return res.status(400).json({ message: 'ID and name are required' });

  try {
    const [result] = await db.query('UPDATE sub_category SET name = ? WHERE id = ?', [name, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Sub-category not found' });
    }
    res.json({ message: 'Sub-category updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update sub-category', error: err.message });
  }
};

const deleteSubCategory = async (req, res) => {
  if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

  const { id } = req.params;
  if (!id) return res.status(400).json({ message: 'Sub-category ID is required' });

  try {
    const [result] = await db.query('DELETE FROM sub_category WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Sub-category not found' });
    }
    res.json({ message: 'Sub-category deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete sub-category', error: err.message });
  }
};

module.exports = {
    getCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    addSubCategory,
    updateSubCategory,
    deleteSubCategory
}