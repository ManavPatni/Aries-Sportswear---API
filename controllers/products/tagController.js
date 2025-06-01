const tagModel = require('../../models/tagModel');

const getAllTags = async (req, res) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    try {
        const [tags] = await tagModel.getAllTags();
        return res.status(200).json({ tags });
    } catch (err) {
        console.error('Error fetching tags:', err);
        return res.status(500).json({ message: 'Failed to get tags', error: err.message });
    }
};

const addTag = async (req, res) => {
    if (!req.staff) return res.status(403).json({ message: 'Unauthorized' });

    const { name } = req.body;

    try {
        await tagModel.create({ name });
        return res.status(200).json({ message: 'Tag added successfully' });
    } catch (err) {
        console.error('Error adding tag:', err);
        return res.status(500).json({ message: 'Failed to add tag', error: err.message });
    }
};

module.exports = {
    getAllTags,
    addTag
};