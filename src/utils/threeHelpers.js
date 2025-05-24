import * as THREE from 'three';

/**
 * Adds standard grid and axes helpers to a Three.js scene.
 * @param {THREE.Scene} scene - The scene to add helpers to.
 * @param {Object} [options] - Optional settings.
 * @param {number} [options.gridSize=10] - Size of the grid.
 * @param {number} [options.gridDivisions=20] - Number of grid divisions.
 * @param {number} [options.gridColor1=0x888888] - Main grid color.
 * @param {number} [options.gridColor2=0xcccccc] - Secondary grid color.
 * @param {boolean} [options.addAxes=true] - Whether to add axes helper.
 * @param {number} [options.axesSize=1] - Size of the axes helper.
 * @returns {{grid: THREE.GridHelper, axes: THREE.AxesHelper|null}}
 */
export function createStandardGrids(scene, options = {}) {
    const {
        gridSize = 10,
        gridDivisions = 20,
        gridColor1 = 0x888888,
        gridColor2 = 0xcccccc,
        addAxes = true,
        axesSize = 1
    } = options;

    // Add grid helper
    const grid = new THREE.GridHelper(gridSize, gridDivisions, gridColor1, gridColor2);
    scene.add(grid);

    // Add axes helper (optional)
    let axes = null;
    if (addAxes) {
        axes = new THREE.AxesHelper(axesSize);
        scene.add(axes);
    }

    return { grid, axes };
} 