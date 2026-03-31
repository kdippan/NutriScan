const APP_STATE = {
    theme: localStorage.getItem('theme') || 'light',
    scanHistory: JSON.parse(localStorage.getItem('scanHistory')) || [],
    currentProduct: null,
    isScanning: false
};

const elements = {
    themeToggle: document.getElementById('themeToggle'),
    startCameraBtn: document.getElementById('startCameraBtn'),
    stopCameraBtn: document.getElementById('stopCameraBtn'),
    barcodeInput: document.getElementById('barcodeInput'),
    searchBtn: document.getElementById('searchBtn'),
    cameraView: document.getElementById('cameraView'),
    loadingState: document.getElementById('loadingState'),
    productContent: document.getElementById('productContent'),
    productSection: document.getElementById('productSection'),
    historyList: document.getElementById('historyList'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    quickScanFab: document.getElementById('quickScanFab'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage')
};

document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    loadScanHistory();
    attachEventListeners();
    setupExampleBarcodes();
});

function initializeTheme() {
    if (APP_STATE.theme === 'dark') {
        document.body.classList.add('dark-mode');
        elements.themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
}

elements.themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    APP_STATE.theme = isDark ? 'dark' : 'light';
    localStorage.setItem('theme', APP_STATE.theme);
    elements.themeToggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
});

function attachEventListeners() {
    elements.startCameraBtn.addEventListener('click', startBarcodeScanner);
    elements.stopCameraBtn.addEventListener('click', stopBarcodeScanner);
    elements.searchBtn.addEventListener('click', handleManualSearch);
    elements.barcodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleManualSearch();
    });
    elements.clearHistoryBtn.addEventListener('click', clearScanHistory);
    elements.quickScanFab.addEventListener('click', startBarcodeScanner);
}

function setupExampleBarcodes() {
    const chips = document.querySelectorAll('.chip[data-barcode]');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const barcode = chip.getAttribute('data-barcode');
            elements.barcodeInput.value = barcode;
            fetchProductData(barcode);
        });
    });
}

function startBarcodeScanner() {
    elements.cameraView.classList.add('active');
    APP_STATE.isScanning = true;
    
    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector('#barcode-scanner'),
            constraints: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "environment"
            }
        },
        locator: {
            patchSize: "medium",
            halfSample: true
        },
        numOfWorkers: navigator.hardwareConcurrency || 2,
        decoder: {
            readers: ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader", "code_128_reader", "code_39_reader"]
        },
        locate: true
    }, (err) => {
        if (err) {
            showToast('Camera access denied or not available');
            stopBarcodeScanner();
            return;
        }
        Quagga.start();
    });

    Quagga.onDetected((result) => {
        if (APP_STATE.isScanning) {
            const barcode = result.codeResult.code;
            vibrateDevice();
            stopBarcodeScanner();
            elements.barcodeInput.value = barcode;
            fetchProductData(barcode);
        }
    });
}

function stopBarcodeScanner() {
    APP_STATE.isScanning = false;
    Quagga.stop();
    elements.cameraView.classList.remove('active');
}

function handleManualSearch() {
    const barcode = elements.barcodeInput.value.trim();
    if (!barcode) {
        showToast('Please enter a barcode number');
        return;
    }
    if (!/^\d+$/.test(barcode)) {
        showToast('Barcode must contain only numbers');
        return;
    }
    fetchProductData(barcode);
}

async function fetchProductData(barcode) {
    showLoading();
    const cached = getCachedProduct(barcode);
    if (cached) {
        displayProduct(cached);
        return;
    }

    try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`, {
            headers: { 'User-Agent': 'NutriScan - 2.0 - dippanbhusal@github' }
        });
        const data = await response.json();
        
        if (data.status === 1 && data.product) {
            const product = data.product;
            APP_STATE.currentProduct = product;
            cacheProduct(barcode, product);
            addToScanHistory(barcode, product);
            displayProduct(product);
        } else {
            showToast('Product not found. Please try another barcode.');
            hideLoading();
        }
    } catch (error) {
        showToast('Failed to fetch product data. Check your connection.');
        hideLoading();
    }
}

function cleanTag(tag) {
    if (!tag) return '';
    return tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
}

function getNutrientLevelHtml(levels) {
    if (!levels) return '';
    const mapLevel = (val) => {
        if (val === 'low') return '<span style="color: #10b981; font-weight: 600;">Low</span>';
        if (val === 'moderate') return '<span style="color: #f59e0b; font-weight: 600;">Moderate</span>';
        if (val === 'high') return '<span style="color: #ef4444; font-weight: 600;">High</span>';
        return 'Unknown';
    };
    return `
        <div class="nutrient-levels" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; font-size: 14px; background: var(--bg-color); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <div><strong>Fat:</strong> ${mapLevel(levels.fat)}</div>
            <div><strong>Saturated Fat:</strong> ${mapLevel(levels['saturated-fat'])}</div>
            <div><strong>Sugars:</strong> ${mapLevel(levels.sugars)}</div>
            <div><strong>Salt:</strong> ${mapLevel(levels.salt)}</div>
        </div>
    `;
}

function displayProduct(product) {
    hideLoading();
    const nutriScore = (product.nutriscore_grade || 'unknown').toUpperCase();
    const nutriScoreInfo = getNutriScoreInfo(nutriScore);
    const novaGroup = product.nova_group || 'Unknown';
    const ecoScore = (product.ecoscore_grade || 'unknown').toUpperCase();
    
    let html = `
    <div class="product-card">
        <div class="product-header">
            ${product.image_url ? `
            <div class="product-image-container">
                <img src="${product.image_url}" alt="${product.product_name}" class="product-image">
            </div>` : ''}
            
            <h2 class="product-name">${product.product_name || 'Unknown Product'}</h2>
            
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">
                ${product.brands ? `<div class="product-brand"><i class="fas fa-tag"></i> ${product.brands}</div>` : ''}
                ${product.quantity ? `<div class="product-brand"><i class="fas fa-box"></i> ${product.quantity}</div>` : ''}
            </div>
            
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                ${nutriScore !== 'UNKNOWN' ? `<div class="nutri-score-badge nutri-score-${nutriScore.toLowerCase()}" style="position: relative; top: 0; right: 0; width: 60px; height: 60px; font-size: 28px;">${nutriScore}</div>` : ''}
                ${novaGroup !== 'Unknown' ? `<div class="nutri-score-badge" style="position: relative; top: 0; right: 0; width: 60px; height: 60px; font-size: 18px; background: #3b82f6;">NOVA ${novaGroup}</div>` : ''}
                ${ecoScore !== 'UNKNOWN' && ecoScore !== 'NOT-APPLICABLE' ? `<div class="nutri-score-badge" style="position: relative; top: 0; right: 0; width: 60px; height: 60px; font-size: 18px; background: #10b981;">ECO ${ecoScore}</div>` : ''}
            </div>
        </div>
        
        <div class="product-body">
            ${nutriScore !== 'UNKNOWN' ? `
            <div class="health-indicator">
                <i class="material-icons" style="color: ${nutriScoreInfo.color}">${nutriScoreInfo.icon}</i>
                <div class="health-indicator-content">
                    <h3>Nutri-Score: ${nutriScoreInfo.label}</h3>
                    <p>${nutriScoreInfo.description}</p>
                </div>
            </div>` : ''}

            <div class="quick-facts">
                ${product.nutriments?.['energy-kcal_100g'] ? `
                <div class="fact-card">
                    <i class="fas fa-fire"></i>
                    <div class="fact-value">${Math.round(product.nutriments['energy-kcal_100g'])}</div>
                    <div class="fact-label">Kcal / 100g</div>
                </div>` : ''}
                
                ${product.nutriments?.fat_100g ? `
                <div class="fact-card">
                    <i class="fas fa-droplet"></i>
                    <div class="fact-value">${product.nutriments.fat_100g}g</div>
                    <div class="fact-label">Fat / 100g</div>
                </div>` : ''}
                
                ${product.nutriments?.carbohydrates_100g ? `
                <div class="fact-card">
                    <i class="fas fa-wheat-awn"></i>
                    <div class="fact-value">${product.nutriments.carbohydrates_100g}g</div>
                    <div class="fact-label">Carbs / 100g</div>
                </div>` : ''}
                
                ${product.nutriments?.proteins_100g ? `
                <div class="fact-card">
                    <i class="fas fa-dumbbell"></i>
                    <div class="fact-value">${product.nutriments.proteins_100g}g</div>
                    <div class="fact-label">Protein / 100g</div>
                </div>` : ''}
            </div>

            <h3 class="section-title"><i class="fas fa-chart-pie"></i> Detailed Nutrition Facts</h3>
            <div class="nutrition-grid">
                ${generateNutritionCards(product.nutriments)}
            </div>
            ${getNutrientLevelHtml(product.nutrient_levels)}

            ${product.ingredients_text ? `
            <h3 class="section-title"><i class="fas fa-list"></i> Ingredients</h3>
            <div class="ingredients-section">
                <div class="ingredients-text">${product.ingredients_text}</div>
            </div>` : ''}

            ${product.allergens_tags && product.allergens_tags.length > 0 ? `
            <h3 class="section-title"><i class="fas fa-triangle-exclamation"></i> Allergens & Traces</h3>
            <div class="allergen-tags">
                ${product.allergens_tags.map(allergen => `
                <div class="allergen-tag">
                    <i class="fas fa-exclamation-circle"></i>
                    ${cleanTag(allergen)}
                </div>`).join('')}
                ${product.traces_tags && product.traces_tags.length > 0 ? product.traces_tags.map(trace => `
                <div class="allergen-tag" style="background: var(--warning-color);">
                    <i class="fas fa-exclamation-triangle"></i> Trace: ${cleanTag(trace)}
                </div>`).join('') : ''}
            </div>` : ''}

            ${product.additives_tags && product.additives_tags.length > 0 ? `
            <div class="additives-warning">
                <i class="fas fa-flask"></i>
                <div>
                    <strong>Contains ${product.additives_tags.length} additives</strong>
                    <p style="font-size: 14px; margin-top: 4px;">${product.additives_tags.map(a => cleanTag(a)).join(', ')}</p>
                </div>
            </div>` : ''}

            <h3 class="section-title"><i class="fas fa-layer-group"></i> Product Meta</h3>
            <div class="category-chips">
                ${product.categories_tags ? product.categories_tags.map(cat => `<span class="category-chip">${cleanTag(cat)}</span>`).join('') : ''}
                ${product.labels_tags ? product.labels_tags.map(label => `<span class="category-chip" style="background: var(--primary-color); color: #fff;">${cleanTag(label)}</span>`).join('') : ''}
            </div>

            <div style="margin-top: 16px; font-size: 14px; color: var(--text-secondary); line-height: 1.8;">
                ${product.packaging ? `<p><strong><i class="fas fa-box-open"></i> Packaging:</strong> ${product.packaging}</p>` : ''}
                ${product.manufacturing_places ? `<p><strong><i class="fas fa-industry"></i> Manufacturing:</strong> ${product.manufacturing_places}</p>` : ''}
                ${product.countries ? `<p><strong><i class="fas fa-globe"></i> Countries:</strong> ${product.countries}</p>` : ''}
                ${product.stores ? `<p><strong><i class="fas fa-store"></i> Stores:</strong> ${product.stores}</p>` : ''}
            </div>

            <div class="action-buttons">
                <button class="btn-action" onclick="shareProduct()">
                    <i class="fas fa-share-nodes"></i> Share
                </button>
                <button class="btn-action" onclick="saveProduct()">
                    <i class="fas fa-bookmark"></i> Save
                </button>
                <button class="btn-action" onclick="window.scrollTo({top: 0, behavior: 'smooth'})">
                    <i class="fas fa-arrow-up"></i> New Scan
                </button>
            </div>
        </div>
    </div>`;

    elements.productContent.innerHTML = html;
    elements.productContent.classList.add('active');

    setTimeout(() => {
        elements.productSection.scrollIntoView({behavior: 'smooth', block: 'start' });
    }, 300);
}

function generateNutritionCards(nutriments) {
    if (!nutriments) return '';
    const nutrients = [
        {key: 'sugars_100g', label: 'Sugars', unit: 'g', max: 50 },
        {key: 'salt_100g', label: 'Salt', unit: 'g', max: 6 },
        {key: 'saturated-fat_100g', label: 'Saturated Fat', unit: 'g', max: 20 },
        {key: 'fiber_100g', label: 'Fiber', unit: 'g', max: 25 },
        {key: 'sodium_100g', label: 'Sodium', unit: 'mg', max: 2300 },
        {key: 'calcium_100g', label: 'Calcium', unit: 'mg', max: 1000 },
        {key: 'iron_100g', label: 'Iron', unit: 'mg', max: 18 }
    ];

    return nutrients.map(nutrient => {
        const value = nutriments[nutrient.key];
        if (value === undefined || value === null) return '';
        const percentage = Math.min((value / nutrient.max) * 100, 100);
        return `
        <div class="nutrient-card">
            <div class="nutrient-header">
                <span class="nutrient-name">${nutrient.label}</span>
                <span class="nutrient-value">${Number(value).toFixed(2)}${nutrient.unit}</span>
            </div>
            <div class="nutrient-bar">
                <div class="nutrient-fill" style="width: ${percentage}%"></div>
            </div>
        </div>`;
    }).join('');
}

function getNutriScoreInfo(grade) {
    const scores = {
        'A': { label: 'Excellent', color: '#10b981', icon: 'emoji_events', description: 'Excellent nutritional quality - Great choice!' },
        'B': { label: 'Good', color: '#84cc16', icon: 'thumb_up', description: 'Good nutritional quality - Solid option' },
        'C': { label: 'Average', color: '#f59e0b', icon: 'warning_amber', description: 'Average nutritional quality - Consume moderately' },
        'D': { label: 'Poor', color: '#f97316', icon: 'error_outline', description: 'Poor nutritional quality - Limit consumption' },
        'E': { label: 'Very Poor', color: '#ef4444', icon: 'cancel', description: 'Very poor nutritional quality - Avoid if possible' }
    };
    return scores[grade] || { label: 'Unknown', color: '#64748b', icon: 'help', description: 'Nutritional information not available' };
}

function addToScanHistory(barcode, product) {
    const historyItem = {
        barcode: barcode,
        name: product.product_name || 'Unknown Product',
        nutriscore: product.nutriscore_grade || 'unknown',
        image: product.image_url || '',
        timestamp: new Date().toISOString()
    };
    
    APP_STATE.scanHistory = [historyItem, ...APP_STATE.scanHistory.filter(item => item.barcode !== barcode)];
    APP_STATE.scanHistory = APP_STATE.scanHistory.slice(0, 100);
    localStorage.setItem('scanHistory', JSON.stringify(APP_STATE.scanHistory));
    loadScanHistory();
}

function loadScanHistory() {
    if (APP_STATE.scanHistory.length === 0) {
        elements.historyList.innerHTML = `
        <div class="empty-state">
            <lord-icon src="https://cdn.lordicon.com/nocovwne.json" trigger="loop" colors="primary:#64748b" style="width:80px;height:80px"></lord-icon>
            <p>No scanned products yet</p>
            <small>Start scanning to see your history</small>
        </div>`;
        return;
    }

    elements.historyList.innerHTML = APP_STATE.scanHistory.map(item => {
        const nutriScoreInfo = getNutriScoreInfo(item.nutriscore.toUpperCase());
        const date = new Date(item.timestamp);
        const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        
        return `
        <div class="history-item" onclick="fetchProductData('${item.barcode}')">
            ${item.image ? `<img src="${item.image}" alt="${item.name}" class="history-image">` : `<div class="history-image" style="background: var(--primary-gradient)"></div>`}
            <div class="history-info">
                <div class="history-name">${item.name}</div>
                <div class="history-date">${formattedDate}</div>
            </div>
            <div class="history-score" style="background: ${nutriScoreInfo.color}">
                ${item.nutriscore.toUpperCase()}
            </div>
        </div>`;
    }).join('');
}

function clearScanHistory() {
    if (confirm('Are you sure you want to clear all scan history?')) {
        APP_STATE.scanHistory = [];
        localStorage.removeItem('scanHistory');
        loadScanHistory();
        showToast('Scan history cleared');
    }
}

function cacheProduct(barcode, product) {
    const cache = JSON.parse(localStorage.getItem('productCache') || '{}');
    cache[barcode] = { product: product, timestamp: Date.now() };
    const keys = Object.keys(cache);
    if (keys.length > 50) {
        delete cache[keys[0]];
    }
    localStorage.setItem('productCache', JSON.stringify(cache));
}

function getCachedProduct(barcode) {
    const cache = JSON.parse(localStorage.getItem('productCache') || '{}');
    const cached = cache[barcode];
    if (cached && (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000)) {
        return cached.product;
    }
    return null;
}

function shareProduct() {
    const product = APP_STATE.currentProduct;
    if (!product) return;
    const shareData = {
        title: product.product_name,
        text: `Check out this product: ${product.product_name}`,
        url: window.location.href
    };

    if (navigator.share) {
        navigator.share(shareData).catch(err => console.log('Share failed:', err));
    } else {
        const url = window.location.href;
        navigator.clipboard.writeText(url);
        showToast('Link copied to clipboard!');
    }
}

function saveProduct() {
    showToast('Product saved to favorites!');
}

function showLoading() {
    elements.loadingState.classList.add('active');
    elements.productContent.classList.remove('active');
}

function hideLoading() {
    elements.loadingState.classList.remove('active');
}

function showToast(message) {
    elements.toastMessage.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => { elements.toast.classList.remove('show'); }, 3000);
}

function vibrateDevice() {
    if ('vibrate' in navigator) {
        navigator.vibrate(200);
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && APP_STATE.isScanning) {
        stopBarcodeScanner();
    }
});

let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
    const now = new Date().getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);
