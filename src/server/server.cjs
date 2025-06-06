const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const app = express();

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
    
    // Accept URDF and mesh files
    const allowedExtensions = ['.urdf', '.stl', '.dae'];
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
    { name: 'meshes', maxCount: 50 }
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
                
                if (urdfFile && hasMeshes) {
                  return {
                    id: robotId.toLowerCase().replace(/\s+/g, '_'),
                    name: robotId.charAt(0).toUpperCase() + robotId.slice(1),
                    urdfPath: `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}/${encodeURIComponent(urdfFile)}`,
                    packagePath: `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}`,
                    meshFiles: files.filter(file => file.endsWith('.stl') || file.endsWith('.dae'))
                  };
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
            robots: robotDirs
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

// Get available robots with category structure
app.get('/robots/list', (req, res) => {
  try {
    const robotsDir = path.join(__dirname, '..', '..', 'public', 'robots');
    console.log('Looking for robots in:', robotsDir);
    
    // Check if directory exists
    if (!fs.existsSync(robotsDir)) {
      console.log('Robots directory does not exist');
      return res.json([]);
    }
    
    // Get all directories (categories) in the robots directory
    const categories = fs.readdirSync(robotsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const categoryName = dirent.name;
        const categoryDir = path.join(robotsDir, categoryName);
        
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
                
                if (urdfFile && hasMeshes) {
                  return {
                    id: robotId.toLowerCase().replace(/\s+/g, '_'),
                    name: robotId.charAt(0).toUpperCase() + robotId.slice(1),
                    urdfPath: `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}/${encodeURIComponent(urdfFile)}`,
                    packagePath: `/robots/${encodeURIComponent(categoryName)}/${encodeURIComponent(robotId)}`,
                    meshFiles: files.filter(file => file.endsWith('.stl') || file.endsWith('.dae'))
                  };
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
            robots: robotDirs
          };
        } catch (error) {
          console.warn(`Error reading category directory ${categoryDir}:`, error.message);
          return null;
        }
      })
      .filter(Boolean)
      .filter(category => category.robots.length > 0);
    
    res.json(categories);
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

// Get available TCP tools by scanning the tcp directory
app.get('/api/tcp/scan', (req, res) => {
  try {
    const tcpDir = path.join(__dirname, '..', '..', 'public', 'tcp');
    
    if (!fs.existsSync(tcpDir)) {
      return res.json({ success: true, tools: [] });
    }
    
    const tools = [];
    
    // Scan for tool directories and files
    const items = fs.readdirSync(tcpDir, { withFileTypes: true });
    
    items.forEach(item => {
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
    });
    
    res.json({ success: true, tools });
    
  } catch (error) {
    console.error('Error scanning TCP directory:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error scanning TCP directory' 
    });
  }
});

// Helper function to scan a tool directory
function scanToolDirectory(dirPath, dirName) {
  const tools = [];
  
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    // Check for subdirectories (like robotiq/robotiqarg2f85model)
    const subDirs = items.filter(item => item.isDirectory());
    
    if (subDirs.length > 0) {
      // Scan subdirectories
      subDirs.forEach(subDir => {
        const subDirPath = path.join(dirPath, subDir.name);
        const subDirTools = scanSingleToolDirectory(subDirPath, `${dirName}/${subDir.name}`);
        tools.push(...subDirTools);
      });
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

// Helper function to scan a single tool directory
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

// Helper function to analyze a single tool file
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

// Helper function to check if file format is supported
function isSupportedMeshFormat(fileName) {
  const supportedFormats = ['.stl', '.dae', '.obj', '.fbx', '.gltf', '.glb', '.ply'];
  const ext = path.extname(fileName).toLowerCase();
  return supportedFormats.includes(ext);
}

// Helper function to format tool name for display
function formatToolName(name) {
  return name
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

// Add TCP tool endpoint with file upload
const tcpStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const category = req.body.category || 'custom';
    const safeCategory = category.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
    
    const uploadPath = path.join(__dirname, '..', '..', 'public', 'tcp', safeCategory);
    
    console.log('Creating TCP upload path:', uploadPath);
    
    try {
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      console.error('Error creating directory:', error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    const toolName = req.body.toolName || 'tool';
    const safeName = toolName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${safeName}_${timestamp}${ext}`;
    
    console.log('Saving TCP file:', filename);
    cb(null, filename);
  }
});

const tcpUpload = multer({
  storage: tcpStorage,
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.urdf', '.stl', '.dae', '.obj', '.fbx', '.gltf', '.glb', '.ply'];
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Allowed types: ${allowedExtensions.join(', ')}`), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 20 // Max 20 files for URDF packages
  }
});

// Add TCP tool endpoint
app.post('/api/tcp/add', (req, res) => {
  console.log('=== ADD TCP TOOL REQUEST ===');
  
  tcpUpload.array('toolFiles', 20)(req, res, function (err) {
    if (err) {
      console.error('TCP upload error:', err);
      return res.status(400).json({ 
        success: false, 
        message: `Upload error: ${err.message}` 
      });
    }
    
    try {
      const { category, toolName, description } = req.body;
      
      console.log('Processing TCP tool:', { category, toolName });
      
      if (!category || !toolName) {
        return res.status(400).json({ 
          success: false, 
          message: 'Category and tool name are required' 
        });
      }
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'At least one tool file is required' 
        });
      }
      
      const uploadedFiles = req.files;
      const safeCategory = category.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      
      // Determine tool type
      const hasUrdf = uploadedFiles.some(file => file.originalname.toLowerCase().endsWith('.urdf'));
      const meshFiles = uploadedFiles.filter(file => isSupportedMeshFormat(file.originalname));
      
      let toolType = 'Single Mesh';
      if (hasUrdf) {
        toolType = 'URDF Package';
      } else if (meshFiles.length > 1) {
        toolType = 'Multi-Mesh';
      }
      
      console.log(`Successfully added TCP tool: ${toolName} (${toolType})`);
      console.log(`Files: ${uploadedFiles.map(f => f.originalname).join(', ')}`);
      
      res.json({
        success: true,
        message: 'TCP tool added successfully',
        tool: {
          id: `${safeCategory}_${toolName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
          name: toolName,
          type: toolType,
          category: safeCategory,
          fileCount: uploadedFiles.length,
          files: uploadedFiles.map(f => f.originalname),
          description: description || ''
        }
      });
      
    } catch (error) {
      console.error('Error processing TCP tool upload:', error);
      // Clean up any uploaded files if there was an error
      if (req.files) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      res.status(500).json({ 
        success: false, 
        message: `Server error: ${error.message}` 
      });
    }
  });
});

// Delete TCP tool
app.delete('/api/tcp/delete', express.json(), (req, res) => {
  try {
    const { path: toolPath } = req.body;
    
    if (!toolPath || !toolPath.startsWith('/tcp/')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid path' 
      });
    }
    
    const fullPath = path.join(__dirname, '..', '..', 'public', toolPath);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'Tool not found' 
      });
    }
    
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      // Remove directory and all contents
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      // Remove single file
      fs.unlinkSync(fullPath);
    }
    
    console.log(`Deleted TCP tool: ${toolPath}`);
    
    res.json({ 
      success: true, 
      message: 'TCP tool deleted successfully' 
    });
    
  } catch (error) {
    console.error('Error deleting TCP tool:', error);
    res.status(500).json({ 
      success: false, 
      message: `Error deleting tool: ${error.message}` 
    });
  }
}); 