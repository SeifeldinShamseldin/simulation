const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const app = express();

// Helper function to check if a file is an image
function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].includes(ext);
}

// Enable CORS for development
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// Parse JSON bodies BEFORE multer
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '..', '..', 'public')));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Get manufacturer and model from form data
    const manufacturer = req.body.manufacturer || 'Unknown';
    const model = req.body.model || 'Unknown';
    
    // Create safe directory names
    const safeManufacturer = manufacturer.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const safeModel = model.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    
    const uploadPath = path.join(__dirname, '..', '..', 'public', 'robots', safeManufacturer, safeModel);
    
    console.log('Creating upload path:', uploadPath);
    
    // Create directory if it doesn't exist
    try {
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      console.error('Error creating directory:', error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    // Keep original filename
    console.log('Saving file:', file.originalname);
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    console.log('Processing file:', file.originalname, 'Type:', file.mimetype);
    
    // Accept URDF, mesh files, and images
    const allowedExtensions = ['.urdf', '.stl', '.dae', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      console.log('File type not allowed:', ext);
      cb(new Error(`File type ${ext} not allowed. Allowed types: ${allowedExtensions.join(', ')}`), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit per file
    files: 50 // Max 50 files
  }
});

// Add robot endpoint with improved error handling
app.post('/api/robots/add', (req, res) => {
  console.log('=== ADD ROBOT REQUEST ===');
  console.log('Headers:', req.headers);
  
  // Use multer middleware
  upload.fields([
    { name: 'urdf', maxCount: 1 },
    { name: 'meshes', maxCount: 50 },
    { name: 'image', maxCount: 1 }
  ])(req, res, function (err) {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ 
        success: false, 
        message: `Upload error: ${err.message}` 
      });
    }
    
    console.log('Body after multer:', req.body);
    console.log('Files after multer:', req.files);
    
    try {
      const { manufacturer, model } = req.body;
      
      console.log('Processing robot:', { manufacturer, model });
      
      if (!manufacturer || !model) {
        return res.status(400).json({ 
          success: false, 
          message: 'Manufacturer and model are required' 
        });
      }
      
      if (!req.files) {
        return res.status(400).json({ 
          success: false, 
          message: 'No files uploaded' 
        });
      }
      
      if (!req.files.urdf || req.files.urdf.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'URDF file is required' 
        });
      }
      
      if (!req.files.meshes || req.files.meshes.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'At least one mesh file is required' 
        });
      }
      
      const urdfFile = req.files.urdf[0];
      const meshFiles = req.files.meshes;
      
      // Validate URDF file content
      const urdfPath = path.join(urdfFile.destination, urdfFile.filename);
      const urdfContent = fs.readFileSync(urdfPath, 'utf8');
      if (!urdfContent.includes('<robot') || !urdfContent.includes('</robot>')) {
        // Remove uploaded files if URDF is invalid
        fs.rmSync(urdfFile.destination, { recursive: true, force: true });
        return res.status(400).json({
          success: false,
          message: 'Invalid URDF file format'
        });
      }
      
      console.log(`Successfully added robot: ${manufacturer}/${model}`);
      console.log(`URDF: ${urdfFile.filename}`);
      console.log(`Mesh files: ${meshFiles.map(f => f.filename).join(', ')}`);
      
      // Update the robots index
      setTimeout(() => {
        generateRobotIndex();
      }, 1000);
      
      res.json({
        success: true,
        message: 'Robot added successfully',
        robot: {
          id: model.toLowerCase().replace(/\s+/g, '_'),
          name: model,
          manufacturer: manufacturer,
          urdfFile: urdfFile.filename,
          meshFiles: meshFiles.map(f => f.filename)
        }
      });
      
    } catch (error) {
      console.error('Error processing robot upload:', error);
      // Clean up any uploaded files if there was an error
      if (req.files && req.body.manufacturer && req.body.model) {
        const uploadPath = path.join(__dirname, '..', '..', 'public', 'robots', req.body.manufacturer, req.body.model);
        if (fs.existsSync(uploadPath)) {
          fs.rmSync(uploadPath, { recursive: true, force: true });
        }
      }
      res.status(500).json({ 
        success: false, 
        message: `Server error: ${error.message}` 
      });
    }
  });
});

// Remove robot endpoint with improved validation
app.delete('/api/robots/:manufacturer/:model', (req, res) => {
  try {
    const { manufacturer, model } = req.params;
    const robotPath = path.join(__dirname, '..', '..', 'public', 'robots', manufacturer, model);
    
    if (!fs.existsSync(robotPath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'Robot not found' 
      });
    }
    
    // Validate that this is a robot directory
    const files = fs.readdirSync(robotPath);
    const hasUrdf = files.some(file => file.endsWith('.urdf'));
    const hasMeshes = files.some(file => file.endsWith('.stl') || file.endsWith('.dae'));
    
    if (!hasUrdf || !hasMeshes) {
      return res.status(400).json({
        success: false,
        message: 'Invalid robot directory structure'
      });
    }
    
    // Remove the robot directory
    fs.rmSync(robotPath, { recursive: true, force: true });
    
    // Update the robots index
    generateRobotIndex();
    
    res.json({ 
      success: true, 
      message: 'Robot removed successfully' 
    });
  } catch (error) {
    console.error('Error removing robot:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error removing robot' 
    });
  }
});

// Get available IK solvers
app.get('/api/ik-solvers', (req, res) => {
  try {
    const ikSolversPath = path.join(__dirname, '..', '..', 'public', 'IKSolvers');
    
    if (!fs.existsSync(ikSolversPath)) {
      console.log('IK Solvers directory does not exist');
      return res.json({ success: true, solvers: [] });
    }
    
    const solvers = [];
    
    // Read all files in the IKSolvers directory
    const files = fs.readdirSync(ikSolversPath, { withFileTypes: true });
    
    files.forEach(file => {
      if (file.isFile() && file.name.endsWith('.jsx')) {
        const solverName = file.name.replace('.jsx', '');
        solvers.push({
          id: solverName.toLowerCase(),
          name: solverName,
          filename: file.name,
          path: `/IKSolvers/${file.name}`
        });
        console.log(`Found IK solver: ${solverName}`);
      }
    });
    
    console.log(`Found ${solvers.length} IK solvers`);
    res.json({ success: true, solvers });
    
  } catch (error) {
    console.error('Error scanning IK solvers:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error scanning IK solvers',
      error: error.message 
    });
  }
});

// GET trajectory analysis data
app.get('/api/trajectory/analyze/:manufacturer/:model/:name', async (req, res) => {
  try {
    const { manufacturer, model, name } = req.params;
    const trajectoryFileName = `${name}.json`;
    const trajectoryPath = path.join(__dirname, '..', '..', 'public', 'trajectory', manufacturer, model, trajectoryFileName);

    if (!fs.existsSync(trajectoryPath)) {
      console.warn(`Trajectory file not found: ${trajectoryPath}`);
      return res.status(404).json({ success: false, message: 'Trajectory not found' });
    }

    // Read trajectory data
    const trajectoryData = JSON.parse(fs.readFileSync(trajectoryPath, 'utf8'));

    // For now, we'll return a simplified analysis based on the trajectory data itself.
    // In a real scenario, you would perform actual analysis here (e.g., calculate path length,
    // identify key points, analyze joint movements, etc.).
    const analysisResult = {
      frameCount: trajectoryData.endEffectorPath ? trajectoryData.endEffectorPath.length : 0,
      duration: trajectoryData.duration || 0,
      endEffectorStats: {
        totalDistance: 0, // Placeholder, actual calculation would be here
        bounds: {        // Placeholder, actual calculation would be here
          min: { x: -0.5, y: -0.5, z: 0 },
          max: { x: 0.5, y: 0.5, z: 1.5 }
        }
      },
      // You can add more detailed analysis results here
    };

    res.json({ success: true, analysis: analysisResult });

  } catch (error) {
    console.error('Error analyzing trajectory:', error);
    res.status(500).json({ success: false, message: `Error analyzing trajectory: ${error.message}` });
  }
});

// Function to regenerate robot index after changes
function generateRobotIndex() {
  try {
    console.log('Generating robot index...');
    const robotsDir = path.join(__dirname, '..', '..', 'public', 'robots');
    
    if (!fs.existsSync(robotsDir)) {
      console.log('Robots directory does not exist, creating it...');
      fs.mkdirSync(robotsDir, { recursive: true });
      return;
    }
    
    // Get all directories (categories) in the robots directory
    const categories = fs.readdirSync(robotsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const categoryName = dirent.name;
        const categoryDir = path.join(robotsDir, categoryName);
        
        // Look for a manufacturer logo in the category directory
        const categoryFiles = fs.readdirSync(categoryDir, { withFileTypes: true });
        const manufacturerLogoFile = categoryFiles.find(file => file.isFile() && isImageFile(file.name));
        let manufacturerLogoPath = null;
        if (manufacturerLogoFile) {
          manufacturerLogoPath = `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(manufacturerLogoFile.name)}`;
          console.log(`[generateRobotIndex] Found manufacturer logo for ${categoryName}:`, manufacturerLogoPath);
        }

        try {
          // Get all robot directories in this category
          const robotDirs = fs.readdirSync(categoryDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(robotDirent => {
              const robotId = robotDirent.name;
              const robotDir = path.join(categoryDir, robotId);
              
              try {
                // Check if this directory contains a URDF file and mesh files
                const files = fs.readdirSync(robotDir);
                const urdfFile = files.find(file => file.endsWith('.urdf'));
                const hasMeshes = files.some(file => file.endsWith('.stl') || file.endsWith('.dae'));
                
                // Look for image files - just find ANY image in the directory
                const imageFiles = files.filter(file => isImageFile(file));
                const imageFile = imageFiles.length > 0 ? imageFiles[0] : null; // Use first image found
                
                if (imageFile) {
                  console.log(`Found image file for ${robotId}:`, imageFile);
                } else {
                  console.log(`No image file found for ${robotId} in files:`, files);
                }
                
                if (urdfFile && hasMeshes) {
                  const robotData = {
                    id: robotId.toLowerCase().replace(/\s+/g, '_'),
                    name: robotId.charAt(0).toUpperCase() + robotId.slice(1),
                    urdfPath: `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}/${encodeURIComponent(urdfFile)}`,
                    packagePath: `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}`,
                    meshFiles: files.filter(file => file.endsWith('.stl') || file.endsWith('.dae'))
                  };
                  
                  // Add image path if found
                  if (imageFile) {
                    robotData.imagePath = `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}/${encodeURIComponent(imageFile)}`;
                  }
                  
                  return robotData;
                }
              } catch (error) {
                console.warn(`Error reading robot directory ${robotDir}:`, error.message);
              }
              return null;
            })
            .filter(Boolean);
            
          return {
            id: categoryName.toLowerCase().replace(/\s+/g, '_'),
            name: categoryName,
            robots: robotDirs,
            manufacturerLogoPath: manufacturerLogoPath // Add logo path to category
          };
        } catch (error) {
          console.warn(`Error reading category directory ${categoryDir}:`, error.message);
          return null;
        }
      })
      .filter(Boolean)
      .filter(category => category.robots.length > 0);
    
    // Write to index.json in the robots directory
    const indexPath = path.join(robotsDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({ categories }, null, 2));
    
    console.log('Robot index updated successfully. Found categories:', categories.length);
  } catch (error) {
    console.error('Error generating robot index:', error);
    throw error;
  }
}

// Get available robots with category structure (FIXED)
app.get('/robots/list', (req, res) => {
  try {
    const robotsDir = path.join(__dirname, '..', '..', 'public', 'robots');
    console.log('Looking for robots in:', robotsDir);
    
    // Check if directory exists
    if (!fs.existsSync(robotsDir)) {
      console.log('Robots directory does not exist');
      return res.json({ success: true, categories: [] });
    }
    
    const categories = [];
    
    try {
      // Get all directories (categories) in the robots directory  
      const categoryDirs = fs.readdirSync(robotsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());
      
      for (const categoryDir of categoryDirs) {
        const categoryName = categoryDir.name;
        const categoryPath = path.join(robotsDir, categoryName);
        
        // Look for a manufacturer logo in the category directory
        const categoryFiles = fs.readdirSync(categoryPath, { withFileTypes: true });
        const manufacturerLogoFile = categoryFiles.find(file => file.isFile() && isImageFile(file.name));
        let manufacturerLogoPath = null;
        if (manufacturerLogoFile) {
          manufacturerLogoPath = `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(manufacturerLogoFile.name)}`;
          console.log(`[Server] Found manufacturer logo for ${categoryName}:`, manufacturerLogoPath);
        }

        try {
          // Get all robot directories in this category
          const robotDirs = fs.readdirSync(categoryPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());
          
          const robots = [];
          
          for (const robotDir of robotDirs) {
            const robotId = robotDir.name;
            const robotPath = path.join(categoryPath, robotId);
            
            try {
              // Check if this directory contains a URDF file and mesh files
              const files = fs.readdirSync(robotPath);
              console.log(`Files in ${robotId}:`, files); // Debug log
              
              const urdfFile = files.find(file => file.endsWith('.urdf'));
              const hasMeshes = files.some(file => file.endsWith('.stl') || file.endsWith('.dae'));
              
              // Look for image files - just find ANY image in the directory
              const imageFiles = files.filter(file => isImageFile(file));
              const imageFile = imageFiles.length > 0 ? imageFiles[0] : null; // Use first image found
              
              if (imageFile) {
                console.log(`Found image file for ${robotId}:`, imageFile);
              } else {
                console.log(`No image file found for ${robotId} in files:`, files);
              }
              
              if (urdfFile && hasMeshes) {
                const robotData = {
                  id: robotId.toLowerCase().replace(/\s+/g, '_'),
                  name: robotId.charAt(0).toUpperCase() + robotId.slice(1),
                  urdfPath: `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}/${encodeURIComponent(urdfFile)}`,
                  packagePath: `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}`,
                  meshFiles: files.filter(file => file.endsWith('.stl') || file.endsWith('.dae'))
                };
                
                // Add image path if found
                if (imageFile) {
                  robotData.imagePath = `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}/${encodeURIComponent(imageFile)}`;
                  console.log(`Set imagePath for ${robotId}:`, robotData.imagePath); // Debug log
                }
                
                robots.push(robotData);
              }
            } catch (error) {
              console.warn(`Error reading robot directory ${robotPath}:`, error.message);
            }
          }
          
          if (robots.length > 0) {
            categories.push({
              id: categoryName.toLowerCase().replace(/\s+/g, '_'),
              name: categoryName,
              robots: robots,
              manufacturerLogoPath: manufacturerLogoPath // Add logo path to category
            });
          }
        } catch (error) {
          console.warn(`Error reading category directory ${categoryPath}:`, error.message);
        }
      }
      
      console.log(`Found ${categories.length} robot categories with ${categories.reduce((sum, cat) => sum + cat.robots.length, 0)} total robots`);
      
      // CRITICAL: Return consistent format with success flag
      res.json({ success: true, categories });
      
    } catch (dirError) {
      console.error('Error reading robots directory:', dirError);
      res.json({ success: true, categories: [] });
    }
    
  } catch (error) {
    console.error('Error listing robots:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error listing robots',
      error: error.message 
    });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Server is working!', 
    timestamp: new Date().toISOString() 
  });
});

// Configure multer for environment uploads
const envStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Get category from form data
    const category = req.body.category || 'uncategorized';
    
    // Create safe directory name
    const safeCategory = category.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
    
    const uploadPath = path.join(__dirname, '..', '..', 'public', 'hazard', safeCategory);
    
    console.log('Creating environment upload path:', uploadPath);
    
    // Create directory if it doesn't exist
    try {
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      console.error('Error creating directory:', error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    // Create filename based on object name
    const objectName = req.body.objectName || 'object';
    const safeName = objectName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${safeName}_${timestamp}${ext}`;
    
    console.log('Saving environment file:', filename);
    cb(null, filename);
  }
});

const envUpload = multer({
  storage: envStorage,
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    // Allow all 3D file formats that Three.js supports
    const allowedExtensions = ['.dae', '.stl', '.obj', '.fbx', '.gltf', '.glb', '.ply'];
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Allowed types: ${allowedExtensions.join(', ')}`), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Update the add environment endpoint
app.post('/api/environment/add', (req, res) => {
  console.log('=== ADD ENVIRONMENT OBJECT REQUEST ===');
  
  envUpload.single('modelFile')(req, res, function (err) { // Changed from 'stlFile' to 'modelFile'
    if (err) {
      console.error('Environment upload error:', err);
      return res.status(400).json({ 
        success: false, 
        message: `Upload error: ${err.message}` 
      });
    }
    
    try {
      const { category, objectName, description } = req.body;
      
      console.log('Processing environment object:', { category, objectName });
      
      if (!category || !objectName) {
        return res.status(400).json({ 
          success: false, 
          message: 'Category and object name are required' 
        });
      }
      
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          message: '3D model file is required' 
        });
      }
      
      const safeCategory = category.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      const filePath = `/hazard/${safeCategory}/${req.file.filename}`;
      const fileExt = path.extname(req.file.filename).toLowerCase().substring(1); // Get extension without dot
      
      console.log(`Successfully added environment object: ${objectName} in ${category}`);
      console.log(`File: ${req.file.filename} (${fileExt.toUpperCase()})`);
      
      res.json({
        success: true,
        message: 'Environment object added successfully',
        object: {
          id: `${safeCategory}_${objectName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
          name: objectName,
          category: safeCategory,
          filename: req.file.filename,
          path: filePath,
          type: fileExt, // Include file type for the scanner
          size: req.file.size,
          description: description || ''
        }
      });
      
    } catch (error) {
      console.error('Error processing environment upload:', error);
      // Clean up any uploaded files if there was an error
      if (req.file) {
        const uploadPath = req.file.path;
        if (fs.existsSync(uploadPath)) {
          fs.unlinkSync(uploadPath);
        }
      }
      res.status(500).json({ 
        success: false, 
        message: `Server error: ${error.message}` 
      });
    }
  });
});

// Get available environment objects dynamically from hazard directory
app.get('/api/environment/scan', (req, res) => {
  try {
    const hazardDir = path.join(__dirname, '..', '..', 'public', 'hazard');
    
    if (!fs.existsSync(hazardDir)) {
      return res.json({ success: true, categories: [] });
    }
    
    const categories = [];
    
    // Scan for category directories
    const categoryDirs = fs.readdirSync(hazardDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory());
    
    categoryDirs.forEach(categoryDir => {
      const categoryPath = path.join(hazardDir, categoryDir.name);
      const objects = [];
      
      // Recursively scan for 3D files
      const scanDirectory = (dirPath, baseName = '') => {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        
        items.forEach(item => {
          if (item.isDirectory()) {
            // Recurse into subdirectories
            scanDirectory(
              path.join(dirPath, item.name), 
              baseName ? `${baseName}/${item.name}` : item.name
            );
          } else {
            // Check if it's a supported 3D file
            const ext = path.extname(item.name).toLowerCase();
            const supportedExts = ['.dae', '.stl', '.obj', '.fbx', '.gltf', '.glb', '.ply'];
            
            if (supportedExts.includes(ext)) {
              const fullPath = baseName ? `${baseName}/${item.name}` : item.name;
              objects.push({
                id: `${categoryDir.name}_${fullPath.replace(/[\/\s\.]/g, '_')}`,
                name: item.name.replace(ext, '').replace(/_/g, ' '),
                filename: item.name,
                path: `/hazard/${categoryDir.name}/${fullPath}`,
                type: ext.substring(1),
                size: fs.statSync(path.join(dirPath, item.name)).size
              });
            }
          }
        });
      };
      
      scanDirectory(categoryPath);
      
      if (objects.length > 0) {
        categories.push({
          id: categoryDir.name,
          name: categoryDir.name.charAt(0).toUpperCase() + categoryDir.name.slice(1).replace(/([A-Z])/g, ' $1').trim(),
          objects: objects,
          icon: getIconForCategory(categoryDir.name)
        });
      }
    });
    
    res.json({ success: true, categories });
    
  } catch (error) {
    console.error('Error scanning environment directory:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error scanning environment directory' 
    });
  }
});

// Delete environment object file
app.delete('/api/environment/delete', express.json(), (req, res) => {
  try {
    const { path: filePath } = req.body;
    
    if (!filePath || !filePath.startsWith('/hazard/')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid path' 
      });
    }
    
    // Construct full path - FIX: use path module properly
    const fullPath = path.join(__dirname, '..', '..', 'public', filePath);
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'File not found' 
      });
    }
    
    // Check if it's a file (not directory)
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Path is not a file' 
      });
    }
    
    // Delete the file
    fs.unlinkSync(fullPath);
    
    console.log(`Deleted environment file: ${filePath}`);
    
    res.json({ 
      success: true, 
      message: 'File deleted successfully' 
    });
    
  } catch (error) {
    console.error('Error deleting environment file:', error);
    res.status(500).json({ 
      success: false, 
      message: `Error deleting file: ${error.message}` 
    });
  }
});

// Delete entire category
app.delete('/api/environment/category/:category', express.json(), (req, res) => {
  try {
    const { category } = req.params;
    
    if (!category) {
      return res.status(400).json({ 
        success: false, 
        message: 'Category name is required' 
      });
    }
    
    const categoryPath = path.join(__dirname, '..', '..', 'public', 'hazard', category);
    
    // Check if category exists
    if (!fs.existsSync(categoryPath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'Category not found' 
      });
    }
    
    // Check if it's a directory
    const stats = fs.statSync(categoryPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Not a valid category' 
      });
    }
    
    // Delete the entire category directory
    fs.rmSync(categoryPath, { recursive: true, force: true });
    
    console.log(`Deleted category: ${category}`);
    
    res.json({ 
      success: true, 
      message: 'Category deleted successfully' 
    });
    
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ 
      success: false, 
      message: `Error deleting category: ${error.message}` 
    });
  }
});

// Helper function to assign icons based on category name
function getIconForCategory(categoryName) {
  const iconMap = {
    'furniture': '🪑',
    'electricalhazard': '⚡',
    'mechanicalhazard': '⚙️',
    'safetysign': '⚠️',
    'machinery': '🏭',
    'tools': '🔧',
    'safety': '🦺',
    'storage': '📦',
    'vehicle': '🚗',
    'barrier': '🚧'
  };
  
  return iconMap[categoryName.toLowerCase()] || '📦';
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    success: false, 
    message: err.message || 'Something broke!' 
  });
});

// ========== TRAJECTORY MANAGEMENT ==========

// Get trajectory data
app.post('/api/trajectory/get', express.json(), (req, res) => {
  try {
    const { trajectoryInfo } = req.body;
    
    if (!trajectoryInfo?.manufacturer || !trajectoryInfo?.model || !trajectoryInfo?.name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields in trajectoryInfo' 
      });
    }
    
    const { manufacturer, model, name } = trajectoryInfo;
    const filePath = path.join(__dirname, '..', '..', 'public', 'trajectory', manufacturer, model, `${name}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Trajectory not found'
      });
    }
    
    const data = fs.readFileSync(filePath, 'utf8');
    const trajectory = JSON.parse(data);
    
    res.json({
      success: true,
      trajectory
    });
  } catch (error) {
    console.error('Trajectory get error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Scan trajectories for a specific robot
app.get('/api/trajectory/scan', (req, res) => {
  try {
    const { manufacturer, model } = req.query;
    const trajectoryBasePath = path.join(__dirname, '..', '..', 'public', 'trajectory');
    
    // If no manufacturer/model specified, return all trajectories
    if (!manufacturer || !model) {
      return res.status(400).json({
        success: false,
        message: 'Missing manufacturer or model parameters'
      });
    }
    
    const modelPath = path.join(trajectoryBasePath, manufacturer, model);
    
    if (!fs.existsSync(modelPath)) {
      return res.json({ 
        success: true, 
        trajectories: [] 
      });
    }
    
    const files = fs.readdirSync(modelPath)
      .filter(file => file.endsWith('.json'));
    
    const trajectories = files.map(file => {
      const name = path.basename(file, '.json');
      return {
        manufacturer,
        model,
        name,
        fileName: file
      };
    });
    
    res.json({
      success: true,
      trajectories
    });
  } catch (error) {
    console.error('Trajectory scan error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Save trajectory
app.post('/api/trajectory/save', express.json({ limit: '10mb' }), (req, res) => {
  try {
    const { trajectoryInfo, trajectoryData } = req.body;
    
    if (!trajectoryInfo?.manufacturer || !trajectoryInfo?.model || !trajectoryInfo?.name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields in trajectoryInfo' 
      });
    }
    
    if (!trajectoryData || !Array.isArray(trajectoryData.frames)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid trajectory data' 
      });
    }
    
    const { manufacturer, model, name } = trajectoryInfo;
    
    // Create directory structure
    const trajectoryDir = path.join(__dirname, '..', '..', 'public', 'trajectory', manufacturer, model);
    if (!fs.existsSync(trajectoryDir)) {
      fs.mkdirSync(trajectoryDir, { recursive: true });
    }
    
    // Save trajectory file
    const fileName = `${name}.json`;
    const filePath = path.join(trajectoryDir, fileName);
    
    fs.writeFileSync(filePath, JSON.stringify(trajectoryData, null, 2));
    
    console.log(`[Trajectory] Saved: ${manufacturer}/${model}/${fileName}`);
    
    res.json({
      success: true,
      message: 'Trajectory saved successfully',
      path: `${manufacturer}/${model}/${fileName}`,
      trajectoryInfo: {
        manufacturer,
        model,
        name,
        frames: trajectoryData.frames.length,
        duration: trajectoryData.duration
      }
    });
    
  } catch (error) {
    console.error('Trajectory save error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Delete trajectory
app.delete('/api/trajectory/delete', express.json(), (req, res) => {
  try {
    const { trajectoryInfo } = req.body;
    
    if (!trajectoryInfo?.manufacturer || !trajectoryInfo?.model || !trajectoryInfo?.name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields in trajectoryInfo' 
      });
    }
    
    const { manufacturer, model, name } = trajectoryInfo;
    const filePath = path.join(__dirname, '..', '..', 'public', 'trajectory', manufacturer, model, `${name}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Trajectory not found'
      });
    }
    
    fs.unlinkSync(filePath);
    
    // Clean up empty directories
    const modelPath = path.join(__dirname, '..', '..', 'public', 'trajectory', manufacturer, model);
    const modelFiles = fs.readdirSync(modelPath);
    if (modelFiles.length === 0) {
      fs.rmdirSync(modelPath);
      
      const manufacturerPath = path.join(__dirname, '..', '..', 'public', 'trajectory', manufacturer);
      const manufacturerDirs = fs.readdirSync(manufacturerPath);
      if (manufacturerDirs.length === 0) {
        fs.rmdirSync(manufacturerPath);
      }
    }
    
    console.log(`[Trajectory] Deleted: ${manufacturer}/${model}/${name}.json`);
    
    res.json({
      success: true,
      message: 'Trajectory deleted successfully',
      deleted: `${manufacturer}/${model}/${name}.json`
    });
  } catch (error) {
    console.error('Trajectory delete error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Analyze trajectory
app.post('/api/trajectory/analyze', express.json(), async (req, res) => {
  try {
    const { trajectoryInfo } = req.body;
    
    if (!trajectoryInfo?.manufacturer || !trajectoryInfo?.model || !trajectoryInfo?.name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields in trajectoryInfo' 
      });
    }
    
    const { manufacturer, model, name } = trajectoryInfo;
    const filePath = path.join(__dirname, '..', '..', 'public', 'trajectory', manufacturer, model, `${name}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'Trajectory not found' 
      });
    }

    const trajectoryData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Simple analysis
    const analysis = {
      frameCount: trajectoryData.frames?.length || 0,
      duration: trajectoryData.duration || 0,
      hasEndEffectorPath: !!trajectoryData.endEffectorPath,
      endEffectorPathLength: trajectoryData.endEffectorPath?.length || 0,
      recordedAt: trajectoryData.metadata?.recordedAt || trajectoryData.recordedAt,
      robotId: trajectoryData.metadata?.robotId || trajectoryData.robotId
    };

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('Trajectory analyze error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get available robots by scanning the robots directory (SCAN ENDPOINT)
app.get('/api/robots/scan', (req, res) => {
  try {
    const robotsDir = path.join(__dirname, '..', '..', 'public', 'robots');
    if (!fs.existsSync(robotsDir)) {
      return res.json({ success: true, categories: [] });
    }
    const categories = [];
    const categoryDirs = fs.readdirSync(robotsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory());
    for (const categoryDir of categoryDirs) {
      const categoryName = categoryDir.name;
      const categoryPath = path.join(robotsDir, categoryName);
      const categoryFiles = fs.readdirSync(categoryPath, { withFileTypes: true });
      const manufacturerLogoFile = categoryFiles.find(file => file.isFile() && isImageFile(file.name));
      let manufacturerLogoPath = null;
      if (manufacturerLogoFile) {
        manufacturerLogoPath = `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(manufacturerLogoFile.name)}`;
      }
      try {
        const robotDirs = fs.readdirSync(categoryPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory());
        const robots = [];
        for (const robotDir of robotDirs) {
          const robotId = robotDir.name;
          const robotPath = path.join(categoryPath, robotId);
          try {
            const files = fs.readdirSync(robotPath);
            const urdfFile = files.find(file => file.endsWith('.urdf'));
            const hasMeshes = files.some(file => file.endsWith('.stl') || file.endsWith('.dae'));
            const imageFiles = files.filter(file => isImageFile(file));
            const imageFile = imageFiles.length > 0 ? imageFiles[0] : null;
            if (urdfFile && hasMeshes) {
              const robotData = {
                id: robotId.toLowerCase().replace(/\s+/g, '_'),
                name: robotId.charAt(0).toUpperCase() + robotId.slice(1),
                urdfPath: `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}/${encodeURIComponent(urdfFile)}`,
                packagePath: `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}`,
                meshFiles: files.filter(file => file.endsWith('.stl') || file.endsWith('.dae'))
              };
              if (imageFile) {
                robotData.imagePath = `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}/${encodeURIComponent(imageFile)}`;
              }
              robots.push(robotData);
            }
          } catch (error) {
            console.warn(`Error reading robot directory ${robotPath}:`, error.message);
          }
        }
        if (robots.length > 0) {
          categories.push({
            id: categoryName.toLowerCase().replace(/\s+/g, '_'),
            name: categoryName,
            robots: robots,
            manufacturerLogoPath: manufacturerLogoPath
          });
        }
      } catch (error) {
        console.warn(`Error reading category directory ${categoryPath}:`, error.message);
      }
    }
    res.json({ success: true, categories });
  } catch (error) {
    console.error('Error scanning robots directory:', error);
    res.status(500).json({
      success: false,
      message: 'Error scanning robots directory',
      error: error.message
    });
  }
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at: http://localhost:${PORT}/api/`);
  console.log(`Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`Serving static files from: ${path.join(__dirname, '..', '..', 'public')}`);
  
  // Generate initial index
  generateRobotIndex();
});

module.exports = app; 

// Helper function to check if a file is a supported mesh format
function isSupportedMeshFormat(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.stl', '.dae', '.obj', '.glb', '.gltf'].includes(ext);
}

// Helper function to format tool names
function formatToolName(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

// Get available TCP tools by scanning the tcp directory (FIXED - robust like environment)
app.get('/api/tcp/scan', (req, res) => {
  try {
    const tcpDir = path.join(__dirname, '..', '..', 'public', 'tcp');
    
    if (!fs.existsSync(tcpDir)) {
      console.log('TCP directory does not exist');
      return res.json({ success: true, tools: [] });
    }
    
    const tools = [];
    
    try {
      // Scan for tool directories and files
      const items = fs.readdirSync(tcpDir, { withFileTypes: true });
      
      for (const item of items) {
        try {
          if (item.isDirectory()) {
            // Scan directory for tools
            const toolsInDir = scanToolDirectory(path.join(tcpDir, item.name), item.name);
            tools.push(...toolsInDir);
          } else {
            // Check if it's a supported mesh file
            const toolInfo = analyzeSingleToolFile(path.join(tcpDir, item.name), item.name);
            if (toolInfo) {
              tools.push(toolInfo);
            }
          }
        } catch (itemError) {
          console.warn(`Error processing TCP item ${item.name}:`, itemError.message);
          // Continue with next item instead of failing entirely
        }
      }
      
      console.log(`Found ${tools.length} TCP tools`);
      res.json({ success: true, tools });
      
    } catch (scanError) {
      console.error('Error scanning TCP directory:', scanError);
      res.json({ success: true, tools: [] }); // Graceful fallback
    }
    
  } catch (error) {
    console.error('Error in TCP scan endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error scanning TCP directory',
      error: error.message 
    });
  }
});

// Helper function to scan a tool directory (made more robust)
function scanToolDirectory(dirPath, dirName) {
  const tools = [];
  
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    // Check for subdirectories (like robotiq/robotiqarg2f85model)
    const subDirs = items.filter(item => item.isDirectory());
    
    if (subDirs.length > 0) {
      // Scan subdirectories
      for (const subDir of subDirs) {
        try {
          const subDirPath = path.join(dirPath, subDir.name);
          const subDirTools = scanSingleToolDirectory(subDirPath, `${dirName}/${subDir.name}`);
          tools.push(...subDirTools);
        } catch (subDirError) {
          console.warn(`Error scanning subdirectory ${subDir.name}:`, subDirError.message);
        }
      }
    } else {
      // Scan current directory
      const dirTools = scanSingleToolDirectory(dirPath, dirName);
      tools.push(...dirTools);
    }
    
  } catch (error) {
    console.warn(`Error scanning tool directory ${dirPath}:`, error.message);
  }
  
  return tools;
}

// Helper function to scan a single tool directory (made more robust)
function scanSingleToolDirectory(dirPath, toolPath) {
  try {
    const files = fs.readdirSync(dirPath);
    
    // Check for URDF files
    const urdfFiles = files.filter(file => file.toLowerCase().endsWith('.urdf'));
    const meshFiles = files.filter(file => isSupportedMeshFormat(file));
    
    if (urdfFiles.length > 0) {
      // URDF-based tool
      const urdfFile = urdfFiles[0]; // Use first URDF file
      const toolName = path.basename(toolPath);
      
      return [{
        id: toolPath.replace(/[\/\s]/g, '_'),
        name: formatToolName(toolName),
        type: 'URDF Package',
        category: toolPath.split('/')[0],
        path: `/tcp/${toolPath}`,
        urdfFile: urdfFile,
        meshFiles: meshFiles,
        fileCount: files.length,
        description: `Complete URDF tool package with ${files.length} files`,
        files: files
      }];
    } else if (meshFiles.length > 1) {
      // Multi-mesh tool
      const toolName = path.basename(toolPath);
      
      return [{
        id: toolPath.replace(/[\/\s]/g, '_'),
        name: formatToolName(toolName),
        type: 'Multi-Mesh',
        category: toolPath.split('/')[0],
        path: `/tcp/${toolPath}`,
        meshFiles: meshFiles,
        fileCount: meshFiles.length,
        description: `Multi-mesh tool with ${meshFiles.length} mesh files`,
        files: meshFiles
      }];
    } else if (meshFiles.length === 1) {
      // Single mesh tool
      const meshFile = meshFiles[0];
      const toolName = path.basename(meshFile, path.extname(meshFile));
      
      return [{
        id: toolPath.replace(/[\/\s]/g, '_'),
        name: formatToolName(toolName),
        type: 'Single Mesh',
        category: toolPath.split('/')[0],
        path: `/tcp/${toolPath}`,
        fileName: meshFile,
        fileCount: 1,
        description: `Single ${path.extname(meshFile).substring(1).toUpperCase()} mesh file`,
        files: [meshFile]
      }];
    }
    
    return [];
  } catch (error) {
    console.warn(`Error scanning single tool directory ${dirPath}:`, error.message);
    return [];
  }
}

// Helper function to analyze a single tool file (made more robust)
function analyzeSingleToolFile(filePath, fileName) {
  try {
    if (!isSupportedMeshFormat(fileName)) {
      return null;
    }
    
    const toolName = path.basename(fileName, path.extname(fileName));
    const stats = fs.statSync(filePath);
    
    return {
      id: toolName.replace(/[\/\s]/g, '_'),
      name: formatToolName(toolName),
      type: 'Single Mesh',
      category: 'root',
      path: `/tcp/${fileName}`,
      fileName: fileName,
      fileCount: 1,
      size: stats.size,
      description: `Single ${path.extname(fileName).substring(1).toUpperCase()} mesh file`,
      files: [fileName]
    };
  } catch (error) {
    console.warn(`Error analyzing tool file ${filePath}:`, error.message);
    return null;
  }
}

app.get('/api/trajectory/load/:manufacturer/:model/:name', (req, res) => {
  const { manufacturer, model, name } = req.params;
  const filePath = path.join(__dirname, '..', '..', 'public', 'trajectory', manufacturer, model, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Trajectory not found' });
  }
  const data = fs.readFileSync(filePath, 'utf8');
  const trajectory = JSON.parse(data);
  res.json({ success: true, trajectory });
}); 