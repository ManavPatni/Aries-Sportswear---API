const fs = require('fs');
const path = require('path');

exports.up = async function (knex) {
  const schemaFilePath = path.join(__dirname, 'sql', 'initial_schema.sql');
  let sql = fs.readFileSync(schemaFilePath, 'utf8');

  // Remove unwanted MySQL statements and comments
  sql = sql
    .replace(/SET SQL_MODE.*?;/gi, '')
    .replace(/START TRANSACTION;/gi, '')
    .replace(/SET time_zone.*?;/gi, '')
    .replace(/\/\*![\s\S]*?\*\//gm, '') // remove /*! ... */
    .replace(/--.*$/gm, '')             // remove -- comments
    .replace(/COMMIT;/gi, '')           // remove commit
    .trim();

  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');

  for (const statement of statements) {
    try {
      await knex.raw(statement);
    } catch (err) {
      console.error('\n❌ Failed to execute:\n', statement);
      throw err;
    }
  }

  await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
};

exports.down = () => {
  return Promise.reject(new Error('Initial schema – rollback not allowed'));
};
