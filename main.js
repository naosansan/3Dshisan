import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- DOM Elements ---
const infoPanel = document.getElementById('info-panel');
const formsContainer = document.getElementById('asset-forms-container');
const addAssetBtn = document.getElementById('add-asset-btn');
const visualizeBtn = document.getElementById('visualize-btn');
const webglContainer = document.getElementById('webgl-container');
const tooltip = document.getElementById('tooltip');
const inputModeRadios = document.querySelectorAll('input[name="input-mode"]');
const displayOptionsContainer = document.getElementById('display-options-container');
const displayModeRadios = document.querySelectorAll('input[name="display-mode"]');

// --- Global State ---
let scene, camera, renderer, controls;
let starfield;
let assetSpheres = [];
let sunSphere = null; // For the sun object
let raycaster, mouse;
let intersectedObject = null;
let currentDisplayData = null;

const MAJOR_CATEGORIES = ['投資信託', 'ETF', '個別株', '暗号資産', '現金', 'その他'];
const PARTICLE_COLOR_PALETTE = [
    0xff6347, 0x4682b4, 0x32cd32, 0xdaa520, 0x6a5acd, 0xff69b4,
    0x00ced1, 0xf08080, 0x9370db, 0x7cfc00, 0x1e90ff, 0xffd700
];

// --- UI Logic ---

let assetFormCount = 0;

function addAssetForm() {
    assetFormCount++;
    const formId = `asset-form-${assetFormCount}`;
    const formHtml = `
        <div class="asset-form" id="${formId}">
            <div class="form-row">
                <div style="flex-grow: 1;">
                    <label>大カテゴリー</label>
                    <select name="major-category">
                        ${MAJOR_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <input type="text" name="custom-major-category" class="custom-major-category" style="display: none; margin-top: 5px;" placeholder="大カテゴリー名を入力">
                </div>
                <button class="remove-btn" data-form-id="${formId}">×</button>
            </div>
            <div>
                <label>小カテゴリー</label>
                <input type="text" name="minor-category" placeholder="S&P500, Bitcoinなど">
            </div>
            <div>
                <label>金額(円)</label>
                <input type="number" name="value" placeholder="100000">
            </div>
        </div>
    `;
    formsContainer.insertAdjacentHTML('beforeend', formHtml);

    const newForm = document.getElementById(formId);
    const majorCategorySelect = newForm.querySelector('select[name="major-category"]');
    const customMajorCategoryInput = newForm.querySelector('input[name="custom-major-category"]');
    const removeBtn = newForm.querySelector('.remove-btn');

    majorCategorySelect.addEventListener('change', () => {
        customMajorCategoryInput.style.display = majorCategorySelect.value === 'その他' ? 'block' : 'none';
    });

    removeBtn.addEventListener('click', () => {
        newForm.remove();
    });
}

addAssetBtn.addEventListener('click', addAssetForm);



displayModeRadios.forEach(radio => {
    radio.addEventListener('change', updateTooltipContent);
});

// --- Bulk Input Logic ---
const bulkMajorCategorySelect = document.getElementById('bulk-major-category');
const bulkCustomMajorCategoryInput = document.getElementById('bulk-custom-major-category');
const bulkPasteInput = document.getElementById('bulk-paste-input');
const bulkAddBtn = document.getElementById('bulk-add-btn');

// Populate dropdown
bulkMajorCategorySelect.innerHTML = MAJOR_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');

bulkMajorCategorySelect.addEventListener('change', () => {
    bulkCustomMajorCategoryInput.style.display = bulkMajorCategorySelect.value === 'その他' ? 'block' : 'none';
});

bulkAddBtn.addEventListener('click', () => {
    let major = bulkMajorCategorySelect.value;
    if (major === 'その他') {
        major = bulkCustomMajorCategoryInput.value.trim();
    }

    if (!major) {
        alert('一括入力用の大カテゴリーを選択または入力してください。');
        return;
    }

    const text = bulkPasteInput.value.trim();
    if (!text) {
        alert('貼り付けるデータを入力してください。');
        return;
    }

    const lines = text.split('\n');
    lines.forEach(line => {
        if (!line.trim()) return;

        const parts = line.split(/[\t,]/);
        if (parts.length < 2) return; // Skip invalid lines

        const [minor, value] = parts.map(p => p.trim());

        addAssetForm(); // Add a new empty form

        const newForm = document.getElementById(`asset-form-${assetFormCount}`);
        if (!newForm) return;

        const majorSelect = newForm.querySelector('select[name="major-category"]');
        const customMajorInput = newForm.querySelector('input[name="custom-major-category"]');
        const minorInput = newForm.querySelector('input[name="minor-category"]');
        const valueInput = newForm.querySelector('input[name="value"]');

        // Set values on the new form
        const isOther = !MAJOR_CATEGORIES.includes(major);
        if (isOther) {
            majorSelect.value = 'その他';
            customMajorInput.style.display = 'block';
            customMajorInput.value = major;
        } else {
            majorSelect.value = major;
        }

        minorInput.value = minor;
        valueInput.value = value;
    });

    // Clear the textarea after import
    bulkPasteInput.value = '';
});


// --- 3D Visualization Logic ---


function init() {
    // Scene
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 2000); // FOV changed to 25
    camera.position.z = 200; // Adjusted camera position for new FOV

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    webglContainer.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Starfield
    const starVertices = [];
    for (let i = 0; i < 15000; i++) {
        const x = THREE.MathUtils.randFloatSpread(2000);
        const y = THREE.MathUtils.randFloatSpread(2000);
        const z = THREE.MathUtils.randFloatSpread(2000);
        starVertices.push(x, y, z);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const starMaterial = new THREE.PointsMaterial({
        color: 0x888888,
        size: 0.7,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.8
    });
    starfield = new THREE.Points(starGeometry, starMaterial);
    scene.add(starfield);

    // Raycasting
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    window.addEventListener('pointermove', onPointerMove);

    // Responsiveness
    window.addEventListener('resize', onWindowResize);

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    starfield.rotation.y += 0.0001;
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

    tooltip.style.left = `${event.clientX + 15}px`;
    tooltip.style.top = `${event.clientY + 15}px`;
    
    updateRaycaster();
}

function updateRaycaster() {
    if (!currentDisplayData) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(assetSpheres);

    if (intersects.length > 0) {
        if (intersectedObject !== intersects[0].object) {
            intersectedObject = intersects[0].object;
            updateTooltipContent();
        }
        tooltip.style.display = 'block';
    } else {
        if (intersectedObject !== null) {
            tooltip.style.display = 'none';
            intersectedObject = null;
        }
    }
}

function updateTooltipContent() {
    if (!intersectedObject) return;

    const data = intersectedObject.userData;

    // Handle Sun tooltip
    if (data.isSun) {
        tooltip.innerHTML = `<h3>${data.majorCategory}</h3><ul><li>¥${data.value.toLocaleString()}</li></ul>`;
        return;
    }

    // Handle asset sphere tooltips
    const displayMode = document.querySelector('input[name="display-mode"]:checked').value;
    let content = `<h3>${data.majorCategory}</h3><ul>`;
    
    data.children.forEach(child => {
        const amountStr = `¥${child.value.toLocaleString()}`;
        const percentStr = `${child.percent.toFixed(1)}%`;
        let displayValue = '';
        if (displayMode === 'amount_percent') {
            displayValue = `${amountStr} (${percentStr})`;
        } else {
            displayValue = percentStr;
        }
        content += `<li><span style="color: #${new THREE.Color(child.color).getHexString()}">●</span> ${child.minor}: ${displayValue}</li>`;
    });

    content += '</ul>';
    tooltip.innerHTML = content;
}


visualizeBtn.addEventListener('click', () => {
    // 1. Clear previous visualization
    assetSpheres.forEach(sphere => scene.remove(sphere));
    assetSpheres = [];
    if (sunSphere) {
        scene.remove(sunSphere);
        sunSphere = null;
    }
    currentDisplayData = null;

        const inputMode = 'amount';

    // 2. Create Sun if in amount mode (independent of other assets)
    if (inputMode === 'amount') {
        createSun();
    }

    // 3. Get data from forms
    const assetForms = document.querySelectorAll('.asset-form');
    let assets = [];
    let totalValue = 0;

    assetForms.forEach(form => {
        let major = form.querySelector('select[name="major-category"]').value;
        if (major === 'その他') {
            major = form.querySelector('input[name="custom-major-category"]').value || 'その他';
        }
        const minor = form.querySelector('input[name="minor-category"]').value || '（不明）';
        const value = parseFloat(form.querySelector('input[name="value"]').value) || 0;
        
        if (value > 0) {
            assets.push({ major, minor, value });
            totalValue += value;
        }
    });

    // 4. If there are no assets, stop here. The sun (if in amount mode) is already created.
    if (assets.length === 0) {
        if (inputMode !== 'amount') {
             alert('有効な資産データがありません。');
        }
        return;
    }

    // 5. Process and visualize assets if they exist
    if (inputMode === 'percentage' && Math.abs(totalValue - 100) > 0.1) {
        alert(`割合の合計が100%になりません。（現在: ${totalValue.toFixed(1)}%）`);
        return;
    }

    assets.forEach(asset => {
        asset.percent = (inputMode === 'amount' && totalValue > 0) ? (asset.value / totalValue) * 100 : asset.value;
    });

    // 6. Group by major category
    const groupedAssets = {};
    let minorColorIndex = 0;
    const minorColorMap = {};

    assets.forEach(asset => {
        if (!groupedAssets[asset.major]) {
            groupedAssets[asset.major] = { totalPercent: 0, totalValue: 0, children: [] };
        }
        groupedAssets[asset.major].totalPercent += asset.percent;
        if (inputMode === 'amount') {
            groupedAssets[asset.major].totalValue += asset.value;
        }
        
        if (!minorColorMap[asset.minor]) {
            minorColorMap[asset.minor] = PARTICLE_COLOR_PALETTE[minorColorIndex % PARTICLE_COLOR_PALETTE.length];
            minorColorIndex++;
        }
        asset.color = minorColorMap[asset.minor];
        groupedAssets[asset.major].children.push(asset);
    });
    
    currentDisplayData = groupedAssets;
    if (inputMode === 'amount') {
        displayOptionsContainer.style.display = 'block';
    } else {
        displayOptionsContainer.style.display = 'none';
    }

    // 7. Create asset spheres
    createSpheres(groupedAssets);
});

function createSun() {
    const sunAmount = 100000000; // 1億円
    const sphereRadius = 20; // Base radius for the sun
    const totalParticles = 50000; // 1億円 / 1万円 * 5個 = 50,000個

    const positions = [];
    const colors = [];
    
    const sunColorsData = [
        { color: new THREE.Color(0xff0000), count: Math.floor(totalParticles / 3) }, // Red
        { color: new THREE.Color(0xffff00), count: Math.floor(totalParticles / 3) }, // Yellow
        { color: new THREE.Color(0xffa500), count: 0 } // Orange
    ];
    sunColorsData[2].count = totalParticles - sunColorsData[0].count - sunColorsData[1].count; // Orange gets the rest

    const particleColors = [];
    sunColorsData.forEach(data => {
        for (let i = 0; i < data.count; i++) {
            particleColors.push(data.color);
        }
    });

    // Shuffle colors
    for (let i = particleColors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [particleColors[i], particleColors[j]] = [particleColors[j], particleColors[i]];
    }

    // Use rejection sampling for a perfectly uniform spherical distribution
    for (let i = 0; i < totalParticles; i++) {
        let p;
        do {
            p = new THREE.Vector3(
                Math.random() * 2 - 1, // x from -1 to 1
                Math.random() * 2 - 1, // y from -1 to 1
                Math.random() * 2 - 1  // z from -1 to 1
            );
        } while (p.lengthSq() > 1); // Use lengthSq for efficiency, discard if outside unit sphere

        positions.push(p.x, p.y, p.z);

        const particleColor = particleColors[i];
        colors.push(particleColor.r, particleColor.g, particleColor.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    geometry.scale(sphereRadius, sphereRadius, sphereRadius);

    const material = new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        sizeAttenuation: true,
    });

    sunSphere = new THREE.Points(geometry, material);
    sunSphere.position.set(0, 0, 0); // Center of the scene

    // Add data for tooltip
    sunSphere.userData = {
        isSun: true,
        majorCategory: '太陽',
        value: 100000000
    };

    scene.add(sunSphere);
    assetSpheres.push(sunSphere); // Add to intersectable objects
}


function createSpheres(groupedAssets) {
    const majorCategories = Object.keys(groupedAssets);
    const angleStep = (2 * Math.PI) / majorCategories.length;
        const orbitRadius = 80; // Further increased orbit radius

    majorCategories.forEach((major, index) => {
        const groupData = groupedAssets[major];

            const inputMode = 'amount';
        let sphereRadius;
        let totalParticles;

        if (inputMode === 'amount') {
            const value = groupData.totalValue;
            // New: Radius is directly proportional to value
            sphereRadius = 20 * (value / 100000000);
            totalParticles = Math.round((value / 10000) * 10);
        } else { // percentage mode
            // Also make percentage mode linear for consistency
            sphereRadius = 10 * (groupData.totalPercent / 100);
            totalParticles = Math.max(200, Math.round(groupData.totalPercent * 500));
        }

        const positions = [];
        const colors = [];
        const color = new THREE.Color();
        
        const particleColors = [];
        let assignedParticles = 0;

        const totalPercentForGroup = groupData.totalPercent > 0 ? groupData.totalPercent : 1;

        groupData.children.forEach((child, childIndex) => {
            const proportion = child.percent / totalPercentForGroup;
            let numParticlesForChild;

            if (childIndex === groupData.children.length - 1) {
                numParticlesForChild = totalParticles - assignedParticles;
            } else {
                numParticlesForChild = Math.round(proportion * totalParticles);
            }
            
            assignedParticles += numParticlesForChild;

            color.set(child.color);
            for (let i = 0; i < numParticlesForChild; i++) {
                particleColors.push(color.clone());
            }
        });

        // Shuffle colors
        for (let i = particleColors.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [particleColors[i], particleColors[j]] = [particleColors[j], particleColors[i]];
        }

        // Use rejection sampling for a perfectly uniform spherical distribution
        for (let i = 0; i < totalParticles; i++) {
            let p;
            do {
                p = new THREE.Vector3(
                    Math.random() * 2 - 1, // x from -1 to 1
                    Math.random() * 2 - 1, // y from -1 to 1
                    Math.random() * 2 - 1  // z from -1 to 1
                );
            } while (p.lengthSq() > 1); // Use lengthSq for efficiency, discard if outside unit sphere

            positions.push(p.x, p.y, p.z);

            const particleColor = particleColors[i] || new THREE.Color(0xffffff);
            colors.push(particleColor.r, particleColor.g, particleColor.b);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        geometry.scale(sphereRadius, sphereRadius, sphereRadius);

        const material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            sizeAttenuation: true,
        });

        const sphere = new THREE.Points(geometry, material);
        
        const x = orbitRadius * Math.cos(index * angleStep);
        const z = orbitRadius * Math.sin(index * angleStep);
        sphere.position.set(x, 0, z);

        sphere.userData = {
            majorCategory: major,
            children: groupData.children,
            totalPercent: groupData.totalPercent
        };

        scene.add(sphere);
        assetSpheres.push(sphere);
    });
}


// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    addAssetForm();
    init();
});