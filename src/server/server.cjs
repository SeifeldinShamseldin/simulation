const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '..', '..', 'public')));

// Parse JSON bodies
app.use(express.json());

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
        
        // Get all robot directories in this category
        const robotDirs = fs.readdirSync(categoryDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(robotDirent => {
            const robotId = robotDirent.name;
            const robotDir = path.join(categoryDir, robotId);
            
            // Check if this directory contains a URDF file
            const files = fs.readdirSync(robotDir);
            const urdfFile = files.find(file => file.endsWith('.urdf'));
            
            if (urdfFile) {
              // Use the actual category name in the path
              const categoryPath = categoryName === 'universal robot' ? 'Universal Robots' : categoryName.toUpperCase();
              return {
                id: robotId,
                name: robotId.charAt(0).toUpperCase() + robotId.slice(1),
                urdfPath: `/robots/${encodeURIComponent(categoryPath)}/${encodeURIComponent(robotId)}/${encodeURIComponent(urdfFile)}`,
                packagePath: `/robots/${encodeURIComponent(categoryPath)}/${encodeURIComponent(robotId)}`
              };
            }
            return null;
          })
          .filter(Boolean); // Remove nulls
          
        // Map category names to their display names
        const categoryDisplayName = categoryName === 'universal robot' ? 'Universal Robots' : categoryName.toUpperCase();
        return {
          id: categoryName.toLowerCase().replace(/\s+/g, '_'),
          name: categoryDisplayName,
          robots: robotDirs
        };
      });
    
    res.json(categories);
  } catch (error) {
    console.error('Error listing robots:', error);
    res.status(500).json({ error: 'Error listing robots' });
  }
});

// Create index.json for client-side discovery
app.get('/generate-robot-index', (req, res) => {
  try {
    const robotsDir = path.join(__dirname, '..', '..', 'public', 'robots');
    
    // Check if directory exists
    if (!fs.existsSync(robotsDir)) {
      console.log('Robots directory does not exist');
      return res.status(404).json({ error: 'Robots directory not found' });
    }
    
    // Get all directories (categories) in the robots directory
    const categories = fs.readdirSync(robotsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const categoryName = dirent.name;
        const categoryDir = path.join(robotsDir, categoryName);
        
        // Get all robot directories in this category
        const robotDirs = fs.readdirSync(categoryDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(robotDirent => {
            const robotId = robotDirent.name;
            const robotDir = path.join(categoryDir, robotId);
            
            // Check if this directory contains a URDF file
            const files = fs.readdirSync(robotDir);
            const urdfFile = files.find(file => file.endsWith('.urdf'));
            
            if (urdfFile) {
              // Use the actual category name in the path
              const categoryPath = categoryName === 'universal robot' ? 'Universal Robots' : categoryName.toUpperCase();
              return {
                id: robotId,
                name: robotId.charAt(0).toUpperCase() + robotId.slice(1),
                urdfPath: `/robots/${encodeURIComponent(categoryPath)}/${encodeURIComponent(robotId)}/${encodeURIComponent(urdfFile)}`,
                packagePath: `/robots/${encodeURIComponent(categoryPath)}/${encodeURIComponent(robotId)}`
              };
            }
            return null;
          })
          .filter(Boolean); // Remove nulls
          
        // Map category names to their display names
        const categoryDisplayName = categoryName === 'universal robot' ? 'Universal Robots' : categoryName.toUpperCase();
        return {
          id: categoryName.toLowerCase().replace(/\s+/g, '_'),
          name: categoryDisplayName,
          robots: robotDirs
        };
      });
    
    // Write to index.json in the robots directory
    const indexPath = path.join(robotsDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({ categories }, null, 2));
    
    res.json({ success: true, message: 'Robot index generated successfully' });
  } catch (error) {
    console.error('Error generating robot index:', error);
    res.status(500).json({ error: 'Error generating robot index' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving static files from: ${path.join(__dirname, '..', '..', 'public')}`);
});

module.exports = app; 