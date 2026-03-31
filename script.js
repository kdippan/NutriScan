const APP_STATE = {
    theme: localStorage.getItem('theme') || 'light',
    isScanning: false
};

const elements = {
    themeToggle: document.getElementById('themeToggle'),
    startCameraBtn: document.getElementById('startCameraBtn'),
    stopCameraBtn: document.getElementById('stopCameraBtn'),
    barcodeInput: document.getElementById('barcodeInput'),
    manualSearchForm: document.getElementById('manualSearchForm'),
    cameraView: document.getElementById('cameraView'),
    loadingState: document.getElementById('loadingState'),
    productContent: document.getElementById('productContent'),
    productSection: document.getElementById('productSection'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage')
};

document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    attachEventListeners();
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
    elements.manualSearchForm.addEventListener('submit', handleManualSearch);
}

function handleManualSearch() {
    const barcode = elements.barcodeInput.value.trim();
    if (!/^\d{8,13}$/.test(barcode)) {
        showToast('Please enter a valid 8 to 13 digit barcode');
        return;
    }
    fetchProductData(barcode);
}

// Keeping your original Quagga logic intact, adding safe-stop error handling
function startBarcodeScanner() {
    elements.cameraView.style.display = 'flex';
    APP_STATE.isScanning = true;
    
    Quagga.init({
        inputStream: { name: "Live", type: "LiveStream", target: document.querySelector('#barcode-scanner'), constraints: { facingMode: "environment" } },
        decoder: { readers: ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader"] }
    }, (err) => {
        if (err) {
            console.error(err);
            showToast('Camera access denied. Please check permissions.');
            stopBarcodeScanner();
            return;
        }
        Quagga.start();
    });

    Quagga.onDetected((result) => {
        if (APP_STATE.isScanning) {
            const barcode = result.codeResult.code;
            if (navigator.vibrate) navigator.vibrate(200);
            stopBarcodeScanner();
            elements.barcodeInput.value = barcode;
            fetchProductData(barcode);
        }
    });
}

function stopBarcodeScanner() {
    APP_STATE.isScanning = false;
    Quagga.stop();
    elements.cameraView.style.display = 'none';
}

async function fetchProductData(barcode) {
    elements.loadingState.style.display = 'block';
    elements.productContent.innerHTML = '';
    
    try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
        const data = await response.json();
        
        if (data.status === 1 && data.product) {
            // Reusing your original display logic here
            displayProduct(data.product);
        } else {
            showToast('Product not found in database.');
            elements.loadingState.style.display = 'none';
        }
    } catch (error) {
        showToast('Network error. Try again later.');
        elements.loadingState.style.display = 'none';
    }
}

function displayProduct(product) {
    elements.loadingState.style.display = 'none';
    const nutriScore = product.nutriscore_grade ? product.nutriscore_grade.toUpperCase() : 'N/A';
    
    // Injecting a simplified modern layout based on your original data parsing
    elements.productContent.innerHTML = `
        <div class="ui-card">
            <h3>${product.product_name || 'Unknown Product'}</h3>
            <p><strong>Brand:</strong> ${product.brands || 'N/A'}</p>
            <p><strong>Nutri-Score:</strong> <span style="font-weight:bold; font-size:1.2rem;">${nutriScore}</span></p>
            ${product.image_url ? `<img src="${product.image_url}" alt="Product Image" style="max-width:200px; border-radius:12px; margin-top:1rem;">` : ''}
        </div>
    `;
    elements.productSection.scrollIntoView({ behavior: 'smooth' });
}

function showToast(message) {
    elements.toastMessage.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 3000);
}
