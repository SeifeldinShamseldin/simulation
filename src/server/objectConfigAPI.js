const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'urdf_environment',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Middleware for error handling
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Get or create object type
router.post('/object-types', asyncHandler(async (req, res) => {
  const { name, category, filePath, fileType } = req.body;
  
  const client = await pool.connect();
  try {
    // Check if object type exists
    let result = await client.query(
      'SELECT * FROM object_types WHERE name = $1',
      [name]
    );
    
    if (result.rows.length === 0) {
      // Create new object type
      result = await client.query(
        `INSERT INTO object_types (name, category, file_path, file_type) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, category, filePath, fileType]
      );
    }
    
    res.json({ success: true, objectType: result.rows[0] });
  } finally {
    client.release();
  }
}));

// Save object configuration
router.post('/configurations', asyncHandler(async (req, res) => {
  const {
    objectTypeId,
    configName,
    isDefault,
    position,
    rotation,
    scale,
    materialSettings,
    physicsSettings,
    customProperties,
    createdBy
  } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // If setting as default, unset other defaults for this object type
    if (isDefault) {
      await client.query(
        'UPDATE object_configurations SET is_default = FALSE WHERE object_type_id = $1',
        [objectTypeId]
      );
    }
    
    // Insert or update configuration
    const result = await client.query(
      `INSERT INTO object_configurations 
       (object_type_id, config_name, is_default, 
        position_x, position_y, position_z,
        rotation_x, rotation_y, rotation_z,
        scale_x, scale_y, scale_z,
        material_settings, physics_settings, custom_properties, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (object_type_id, config_name) 
       DO UPDATE SET
         is_default = EXCLUDED.is_default,
         position_x = EXCLUDED.position_x,
         position_y = EXCLUDED.position_y,
         position_z = EXCLUDED.position_z,
         rotation_x = EXCLUDED.rotation_x,
         rotation_y = EXCLUDED.rotation_y,
         rotation_z = EXCLUDED.rotation_z,
         scale_x = EXCLUDED.scale_x,
         scale_y = EXCLUDED.scale_y,
         scale_z = EXCLUDED.scale_z,
         material_settings = EXCLUDED.material_settings,
         physics_settings = EXCLUDED.physics_settings,
         custom_properties = EXCLUDED.custom_properties,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        objectTypeId, configName, isDefault,
        position.x, position.y, position.z,
        rotation.x, rotation.y, rotation.z,
        scale.x, scale.y, scale.z,
        JSON.stringify(materialSettings || {}),
        JSON.stringify(physicsSettings || {}),
        JSON.stringify(customProperties || {}),
        createdBy
      ]
    );
    
    await client.query('COMMIT');
    res.json({ success: true, configuration: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

// Get configurations for an object
router.get('/configurations/:objectName', asyncHandler(async (req, res) => {
  const { objectName } = req.params;
  
  const result = await pool.query(
    `SELECT c.*, ot.name as object_name, ot.category, ot.file_path
     FROM object_configurations c
     JOIN object_types ot ON c.object_type_id = ot.id
     WHERE ot.name = $1
     ORDER BY c.is_default DESC, c.config_name`,
    [objectName]
  );
  
  res.json({ success: true, configurations: result.rows });
}));

// Get default configuration for an object
router.get('/configurations/:objectName/default', asyncHandler(async (req, res) => {
  const { objectName } = req.params;
  
  const result = await pool.query(
    `SELECT c.*, ot.name as object_name, ot.category, ot.file_path
     FROM object_configurations c
     JOIN object_types ot ON c.object_type_id = ot.id
     WHERE ot.name = $1 AND c.is_default = TRUE
     LIMIT 1`,
    [objectName]
  );
  
  if (result.rows.length === 0) {
    res.json({ success: true, configuration: null });
  } else {
    res.json({ success: true, configuration: result.rows[0] });
  }
}));

// Save spawned instance
router.post('/instances', asyncHandler(async (req, res) => {
  const {
    instanceId,
    objectTypeId,
    configurationId,
    sceneId,
    position,
    rotation,
    scale,
    isVisible
  } = req.body;
  
  const result = await pool.query(
    `INSERT INTO spawned_instances 
     (instance_id, object_type_id, configuration_id, scene_id,
      position_x, position_y, position_z,
      rotation_x, rotation_y, rotation_z,
      scale_x, scale_y, scale_z, is_visible)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (instance_id)
     DO UPDATE SET
       position_x = EXCLUDED.position_x,
       position_y = EXCLUDED.position_y,
       position_z = EXCLUDED.position_z,
       rotation_x = EXCLUDED.rotation_x,
       rotation_y = EXCLUDED.rotation_y,
       rotation_z = EXCLUDED.rotation_z,
       scale_x = EXCLUDED.scale_x,
       scale_y = EXCLUDED.scale_y,
       scale_z = EXCLUDED.scale_z,
       is_visible = EXCLUDED.is_visible,
       last_modified = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      instanceId, objectTypeId, configurationId, sceneId,
      position.x, position.y, position.z,
      rotation.x, rotation.y, rotation.z,
      scale.x, scale.y, scale.z,
      isVisible
    ]
  );
  
  res.json({ success: true, instance: result.rows[0] });
}));

// Delete configuration
router.delete('/configurations/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  await pool.query('DELETE FROM object_configurations WHERE id = $1', [id]);
  res.json({ success: true });
}));

module.exports = router; 