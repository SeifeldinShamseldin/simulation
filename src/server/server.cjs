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
  console.log('Body:', req.body);
  
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
      if (req.files) {
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

// Configure multer for TCP uploads
const tcpStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tcpDir = path.join(__dirname, '..', '..', 'public', 'tcp');
    
    // Create TCP directory if it doesn't exist
    try {
      fs.mkdirSync(tcpDir, { recursive: true });
      cb(null, tcpDir);
    } catch (error) {
      console.error('Error creating TCP directory:', error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    // Create unique filename with timestamp
    const name = req.body.name || 'tcp_tool';
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${safeName}_${timestamp}${ext}`);
  }
});

const tcpUpload = multer({
  storage: tcpStorage,
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.stl') {
      cb(null, true);
    } else {
      cb(new Error('Only STL files are allowed for TCP tools'), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Add TCP endpoint
app.post('/api/tcp/add', (req, res) => {
  console.log('=== ADD TCP REQUEST ===');
  
  tcpUpload.single('stlFile')(req, res, function (err) {
    if (err) {
      console.error('TCP upload error:', err);
      return res.status(400).json({ 
        success: false, 
        message: `Upload error: ${err.message}` 
      });
    }
    
    try {
      const { name, description, category, color, dimensions } = req.body;
      
      if (!name || !req.file) {
        return res.status(400).json({ 
          success: false, 
          message: 'TCP name and STL file are required' 
        });
      }
      
      const tcpData = {
        id: name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() + '_' + Date.now(),
        name: name.trim(),
        description: description ? description.trim() : '',
        category: category || 'custom',
        color: color || '#ff0000',
        stlFile: req.file.filename,
        stlPath: `/tcp/${req.file.filename}`,
        dimensions: dimensions ? JSON.parse(dimensions) : null,
        createdAt: new Date().toISOString()
      };
      
      // Save TCP metadata
      saveTCPMetadata(tcpData);
      
      console.log(`Successfully added TCP tool: ${tcpData.name}`);
      console.log(`STL file: ${tcpData.stlFile}`);
      
      res.json({
        success: true,
        message: 'TCP tool added successfully',
        tcp: tcpData
      });
      
    } catch (error) {
      console.error('Error processing TCP upload:', error);
      res.status(500).json({ 
        success: false, 
        message: `Server error: ${error.message}` 
      });
    }
  });
});

// Get all TCP tools
app.get('/api/tcp/list', (req, res) => {
  try {
    const tcpData = loadTCPMetadata();
    res.json({
      success: true,
      tcps: tcpData
    });
  } catch (error) {
    console.error('Error listing TCP tools:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error listing TCP tools' 
    });
  }
});

// Delete TCP tool
app.delete('/api/tcp/:id', (req, res) => {
  try {
    const { id } = req.params;
    const tcpData = loadTCPMetadata();
    const tcpToDelete = tcpData.find(tcp => tcp.id === id);
    
    if (!tcpToDelete) {
      return res.status(404).json({ 
        success: false, 
        message: 'TCP tool not found' 
      });
    }
    
    // Remove STL file
    const stlPath = path.join(__dirname, '..', '..', 'public', 'tcp', tcpToDelete.stlFile);
    if (fs.existsSync(stlPath)) {
      fs.unlinkSync(stlPath);
    }
    
    // Remove from metadata
    const updatedTcpData = tcpData.filter(tcp => tcp.id !== id);
    saveTCPMetadata(updatedTcpData);
    
    res.json({
      success: true,
      message: 'TCP tool deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting TCP tool:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting TCP tool' 
    });
  }
});

// Helper functions for TCP metadata
function loadTCPMetadata() {
  const metadataPath = path.join(__dirname, '..', '..', 'public', 'tcp', 'tcp_index.json');
  
  try {
    if (fs.existsSync(metadataPath)) {
      const data = fs.readFileSync(metadataPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('Error loading TCP metadata:', error);
  }
  
  return [];
}

function saveTCPMetadata(tcpArray) {
  const metadataPath = path.join(__dirname, '..', '..', 'public', 'tcp', 'tcp_index.json');
  const tcpDir = path.dirname(metadataPath);
  
  // Ensure directory exists
  if (!fs.existsSync(tcpDir)) {
    fs.mkdirSync(tcpDir, { recursive: true });
  }
  
  let currentData = [];
  if (Array.isArray(tcpArray)) {
    currentData = tcpArray;
  } else {
    // Single TCP object, add to existing data
    currentData = loadTCPMetadata();
    currentData.push(tcpArray);
  }
  
  fs.writeFileSync(metadataPath, JSON.stringify(currentData, null, 2));
}

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