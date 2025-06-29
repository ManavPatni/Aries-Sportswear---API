const db = require('../../db/database');

/**
 * Insert a new shipping address for a user.
 * @param {number}  userId – user.id
 * @param {Object} address
 * @returns {Promise<{address_id:number}>}
 * @throws {Error} 400-style validation errors or DB errors.
 */
exports.addAddress = async (userId, address) => {
  if (!userId) {
    throw new Error('userId is required');
  } 

  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    throw new Error('address must be an object');
  }

  const required = [
    'label', // e.g. "Home", "Office"
    'recipient_name',
    'phone',
    'line1',
    'city',
    'state',
    'postal_code',
  ];

  for (const key of required) {
    if (!address[key]) {
      throw new Error(`Missing required field: ${key}`);
    }
  }

  // ---------- 2. Destructure & set defaults ----------
  const {
    label            = 'Home',
    recipient_name,
    phone,
    line1,
    line2            = null,
    landmark         = null,
    city,
    state,
    country          = 'India',
    postal_code,
    digipin         = null,
    is_default       = 0,
  } = address;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // If this is marked as default, clear previous default rows for the same user
    if (is_default) {
      await conn.query(
        'UPDATE user_shipping_address SET is_default = 0 WHERE user_id = ?',
        [userId]
      );
    }

    const [result] = await conn.query(
      `INSERT INTO user_shipping_address
       (user_id, label, recipient_name, phone, line1, line2, landmark, city,
        state, country, postal_code, digipin, is_default)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        userId,
        label,
        recipient_name,
        phone,
        line1,
        line2,
        landmark,
        city,
        state,
        country,
        postal_code,
        digipin,
        is_default,
      ]
    );

    await conn.commit();

    return { address_id: result.insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Get a user’s shipping address(es).
 * @param {number}  userId         – user.id
 * @param {boolean} [getAll=true]  – true = all addresses, false = default only
 * @returns {Promise<Object[]|Object|null>}
 */
exports.getUserAddress = async (userId, getAll = true) => {
  if (!userId) {
    throw new Error('userId is required');
  }

  const conn = await db.getConnection();
  try {
    const sql = getAll
      ? `SELECT *
         FROM user_shipping_address
         WHERE user_id = ?
         ORDER BY is_default DESC, created_at DESC`
      : `SELECT *
         FROM user_shipping_address
         WHERE user_id = ? AND is_default = 1
         LIMIT 1`;

    const [rows] = await conn.query(sql, [userId]);

    // return shape depends on getAll flag
    return getAll ? rows : rows[0] || null;
  } finally {
    conn.release();
  }
};

/**
 * Update a user address.
 * Only the fields present in `updates` are changed.
 * If `is_default` is set to 1, other addresses for the same user are cleared.
 *
 * @param {number} addressId
 * @param {number} userId           – owner of the address (enforces row-level security)
 * @param {Object} updates          – partial object with fields to overwrite
 * @returns {Promise<void>}
 */
exports.updateAddress = async (addressId, userId, updates) => {
  if (!addressId || !userId) throw new Error('addressId and userId are required');
  if (!updates || typeof updates !== 'object' || Array.isArray(updates))
    throw new Error('updates must be an object');

  const allowed = [
    'label',
    'recipient_name',
    'phone',
    'line1',
    'line2',
    'landmark',
    'city',
    'state',
    'country',
    'postal_code',
    'digipin',
    'is_default',
  ];

  // Build dynamic SET clause
  const fields = [];
  const values = [];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }
  if (!fields.length) throw new Error('No valid fields supplied for update');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // If setting this address as default → clear others first
    if (updates.is_default === 1) {
      await conn.query(
        'UPDATE user_shipping_address SET is_default = 0 WHERE user_id = ?',
        [userId],
      );
    }

    values.push(addressId, userId); // params for WHERE clause
    await conn.query(
      `UPDATE user_shipping_address
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE address_id = ? AND user_id = ?`,
      values,
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Remove (delete) a user address.
 * If the deleted address was the default, the most recently created
 * remaining address (if any) is promoted to default.
 *
 * @param {number} addressId
 * @param {number} userId
 * @returns {Promise<void>}
 */
exports.removeAddress = async (addressId, userId) => {
  if (!addressId || !userId) throw new Error('addressId and userId are required');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Was this the default?
    const [[row]] = await conn.query(
      'SELECT is_default FROM user_shipping_address WHERE address_id = ? AND user_id = ?',
      [addressId, userId],
    );
    if (!row) throw new Error('Address not found or does not belong to user');

    await conn.query(
      'DELETE FROM user_shipping_address WHERE address_id = ? AND user_id = ?',
      [addressId, userId],
    );

    if (row.is_default === 1) {
      // Promote newest remaining address to default
      await conn.query(
        `UPDATE user_shipping_address
         SET is_default = 1
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId],
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};