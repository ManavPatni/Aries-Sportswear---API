const db = require('../../db/database');

exports.create = async (data) => {
    return db.query(
        'INSERT INTO variant_image (variant_id, path) VALUES (?, ?)',
        [data.variantId, data.Path]
    );
};

/**
 * Fetch images for a variant with base-variant fallback.
 *
 * @param {number|string} variantId   Variant ID
 * @param {boolean}       [getAll=true]  true = return array, false = return object or null
 * @returns {Promise<Array|Object|null>} Images or single image
 * @throws {Error} If variantId is invalid
 */
exports.getVariantImage = async (variantId, getAll = true) => {
  const id = Number(variantId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid variant ID');
  }
  if (typeof getAll !== 'boolean') {
    throw new Error('getAll must be a boolean');
  }

  const limitClause = getAll ? '' : 'LIMIT 1';
  const query = `
    SELECT vi.id, vi.path
    FROM variant_image vi
    JOIN variant v ON v.id = ?
    WHERE vi.variant_id = v.id
    UNION
    SELECT vi.id, vi.path
    FROM variant v
    JOIN variant base ON base.product_id = v.product_id AND base.is_base = 1
    JOIN variant_image vi ON vi.variant_id = base.id
    WHERE v.id = ?
    ${limitClause}
  `;
  
  const [results] = await db.query(query, [id, id]);
  
  if (getAll) {
    return results; // array (possibly empty)
  }
  
  return results[0] || null; // object or null
};